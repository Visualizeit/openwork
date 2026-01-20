import { IpcMain, dialog, app } from "electron"
import Store from "electron-store"
import * as fs from "fs/promises"
import * as path from "path"
import type { ModelConfig, SetApiKeyParams, UserModel } from "../types"
import { startWatching, stopWatching } from "../services/workspace-watcher"
import {
  getOpenworkDir,
  getApiKey,
  setApiKey,
  deleteApiKey,
  hasApiKey,
  getBaseUrl,
  setBaseUrl,
  getUserModels,
  addUserModel,
  deleteUserModel,
  setUserModels
} from "../storage"

// Store for non-sensitive settings only (no encryption needed)
const store = new Store({
  name: "settings",
  cwd: getOpenworkDir()
})

export function registerModelHandlers(ipcMain: IpcMain): void {
  // List user-configured models
  ipcMain.handle("models:list", async () => {
    const hasKey = hasApiKey()
    const userModels = getUserModels()

    return userModels.map(
      (model): ModelConfig => ({
        id: model.id,
        name: model.name,
        model: model.modelId,
        description: model.description,
        available: hasKey
      })
    )
  })

  // Get default model
  ipcMain.handle("models:getDefault", async () => {
    const userModels = getUserModels()
    const defaultModel = userModels.find((m) => m.isDefault)
    return defaultModel?.id || (store.get("defaultModel", null) as string | null)
  })

  // Set default model
  ipcMain.handle("models:setDefault", async (_event, modelId: string) => {
    store.set("defaultModel", modelId)
    // Also update isDefault flag in user models
    const models = getUserModels()
    const updated = models.map((m) => ({ ...m, isDefault: m.id === modelId }))
    setUserModels(updated)
  })

  // Set API key (simplified - single provider)
  ipcMain.handle("models:setApiKey", async (_event, { apiKey }: SetApiKeyParams) => {
    setApiKey(apiKey)
  })

  // Get API key
  ipcMain.handle("models:getApiKey", async () => {
    return getApiKey() ?? null
  })

  // Delete API key
  ipcMain.handle("models:deleteApiKey", async () => {
    deleteApiKey()
  })

  // Check if API key exists
  ipcMain.handle("models:hasApiKey", async () => {
    return hasApiKey()
  })

  // Get base URL
  ipcMain.handle("models:getBaseUrl", async () => {
    return getBaseUrl()
  })

  // Set base URL
  ipcMain.handle("models:setBaseUrl", async (_event, url: string) => {
    setBaseUrl(url)
  })

  // Add user model
  ipcMain.handle("models:addModel", async (_event, model: UserModel) => {
    addUserModel(model)
  })

  // Delete user model
  ipcMain.handle("models:deleteModel", async (_event, modelId: string) => {
    deleteUserModel(modelId)
  })

  // Get all user models
  ipcMain.handle("models:getUserModels", async () => {
    return getUserModels()
  })

  // Sync version info
  ipcMain.on("app:version", (event) => {
    event.returnValue = app.getVersion()
  })

  // Get workspace path for a thread (from thread metadata)
  ipcMain.handle("workspace:get", async (_event, threadId?: string) => {
    if (!threadId) {
      // Fallback to global setting for backwards compatibility
      return store.get("workspacePath", null) as string | null
    }

    // Get from thread metadata via threads:get
    const { getThread } = await import("../db")
    const thread = getThread(threadId)
    if (!thread?.metadata) return null

    const metadata = JSON.parse(thread.metadata)
    return metadata.workspacePath || null
  })

  // Set workspace path for a thread (stores in thread metadata)
  ipcMain.handle(
    "workspace:set",
    async (
      _event,
      { threadId, path: newPath }: { threadId?: string; path: string | null }
    ) => {
      if (!threadId) {
        // Fallback to global setting
        if (newPath) {
          store.set("workspacePath", newPath)
        } else {
          store.delete("workspacePath")
        }
        return newPath
      }

      const { getThread, updateThread } = await import("../db")
      const thread = getThread(threadId)
      if (!thread) return null

      const metadata = thread.metadata ? JSON.parse(thread.metadata) : {}
      metadata.workspacePath = newPath
      updateThread(threadId, { metadata: JSON.stringify(metadata) })

      // Update file watcher
      if (newPath) {
        startWatching(threadId, newPath)
      } else {
        stopWatching(threadId)
      }

      return newPath
    }
  )

  // Select workspace folder via dialog (for a specific thread)
  ipcMain.handle("workspace:select", async (_event, threadId?: string) => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
      title: "Select Workspace Folder",
      message: "Choose a folder for the agent to work in"
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const selectedPath = result.filePaths[0]

    if (threadId) {
      const { getThread, updateThread } = await import("../db")
      const thread = getThread(threadId)
      if (thread) {
        const metadata = thread.metadata ? JSON.parse(thread.metadata) : {}
        metadata.workspacePath = selectedPath
        updateThread(threadId, { metadata: JSON.stringify(metadata) })

        // Start watching the new workspace
        startWatching(threadId, selectedPath)
      }
    } else {
      // Fallback to global
      store.set("workspacePath", selectedPath)
    }

    return selectedPath
  })

  // Load files from disk into the workspace view
  ipcMain.handle(
    "workspace:loadFromDisk",
    async (_event, { threadId }: { threadId: string }) => {
      const { getThread } = await import("../db")

      // Get workspace path from thread metadata
      const thread = getThread(threadId)
      const metadata = thread?.metadata ? JSON.parse(thread.metadata) : {}
      const workspacePath = metadata.workspacePath as string | null

      if (!workspacePath) {
        return { success: false, error: "No workspace folder linked", files: [] }
      }

      try {
        const files: Array<{
          path: string
          is_dir: boolean
          size?: number
          modified_at?: string
        }> = []

        // Recursively read directory
        async function readDir(dirPath: string, relativePath: string = ""): Promise<void> {
          const entries = await fs.readdir(dirPath, { withFileTypes: true })

          for (const entry of entries) {
            // Skip hidden files and common non-project files
            if (entry.name.startsWith(".") || entry.name === "node_modules") {
              continue
            }

            const fullPath = path.join(dirPath, entry.name)
            const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name

            if (entry.isDirectory()) {
              files.push({
                path: "/" + relPath,
                is_dir: true
              })
              await readDir(fullPath, relPath)
            } else {
              const stat = await fs.stat(fullPath)
              files.push({
                path: "/" + relPath,
                is_dir: false,
                size: stat.size,
                modified_at: stat.mtime.toISOString()
              })
            }
          }
        }

        await readDir(workspacePath)

        // Start watching for file changes
        startWatching(threadId, workspacePath)

        return {
          success: true,
          files,
          workspacePath
        }
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : "Unknown error",
          files: []
        }
      }
    }
  )

  // Read a single file's contents from disk
  ipcMain.handle(
    "workspace:readFile",
    async (_event, { threadId, filePath }: { threadId: string; filePath: string }) => {
      const { getThread } = await import("../db")

      // Get workspace path from thread metadata
      const thread = getThread(threadId)
      const metadata = thread?.metadata ? JSON.parse(thread.metadata) : {}
      const workspacePath = metadata.workspacePath as string | null

      if (!workspacePath) {
        return {
          success: false,
          error: "No workspace folder linked"
        }
      }

      try {
        // Convert virtual path to full disk path
        const relativePath = filePath.startsWith("/") ? filePath.slice(1) : filePath
        const fullPath = path.join(workspacePath, relativePath)

        // Security check: ensure the resolved path is within the workspace
        const resolvedPath = path.resolve(fullPath)
        const resolvedWorkspace = path.resolve(workspacePath)
        if (!resolvedPath.startsWith(resolvedWorkspace)) {
          return { success: false, error: "Access denied: path outside workspace" }
        }

        // Check if file exists
        const stat = await fs.stat(fullPath)
        if (stat.isDirectory()) {
          return { success: false, error: "Cannot read directory as file" }
        }

        // Read file contents
        const content = await fs.readFile(fullPath, "utf-8")

        return {
          success: true,
          content,
          size: stat.size,
          modified_at: stat.mtime.toISOString()
        }
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : "Unknown error"
        }
      }
    }
  )

  // Read a binary file (images, PDFs, etc.) and return as base64
  ipcMain.handle(
    "workspace:readBinaryFile",
    async (_event, { threadId, filePath }: { threadId: string; filePath: string }) => {
      const { getThread } = await import("../db")

      // Get workspace path from thread metadata
      const thread = getThread(threadId)
      const metadata = thread?.metadata ? JSON.parse(thread.metadata) : {}
      const workspacePath = metadata.workspacePath as string | null

      if (!workspacePath) {
        return {
          success: false,
          error: "No workspace folder linked"
        }
      }

      try {
        // Convert virtual path to full disk path
        const relativePath = filePath.startsWith("/") ? filePath.slice(1) : filePath
        const fullPath = path.join(workspacePath, relativePath)

        // Security check: ensure the resolved path is within the workspace
        const resolvedPath = path.resolve(fullPath)
        const resolvedWorkspace = path.resolve(workspacePath)
        if (!resolvedPath.startsWith(resolvedWorkspace)) {
          return { success: false, error: "Access denied: path outside workspace" }
        }

        // Check if file exists
        const stat = await fs.stat(fullPath)
        if (stat.isDirectory()) {
          return { success: false, error: "Cannot read directory as file" }
        }

        // Read file as binary and convert to base64
        const buffer = await fs.readFile(fullPath)
        const base64 = buffer.toString("base64")

        return {
          success: true,
          content: base64,
          size: stat.size,
          modified_at: stat.mtime.toISOString()
        }
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : "Unknown error"
        }
      }
    }
  )
}

// Re-export getApiKey from storage for use in agent runtime
export { getApiKey, getBaseUrl, getUserModels } from "../storage"

export function getDefaultModel(): string | null {
  const userModels = getUserModels()
  const defaultModel = userModels.find((m) => m.isDefault)
  return defaultModel?.id || (store.get("defaultModel", null) as string | null)
}
