import { homedir } from "os"
import { join } from "path"
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "fs"
import type { UserModel } from "./types"

const OPENWORK_DIR = join(homedir(), ".openwork")
const ENV_FILE = join(OPENWORK_DIR, ".env")
const USER_MODELS_FILE = join(OPENWORK_DIR, "user-models.json")

// Environment variable names
const OPENAI_API_KEY = "OPENAI_API_KEY"
const OPENAI_BASE_URL = "OPENAI_BASE_URL"
const DEFAULT_BASE_URL = "https://api.openai.com/v1"

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

export function getEnvFilePath(): string {
  return ENV_FILE
}

// Read .env file and parse into object
function parseEnvFile(): Record<string, string> {
  const envPath = getEnvFilePath()
  if (!existsSync(envPath)) return {}

  const content = readFileSync(envPath, "utf-8")
  const result: Record<string, string> = {}

  for (const line of content.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eqIndex = trimmed.indexOf("=")
    if (eqIndex > 0) {
      const key = trimmed.slice(0, eqIndex).trim()
      const value = trimmed.slice(eqIndex + 1).trim()
      result[key] = value
    }
  }
  return result
}

// Write object back to .env file
function writeEnvFile(env: Record<string, string>): void {
  getOpenworkDir() // ensure dir exists
  const lines = Object.entries(env)
    .filter((entry) => entry[1])
    .map(([k, v]) => `${k}=${v}`)
  writeFileSync(getEnvFilePath(), lines.join("\n") + "\n")
}

// =============================================================================
// API Key Management (simplified - single OpenAI-compatible endpoint)
// =============================================================================

export function getApiKey(): string | undefined {
  // Check .env file first
  const env = parseEnvFile()
  if (env[OPENAI_API_KEY]) return env[OPENAI_API_KEY]

  // Fall back to process environment
  return process.env[OPENAI_API_KEY]
}

export function setApiKey(apiKey: string): void {
  const env = parseEnvFile()
  env[OPENAI_API_KEY] = apiKey
  writeEnvFile(env)

  // Also set in process.env for current session
  process.env[OPENAI_API_KEY] = apiKey
}

export function deleteApiKey(): void {
  const env = parseEnvFile()
  delete env[OPENAI_API_KEY]
  writeEnvFile(env)

  // Also clear from process.env
  delete process.env[OPENAI_API_KEY]
}

export function hasApiKey(): boolean {
  return !!getApiKey()
}

// =============================================================================
// Base URL Management
// =============================================================================

export function getBaseUrl(): string {
  // Check .env file first
  const env = parseEnvFile()
  if (env[OPENAI_BASE_URL]) return env[OPENAI_BASE_URL]

  // Fall back to process environment, then default
  return process.env[OPENAI_BASE_URL] || DEFAULT_BASE_URL
}

export function setBaseUrl(url: string): void {
  const env = parseEnvFile()
  env[OPENAI_BASE_URL] = url
  writeEnvFile(env)

  // Also set in process.env for current session
  process.env[OPENAI_BASE_URL] = url
}

// =============================================================================
// User Models Management
// =============================================================================

export function getUserModels(): UserModel[] {
  if (!existsSync(USER_MODELS_FILE)) return []
  try {
    const content = readFileSync(USER_MODELS_FILE, "utf-8")
    return JSON.parse(content) as UserModel[]
  } catch {
    return []
  }
}

export function setUserModels(models: UserModel[]): void {
  getOpenworkDir() // ensure dir exists
  writeFileSync(USER_MODELS_FILE, JSON.stringify(models, null, 2))
}

export function addUserModel(model: UserModel): void {
  const models = getUserModels()
  const existingIndex = models.findIndex((m) => m.id === model.id)
  if (existingIndex >= 0) {
    models[existingIndex] = model
  } else {
    models.push(model)
  }
  setUserModels(models)
}

export function deleteUserModel(modelId: string): void {
  const models = getUserModels().filter((m) => m.id !== modelId)
  setUserModels(models)
}
