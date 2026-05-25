/**
 * Configuration module - centralizes all environment and constant configuration
 */
import { resolve } from "path";
import { existsSync, mkdirSync, cpSync } from "fs";

// Configuration - loads from .env file automatically (Bun feature)
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || resolve(import.meta.dir, "../workspaces/default");
const STAGE_DIR = process.env.STAGE_DIR || "stage";
const SHADOW_DIR = process.env.SHADOW_DIR || "shadow";

export const CONFIG = {
  WS_PORT: parseInt(process.env.WS_PORT || "3000"),
  VITE_PORT: parseInt(process.env.VITE_PORT || "3001"),
  WORKSPACE_DIR: process.env.WORKSPACE_DIR || resolve(WORKSPACE_ROOT, STAGE_DIR),
  WORKSPACE_ROOT,
  STAGE_PATH: resolve(WORKSPACE_ROOT, STAGE_DIR),
  SHADOW_PATH: resolve(WORKSPACE_ROOT, SHADOW_DIR),
  VITE_BIN: process.env.VITE_BIN || "bunx",
  CLAUDE_CMD: process.env.CLAUDE_CMD || "claude",
  TERM_ROWS: 24,
  TERM_COLS: 80,
  SCROLLBACK: 10000,
  LOG_DIR: process.env.LOG_DIR || resolve(import.meta.dir, "../logs"),
} as const;

// Ensure workspace directory exists
if (!existsSync(CONFIG.WORKSPACE_DIR)) {
  mkdirSync(CONFIG.WORKSPACE_DIR, { recursive: true });
}

// Copy .claude skills from project root to workspace
const PROJECT_CLAUDE_DIR = resolve(import.meta.dir, "../../.claude");
const WORKSPACE_CLAUDE_DIR = resolve(CONFIG.WORKSPACE_DIR, ".claude");

if (existsSync(PROJECT_CLAUDE_DIR) && !existsSync(WORKSPACE_CLAUDE_DIR)) {
  try {
    cpSync(PROJECT_CLAUDE_DIR, WORKSPACE_CLAUDE_DIR, { recursive: true });
    console.log(`[Setup] Copied .claude skills to ${WORKSPACE_CLAUDE_DIR}`);
  } catch (err) {
    console.warn(`[Setup] Failed to copy .claude: ${err}`);
  }
}
