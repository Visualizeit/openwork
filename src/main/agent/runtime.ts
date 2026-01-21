/* eslint-disable @typescript-eslint/no-unused-vars */
import { createDeepAgent, createSkillsMiddleware, listSkills } from "deepagents"
import { getDefaultModel, getApiKey, getBaseUrl, getUserModels } from "../ipc/models"
import { getThreadCheckpointPath } from "../storage"
import { join } from "path"
import { ChatOpenAI } from "@langchain/openai"
import { SqlJsSaver } from "../checkpointer/sqljs-saver"
import { LocalSandbox } from "./local-sandbox"
import { MultiServerMCPClient } from "@langchain/mcp-adapters"
import type { DynamicStructuredTool } from "@langchain/core/tools"
import { consola } from "consola"

import type * as _lcTypes from "langchain"
import type * as _lcMessages from "@langchain/core/messages"
import type * as _lcLanggraph from "@langchain/langgraph"
import type * as _lcZodTypes from "@langchain/core/utils/types"

import { BASE_SYSTEM_PROMPT } from "./system-prompt"

// MCP server configurations (hardcoded)
const MCP_SERVERS = {
  exa: {
    url: "https://mcp.exa.ai/mcp",
    transport: "http" as const
  },
  // "sinafinance-http": {
  //   url: "http://mcp.finance.sina.com.cn/mcp-http",
  //   transport: "http" as const,
  //   headers: {
  //     "X-Auth-Token": "71ce037c7ce173113e6051cda79d68f1"
  //   }
  // },
  "stargate-yingmi": {
    url: "https://stargate.yingmi.com/mcp/sse?apiKey=lpu8Kv0OuZR2L9AHt0EOWg",
    transport: "sse" as const
  }
}

// Global MCP client instance
let mcpClient: MultiServerMCPClient | null = null
let mcpTools: DynamicStructuredTool[] = []

// Initialize MCP connection (called on app startup)
export async function initMCP(): Promise<void> {
  try {
    mcpClient = new MultiServerMCPClient(MCP_SERVERS)

    mcpTools = await mcpClient.getTools()
    consola.success("[MCP] Connected to multiple servers:", Object.keys(MCP_SERVERS))
    consola.info(
      "[MCP] Available tools:",
      mcpTools.map((t) => t.name)
    )
  } catch (error) {
    consola.error("[MCP] Failed to connect:", error)
    mcpClient = null
    mcpTools = []
  }
}

// Close MCP connection
export async function closeMCP(): Promise<void> {
  if (mcpClient) {
    await mcpClient.close()
    mcpClient = null
    mcpTools = []
    consola.info("[MCP] Disconnected")
  }
}

/**
 * Generate the full system prompt for the agent.
 *
 * @param workspacePath - The workspace path the agent is operating in
 * @returns The complete system prompt
 */
function getSystemPrompt(workspacePath: string): string {
  const workingDirSection = `
### File System and Paths

**IMPORTANT - Path Handling:**
- All file paths use fully qualified absolute system paths
- The workspace root is: \`${workspacePath}\`
- Example: \`${workspacePath}/src/index.ts\`, \`${workspacePath}/README.md\`
- To list the workspace root, use \`ls("${workspacePath}")\`
- Always use full absolute paths for all file operations
`

  return workingDirSection + BASE_SYSTEM_PROMPT
}

// Per-thread checkpointer cache
const checkpointers = new Map<string, SqlJsSaver>()

export async function getCheckpointer(threadId: string): Promise<SqlJsSaver> {
  let checkpointer = checkpointers.get(threadId)
  if (!checkpointer) {
    const dbPath = getThreadCheckpointPath(threadId)
    checkpointer = new SqlJsSaver(dbPath)
    await checkpointer.initialize()
    checkpointers.set(threadId, checkpointer)
  }
  return checkpointer
}

export async function closeCheckpointer(threadId: string): Promise<void> {
  const checkpointer = checkpointers.get(threadId)
  if (checkpointer) {
    await checkpointer.close()
    checkpointers.delete(threadId)
  }
}

