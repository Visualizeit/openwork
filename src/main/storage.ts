import { homedir } from "os"
import { join } from "path"
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "fs"
import { consola } from "consola"
import { z } from "zod"
import type { UserModel } from "./types"

const OPENWORK_DIR = join(homedir(), ".openwork")
const CONFIG_FILE = join(OPENWORK_DIR, "config.json")
const DEFAULT_BASE_URL = "https://api.openai.com/v1"

// Zod schema for UserModel
const UserModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  modelId: z.string(),
  description: z.string().optional(),
  isDefault: z.boolean().optional()
})

// Zod schema for config file with catch defaults
const OpenworkConfigSchema = z
  .object({
    apiKey: z.string().optional(),
    baseUrl: z.string().optional(),
    models: z.array(UserModelSchema).catch([])
  })
  .catch({ models: [] })

type OpenworkConfig = z.infer<typeof OpenworkConfigSchema>

export function getOpenworkDir(): string {
  if (!existsSync(OPENWORK_DIR)) {
    mkdirSync(OPENWORK_DIR, { recursive: true })
  }
  return OPENWORK_DIR
}

export function getDbPath(): string {
  return join(getOpenworkDir(), "openwork.sqlite")
}

export function getCheckpointDbPath(): string {
  return join(getOpenworkDir(), "langgraph.sqlite")
}

export function getThreadCheckpointDir(): string {
  const dir = join(getOpenworkDir(), "threads")
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

export function getThreadCheckpointPath(threadId: string): string {
  return join(getThreadCheckpointDir(), `${threadId}.sqlite`)
}

export function deleteThreadCheckpoint(threadId: string): void {
  const path = getThreadCheckpointPath(threadId)
  if (existsSync(path)) {
    unlinkSync(path)
  }
}

// Read config from JSON file with zod validation
function readConfig(): OpenworkConfig {
  if (!existsSync(CONFIG_FILE)) {
    return { models: [] }
  }
  try {
    const content = readFileSync(CONFIG_FILE, "utf-8")
    const json = JSON.parse(content)
    const config = OpenworkConfigSchema.parse(json)
    consola.debug("[Storage] Read config:", {
      hasApiKey: !!config.apiKey,
      baseUrl: config.baseUrl,
      modelCount: config.models.length
    })
    return config
  } catch (error) {
    consola.error("[Storage] Failed to read config:", error)
    return { models: [] }
  }
}

// Write config to JSON file
function writeConfig(config: OpenworkConfig): void {
  getOpenworkDir() // ensure dir exists
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2))
  consola.debug("[Storage] Wrote config:", { hasApiKey: !!config.apiKey, baseUrl: config.baseUrl, modelCount: config.models?.length ?? 0 })
}

// =============================================================================
// API Key Management
// =============================================================================

export function getApiKey(): string | undefined {
  const config = readConfig()
  return config.apiKey
}

export function setApiKey(apiKey: string): void {
  const config = readConfig()
  config.apiKey = apiKey
  writeConfig(config)
}

export function deleteApiKey(): void {
  const config = readConfig()
  delete config.apiKey
  writeConfig(config)
}

export function hasApiKey(): boolean {
  return !!getApiKey()
}

// =============================================================================
// Base URL Management
// =============================================================================

export function getBaseUrl(): string {
  const config = readConfig()
  return config.baseUrl || DEFAULT_BASE_URL
}

export function setBaseUrl(url: string): void {
  const config = readConfig()
  config.baseUrl = url
  writeConfig(config)
}

// =============================================================================
// User Models Management
// =============================================================================

export function getUserModels(): UserModel[] {
  const config = readConfig()
  return config.models || []
}

export function setUserModels(models: UserModel[]): void {
  const config = readConfig()
  config.models = models
  writeConfig(config)
}

export function addUserModel(model: UserModel): void {
  const config = readConfig()
  const models = config.models || []
  const existingIndex = models.findIndex((m) => m.id === model.id)
  if (existingIndex >= 0) {
    models[existingIndex] = model
  } else {
    models.push(model)
  }
  config.models = models
  writeConfig(config)
}

export function deleteUserModel(modelId: string): void {
  const config = readConfig()
  config.models = (config.models || []).filter((m) => m.id !== modelId)
  writeConfig(config)
}
