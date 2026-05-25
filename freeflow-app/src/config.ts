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
  CLAUDE_CMD: process.env.CLAUDE_CMD || "claude",
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
 * Copy .claude skills to workspace if not present
 */
export function copyClaudeSkills(workspaceId: string, type: "named" | "session" = "named") {
  const paths = getWorkspacePaths(workspaceId, type);
  const PROJECT_CLAUDE_DIR = resolve(import.meta.dir, "../../.claude");
  const WORKSPACE_CLAUDE_DIR = join(paths.stagePath, ".claude");
  const SHADOW_CLAUDE_DIR = join(paths.shadowPath, ".claude");

  if (existsSync(PROJECT_CLAUDE_DIR)) {
    if (!existsSync(WORKSPACE_CLAUDE_DIR)) {
      try {
        cpSync(PROJECT_CLAUDE_DIR, WORKSPACE_CLAUDE_DIR, { recursive: true });
        console.log(`[Setup] Copied .claude skills to ${WORKSPACE_CLAUDE_DIR}`);
      } catch (err) {
        console.warn(`[Setup] Failed to copy .claude to stage: ${err}`);
      }
    }
    if (!existsSync(SHADOW_CLAUDE_DIR)) {
      try {
        cpSync(PROJECT_CLAUDE_DIR, SHADOW_CLAUDE_DIR, { recursive: true });
      } catch (err) {
        console.warn(`[Setup] Failed to copy .claude to shadow: ${err}`);
      }
    }
  }
}

// Ensure default workspace exists on startup
ensureWorkspace(CONFIG.DEFAULT_WORKSPACE, "named");
copyClaudeSkills(CONFIG.DEFAULT_WORKSPACE, "named");
