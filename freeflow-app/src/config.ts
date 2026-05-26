/**
 * Configuration module - centralizes all environment and constant configuration
 */
import { resolve, join } from "path";
import { existsSync, mkdirSync, cpSync } from "fs";

// Configuration - loads from .env file automatically (Bun feature)
const WORKSPACES_ROOT = process.env.WORKSPACES_ROOT || resolve(import.meta.dir, "../../workspaces");
const STAGE_DIR = process.env.STAGE_DIR || "stage";
const SHADOW_DIR = process.env.SHADOW_DIR || "shadow";
const SESSIONS_DIR = "sessions";

export const CONFIG = {
  WS_PORT: parseInt(process.env.WS_PORT || "3000"),
  WORKSPACES_ROOT,
  STAGE_DIR,
  SHADOW_DIR,
  SESSIONS_DIR,
  SESSIONS_PATH: join(WORKSPACES_ROOT, SESSIONS_DIR),
  DEFAULT_WORKSPACE: process.env.DEFAULT_WORKSPACE || "default",
  AGENT_CLI_CMD: process.env.AGENT_CLI_CMD || "claude",
  TERM_ROWS: 24,
  TERM_COLS: 80,
  SCROLLBACK: 10000,
  LOG_DIR: process.env.LOG_DIR || resolve(import.meta.dir, "../logs"),
} as const;

/**
 * Get workspace paths for a given workspace ID
 */
export function getWorkspacePaths(workspaceId: string, type: "named" | "session" = "named") {
  const basePath = type === "session"
    ? join(CONFIG.WORKSPACES_ROOT, CONFIG.SESSIONS_DIR, workspaceId)
    : join(CONFIG.WORKSPACES_ROOT, workspaceId);

  return {
    basePath,
    stagePath: join(basePath, STAGE_DIR),
    shadowPath: join(basePath, SHADOW_DIR),
  };
}

/**
 * Ensure workspace directories exist
 */
export function ensureWorkspace(workspaceId: string, type: "named" | "session" = "named") {
  const paths = getWorkspacePaths(workspaceId, type);

  if (!existsSync(paths.stagePath)) {
    mkdirSync(paths.stagePath, { recursive: true });
  }
  if (!existsSync(paths.shadowPath)) {
    mkdirSync(paths.shadowPath, { recursive: true });
  }

  return paths;
}

/**
 * Copy .claude skills from template to workspace if not present
 * Only copies to workspace root, NOT to stage/ or shadow/
 */
export function copyAgentSkills(workspaceId: string, type: "named" | "session" = "named") {
  const paths = getWorkspacePaths(workspaceId, type);
  const TEMPLATE_CLAUDE_DIR = resolve(import.meta.dir, "../../template/default/.claude");
  const WORKSPACE_CLAUDE_DIR = join(paths.basePath, ".claude");

  if (existsSync(TEMPLATE_CLAUDE_DIR) && !existsSync(WORKSPACE_CLAUDE_DIR)) {
    try {
      cpSync(TEMPLATE_CLAUDE_DIR, WORKSPACE_CLAUDE_DIR, { recursive: true });
      console.log(`[Setup] Copied .claude skills from template to ${WORKSPACE_CLAUDE_DIR}`);
    } catch (err) {
      console.warn(`[Setup] Failed to copy .claude to workspace: ${err}`);
    }
  }
}

// Ensure default workspace exists on startup
ensureWorkspace(CONFIG.DEFAULT_WORKSPACE, "named");
copyAgentSkills(CONFIG.DEFAULT_WORKSPACE, "named");