// Get the model instance using OpenAI-compatible API
function getModelInstance(modelId?: string): ChatOpenAI {
  const apiKey = getApiKey()
  const baseUrl = getBaseUrl()

  if (!apiKey) {
    throw new Error("API key not configured. Please add your API key in settings.")
  }

  // Determine actual model ID
  let actualModelId: string

  if (modelId) {
    // Look up user model configuration
    const userModels = getUserModels()
    const userModel = userModels.find((m) => m.id === modelId)
    actualModelId = userModel?.modelId || modelId
  } else {
    // Use default model
    const defaultId = getDefaultModel()
    if (!defaultId) {
      throw new Error("No default model configured. Please add a model in settings.")
    }
    const userModels = getUserModels()
    const defaultModel = userModels.find((m) => m.id === defaultId)
    actualModelId = defaultModel?.modelId || defaultId
  }

  consola.info("[Runtime] Using model:", actualModelId)
  consola.info("[Runtime] Base URL:", baseUrl)
  consola.info("[Runtime] API key present:", !!apiKey)

  return new ChatOpenAI({
    model: actualModelId,
    openAIApiKey: apiKey,
    configuration: {
      baseURL: baseUrl,
      apiKey: apiKey
    }
  })
}

export interface CreateAgentRuntimeOptions {
  /** Thread ID - REQUIRED for per-thread checkpointing */
  threadId: string
  /** Model ID to use (defaults to configured default model) */
  modelId?: string
  /** Workspace path - REQUIRED for agent to operate on files */
  workspacePath: string
}

// Create agent runtime with configured model and checkpointer
export type AgentRuntime = ReturnType<typeof createDeepAgent>

export async function createAgentRuntime(options: CreateAgentRuntimeOptions) {
  const { threadId, modelId, workspacePath } = options

  if (!threadId) {
    throw new Error("Thread ID is required for checkpointing.")
  }

  if (!workspacePath) {
    throw new Error(
      "Workspace path is required. Please select a workspace folder before running the agent."
    )
  }

  consola.info("[Runtime] Creating agent runtime...")
  consola.info("[Runtime] Thread ID:", threadId)
  consola.info("[Runtime] Workspace path:", workspacePath)

  const model = getModelInstance(modelId)
  consola.info("[Runtime] Model instance created:", typeof model)

  const checkpointer = await getCheckpointer(threadId)
  consola.info("[Runtime] Checkpointer ready for thread:", threadId)

  const backend = new LocalSandbox({
    rootDir: workspacePath,
    virtualMode: false, // Use absolute system paths for consistency with shell commands
    timeout: 120_000, // 2 minutes
    maxOutputBytes: 100_000 // ~100KB
  })

  const systemPrompt = getSystemPrompt(workspacePath)

  // Custom filesystem prompt for absolute paths (matches virtualMode: false)
  const filesystemSystemPrompt = `You have access to a filesystem. All file paths use fully qualified absolute system paths.

- ls: list files in a directory (e.g., ls("${workspacePath}"))
- read_file: read a file from the filesystem
- write_file: write to a file in the filesystem
- edit_file: edit a file in the filesystem
- glob: find files matching a pattern (e.g., "**/*.py")
- grep: search for text within files

The workspace root is: ${workspacePath}`

  // Skills configuration (built-in only)
  const skillsDir = join(__dirname, "skills")
  const skills = listSkills({ userSkillsDir: skillsDir })
  consola.info("[Runtime] Skills dir:", skillsDir)
  consola.info(
    "[Runtime] Available skills:",
    skills.map((s) => s.name)
  )

  const skillsMiddleware = createSkillsMiddleware({
    backend: backend,
    sources: [skillsDir]
  })

  const agent = createDeepAgent({
    model,
    checkpointer,
    backend,
    systemPrompt,
    // Custom filesystem prompt for absolute paths (requires deepagents update)
    filesystemSystemPrompt,
    // Require human approval for all shell commands
    interruptOn: { execute: true },
    // MCP tools (auto-execute, no HITL required)
    tools: mcpTools.length > 0 ? mcpTools : undefined,
    // Skills middleware
    middleware: [skillsMiddleware]
  } as Parameters<typeof createDeepAgent>[0])

  consola.success("[Runtime] Deep agent created with LocalSandbox at:", workspacePath)
  return agent
}

export type DeepAgent = ReturnType<typeof createDeepAgent>

// Clean up all checkpointer resources
export async function closeRuntime(): Promise<void> {
  const closePromises = Array.from(checkpointers.values()).map((cp) => cp.close())
  await Promise.all(closePromises)
  checkpointers.clear()
}
