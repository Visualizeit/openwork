import { create } from "zustand"
import type { Thread, ModelConfig, UserModel } from "@/types"

interface AppState {
  // Threads
  threads: Thread[]
  currentThreadId: string | null

  // Models (global, not per-thread)
  models: ModelConfig[]
  hasApiKey: boolean
  baseUrl: string

  // Right panel state (UI state, not thread data)
  rightPanelTab: "todos" | "files" | "subagents"

  // Settings dialog state
  settingsOpen: boolean

  // Sidebar state
  sidebarCollapsed: boolean

  // Thread actions
  loadThreads: () => Promise<void>
  createThread: (metadata?: Record<string, unknown>) => Promise<Thread>
  selectThread: (threadId: string) => Promise<void>
  deleteThread: (threadId: string) => Promise<void>
  updateThread: (threadId: string, updates: Partial<Thread>) => Promise<void>
  generateTitleForFirstMessage: (threadId: string, content: string) => Promise<void>

  // Model actions (simplified - single OpenAI-compatible endpoint)
  loadModels: () => Promise<void>
  setApiKey: (apiKey: string) => Promise<void>
  deleteApiKey: () => Promise<void>
  setBaseUrl: (url: string) => Promise<void>
  addModel: (model: UserModel) => Promise<void>
  deleteModel: (modelId: string) => Promise<void>
  setDefaultModel: (modelId: string) => Promise<void>

  // Panel actions
  setRightPanelTab: (tab: "todos" | "files" | "subagents") => void

  // Settings actions
  setSettingsOpen: (open: boolean) => void

  // Sidebar actions
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  threads: [],
  currentThreadId: null,
  models: [],
  hasApiKey: false,
  baseUrl: "https://api.openai.com/v1",
  rightPanelTab: "todos",
  settingsOpen: false,
  sidebarCollapsed: false,

  // Thread actions
  loadThreads: async () => {
    const threads = await window.api.threads.list()
    set({ threads })

    // Select first thread if none selected
    if (!get().currentThreadId && threads.length > 0) {
      await get().selectThread(threads[0].thread_id)
    }
  },

  createThread: async (metadata?: Record<string, unknown>) => {
    const thread = await window.api.threads.create(metadata)
    set((state) => ({
      threads: [thread, ...state.threads],
      currentThreadId: thread.thread_id
    }))
    return thread
  },

  selectThread: async (threadId: string) => {
    // Just update currentThreadId - ThreadContext handles per-thread state
    set({ currentThreadId: threadId })
  },

  deleteThread: async (threadId: string) => {
    console.log("[Store] Deleting thread:", threadId)
    try {
      await window.api.threads.delete(threadId)
      console.log("[Store] Thread deleted from backend")

      set((state) => {
        const threads = state.threads.filter((t) => t.thread_id !== threadId)
        const wasCurrentThread = state.currentThreadId === threadId
        const newCurrentId = wasCurrentThread
          ? threads[0]?.thread_id || null
          : state.currentThreadId

        return {
          threads,
          currentThreadId: newCurrentId
        }
      })
    } catch (error) {
      console.error("[Store] Failed to delete thread:", error)
    }
  },

  updateThread: async (threadId: string, updates: Partial<Thread>) => {
    const updated = await window.api.threads.update(threadId, updates)
    set((state) => ({
      threads: state.threads.map((t) => (t.thread_id === threadId ? updated : t))
    }))
  },

  generateTitleForFirstMessage: async (threadId: string, content: string) => {
    try {
      const generatedTitle = await window.api.threads.generateTitle(content)
      await get().updateThread(threadId, { title: generatedTitle })
    } catch (error) {
      console.error("[Store] Failed to generate title:", error)
    }
  },

  // Model actions (simplified)
  loadModels: async () => {
    const models = await window.api.models.list()
    const hasKey = await window.api.models.hasApiKey()
    const baseUrl = await window.api.models.getBaseUrl()
    set({ models, hasApiKey: hasKey, baseUrl })
  },

  setApiKey: async (apiKey: string) => {
    console.log("[Store] setApiKey called, keyLength:", apiKey.length)
    try {
      await window.api.models.setApiKey(apiKey)
      console.log("[Store] API key saved via IPC")
      // Reload models to update availability
      await get().loadModels()
      console.log("[Store] Models reloaded")
    } catch (e) {
      console.error("[Store] Failed to set API key:", e)
      throw e
    }
  },

  deleteApiKey: async () => {
    await window.api.models.deleteApiKey()
    // Reload models to update availability
    await get().loadModels()
  },

  setBaseUrl: async (url: string) => {
    await window.api.models.setBaseUrl(url)
    set({ baseUrl: url })
  },

  addModel: async (model: UserModel) => {
    await window.api.models.addModel(model)
    await get().loadModels()
  },

  deleteModel: async (modelId: string) => {
    await window.api.models.deleteModel(modelId)
    await get().loadModels()
  },

  setDefaultModel: async (modelId: string) => {
    await window.api.models.setDefault(modelId)
    await get().loadModels()
  },

  // Panel actions
  setRightPanelTab: (tab: "todos" | "files" | "subagents") => {
    set({ rightPanelTab: tab })
  },

  // Settings actions
  setSettingsOpen: (open: boolean) => {
    set({ settingsOpen: open })
  },

  // Sidebar actions
  toggleSidebar: () => {
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }))
  },

  setSidebarCollapsed: (collapsed: boolean) => {
    set({ sidebarCollapsed: collapsed })
  }
}))
