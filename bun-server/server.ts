#!/usr/bin/env bun
/**
 * Freeflow Bun Server
 *
 * Architecture:
 * - WebSocket server for browser communication (Channel 1: chat, Channel 2: state sync)
 * - PTY manager for Claude Code process
 * - Vite spawner for playground (port 3001)
 * - File watcher for AI edits -> HMR trigger
 */

import { type ServerWebSocket, serve, type Subprocess } from "bun";
import { watch } from "chokidar";
import { join, resolve } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync, createWriteStream, cpSync } from "fs";

// Configuration - loads from .env file automatically (Bun feature)
// Copy .env to .env.local to override locally (gitignored)
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || resolve(import.meta.dir, "../workspaces/default");
const STAGE_DIR = process.env.STAGE_DIR || "stage";
const SHADOW_DIR = process.env.SHADOW_DIR || "shadow";

const CONFIG = {
  WS_PORT: parseInt(process.env.WS_PORT || "3000"),
  VITE_PORT: parseInt(process.env.VITE_PORT || "3001"),
  // Legacy fallback for backward compatibility
  WORKSPACE_DIR: process.env.WORKSPACE_DIR || resolve(WORKSPACE_ROOT, STAGE_DIR),
  // Workspace root (parent of stage and shadow)
  WORKSPACE_ROOT,
  // Stage: where Vite serves from (HMR active)
  STAGE_PATH: resolve(WORKSPACE_ROOT, STAGE_DIR),
  // Shadow: where AI edits (no HMR trigger)
  SHADOW_PATH: resolve(WORKSPACE_ROOT, SHADOW_DIR),
  VITE_BIN: process.env.VITE_BIN || "bunx",
  CLAUDE_CMD: process.env.CLAUDE_CMD || "claude",
  TERM_ROWS: 24,
  TERM_COLS: 80,
  SCROLLBACK: 10000,
  LOG_DIR: process.env.LOG_DIR || resolve(import.meta.dir, "./logs"),
};

// Ensure workspace directory exists
if (!existsSync(CONFIG.WORKSPACE_DIR)) {
  mkdirSync(CONFIG.WORKSPACE_DIR, { recursive: true });
}

// Logging setup
const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 } as const;
const LOG_LEVEL = LOG_LEVELS[(process.env.LOG_LEVEL?.toUpperCase() as keyof typeof LOG_LEVELS) || "INFO"];

if (!existsSync(CONFIG.LOG_DIR)) {
  mkdirSync(CONFIG.LOG_DIR, { recursive: true });
}

const logFileStream = createWriteStream(join(CONFIG.LOG_DIR, "server.log"), { flags: "a" });

function formatLog(level: string, msg: string): string {
  const ts = new Date().toISOString();
  return `[${ts}] [${level}] ${msg}`;
}

export function log(level: keyof typeof LOG_LEVELS, ...args: unknown[]) {
  const msg = args.map(a => typeof a === "string" ? a : JSON.stringify(a)).join(" ");
  const line = formatLog(level, msg);

  if (LOG_LEVELS[level] >= LOG_LEVEL) {
    console.log(line);
  }
  logFileStream.write(line + "\n");
}

export const logger = {
  debug: (...args: unknown[]) => log("DEBUG", ...args),
  info: (...args: unknown[]) => log("INFO", ...args),
  warn: (...args: unknown[]) => log("WARN", ...args),
  error: (...args: unknown[]) => log("ERROR", ...args),
};

// Copy .claude skills from project root to workspace (Option 3: project → workspace)
const PROJECT_CLAUDE_DIR = resolve(import.meta.dir, "../.claude");
const WORKSPACE_CLAUDE_DIR = join(CONFIG.WORKSPACE_DIR, ".claude");

if (existsSync(PROJECT_CLAUDE_DIR) && !existsSync(WORKSPACE_CLAUDE_DIR)) {
  try {
    cpSync(PROJECT_CLAUDE_DIR, WORKSPACE_CLAUDE_DIR, { recursive: true });
    logger.info(`[Setup] Copied .claude skills to ${WORKSPACE_CLAUDE_DIR}`);
  } catch (err) {
    logger.warn(`[Setup] Failed to copy .claude: ${err}`);
  }
}

// Types
type WebSocketData = {
  clientId: string;
  channels: Set<"chat" | "state">;
};

// DOM manipulation command (live commands)
type DomCommandAction =
  | "check"
  | "uncheck"
  | "setText"
  | "setHtml"
  | "prependHtml"
  | "appendHtml"
  | "insertBefore"
  | "insertAfter"
  | "setValue"
  | "setProperty"
  | "setAttribute"
  | "setStyle"
  | "addClass"
  | "removeClass"
  | "toggleClass"
  | "click"
  | "focus"
  | "scrollIntoView"
  | "remove";

type DomCommand = {
  type: "dom_command";
  id: string;
  version: number;
  timestamp: number;
  action: DomCommandAction;
  selector: string;
  value?: string | boolean;
  property?: string;
  attribute?: string;
};

type MessageType =
  | { type: "chat_input"; data: string }
  | { type: "request_state_sync"; data?: { syncId?: string } }
  | { type: "state_sync_result"; data: { syncId: string; state: unknown; timestamp: number } }
  | { type: "pty_output"; data: string }
  | { type: "pty_resize"; rows: number; cols: number }
  | { type: "connected"; clientId: string }
  | { type: "vite_ready"; port: number }
  | { type: "error"; message: string }
  | { type: "ping" }
  | DomCommand;

// PTY restart tracking to prevent infinite loops (must be before global state)
const ptyRestartState = {
  count: 0,
  lastRestart: 0,
  maxRetries: 5,
  baseDelay: 1000,
  backoffMultiplier: 2,
};

// Command versioning for concurrent edit handling
const commandState = {
  version: 0,
  commandHistory: [] as DomCommand[],
  maxHistorySize: 100,
};

function getNextCommandVersion(): number {
  return ++commandState.version;
}

function recordCommand(cmd: DomCommand) {
  commandState.commandHistory.push(cmd);
  // Trim old commands
  if (commandState.commandHistory.length > commandState.maxHistorySize) {
    commandState.commandHistory.shift();
  }
}

// Get commands newer than a given version
export function getCommandsSince(version: number): DomCommand[] {
  return commandState.commandHistory.filter(cmd => cmd.version > version);
}

// Get current version for client
export function getCurrentVersion(): number {
  return commandState.version;
}

// Clear command history (called after shadow→live swap)
function clearCommandHistory() {
  commandState.commandHistory = [];
  commandState.version = 0;
  logger.info("[Commands] History cleared after swap");
}

function getRestartDelay(): number {
  const delay = ptyRestartState.baseDelay * Math.pow(ptyRestartState.backoffMultiplier, ptyRestartState.count);
  return Math.min(delay, 30000); // Max 30s delay
}

// Global state
const clients = new Map<string, ServerWebSocket<WebSocketData>>();
let ptyProcess: Subprocess<"pty"> | null = null;
let viteProcess: ReturnType<typeof Bun.spawn> | null = null;
let syncInProgress = false;

// Generate unique client ID
function generateClientId(): string {
  return `client-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

// Spawn Vite dev server for playground
function spawnVite(): void {
  if (viteProcess) {
    logger.info("[Vite] Already running, skipping spawn");
    return;
  }

  const viteBin = CONFIG.VITE_BIN === "bunx" ? "bunx" : "npx";
  const viteArgs = ["vite", ".", "--port", CONFIG.VITE_PORT.toString(), "--host"];

  logger.info(`[Vite] Starting: ${viteBin} ${viteArgs.join(" ")} in ${CONFIG.WORKSPACE_DIR}`);

  viteProcess = Bun.spawn([viteBin, ...viteArgs], {
    cwd: CONFIG.WORKSPACE_DIR,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, FORCE_COLOR: "1" },
  });

  // Log Vite output
  const decoder = new TextDecoder();
  if (viteProcess.stdout) {
    (async () => {
      for await (const chunk of viteProcess!.stdout!) {
        const text = decoder.decode(chunk, { stream: true });
        if (text.includes("ready") || text.includes("Local:")) {
          logger.info(`[Vite] ${text.trim()}`);
          broadcastToClients({ type: "vite_ready", port: CONFIG.VITE_PORT });
        }
      }
    })();
  }

  if (viteProcess.stderr) {
    (async () => {
      for await (const chunk of viteProcess!.stderr!) {
        const text = decoder.decode(chunk, { stream: true });
        logger.error(`[Vite Error] ${text.trim()}`);
      }
    })();
  }

  viteProcess.exited.then((code) => {
    logger.info(`[Vite] Process exited with code ${code}`);
    viteProcess = null;
  });
}

// Stop Vite process
function stopVite(): void {
  if (viteProcess) {
    logger.info("[Vite] Stopping...");
    viteProcess.kill();
    viteProcess = null;
  }
}

// Spawn Claude Code in PTY
function spawnClaudePTY(): Subprocess<"pty"> | null {
  logger.info(`[PTY] Spawning Claude Code in ${CONFIG.WORKSPACE_DIR}`);

  const claudeCommand = process.env.CLAUDE_WRAPPER || CONFIG.CLAUDE_CMD;
  logger.info(`[PTY] Will run: ${claudeCommand}`);

  try {
    // Use Bun's native PTY API (Bun 1.3.5+)
    const proc = Bun.spawn({
      cmd: ["bash"],
      terminal: {
        cols: CONFIG.TERM_COLS,
        rows: CONFIG.TERM_ROWS,
        name: "xterm-256color",
        data(_terminal, data) {
          try {
            // Bun PTY data is Uint8Array, convert to string for JSON
            const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
            broadcastToClients({ type: "pty_output", data: text });
          } catch (err) {
            logger.error("[PTY] Error broadcasting data:", err);
          }
        },
      },
      cwd: CONFIG.WORKSPACE_ROOT,
      env: process.env,
    });

    const spawnTime = Date.now();

    proc.exited.then((exitCode) => {
      const lifetime = Date.now() - spawnTime;
      logger.info(`[PTY] Claude exited with code ${exitCode} (lived ${lifetime}ms)`);
      ptyProcess = null;

      if (lifetime < 2000) {
        logger.warn(`[PTY] Claude exited very quickly (${lifetime}ms). Check that 'claude' is installed and in PATH.`);
      }

      ptyRestartState.count++;
      ptyRestartState.lastRestart = Date.now();

      // Check if we've hit max retries
      if (ptyRestartState.count >= ptyRestartState.maxRetries) {
        logger.error(`[PTY] Max retries (${ptyRestartState.maxRetries}) reached. Claude keeps crashing.`);
        if (clients.size > 0) {
          broadcastToClients({
            type: "error",
            message: `Claude Code failed to start after ${ptyRestartState.maxRetries} attempts. Check that 'claude' is installed and in PATH.`,
          });
        }
        return;
      }

      // Restart with exponential backoff + 1s minimum cooldown
      const delay = Math.max(getRestartDelay(), 1000);
      logger.info(`[PTY] Restarting in ${delay}ms (attempt ${ptyRestartState.count}/${ptyRestartState.maxRetries})`);

      setTimeout(() => {
        if (clients.size > 0 && !ptyProcess) {
          const newPty = spawnClaudePTY();
          if (newPty) ptyProcess = newPty;
        }
      }, delay);
    });

    // Write reset and claude command after bash starts
    setTimeout(() => {
      try {
        if (proc.terminal) {
          // Clear screen and reset terminal before starting claude
          proc.terminal.write('\x1bc'); // Full reset (ESC c)
          proc.terminal.write('clear\r'); // Clear command
          setTimeout(() => {
            proc.terminal?.write(`${claudeCommand}\r`);
          }, 100);
        }
      } catch (err) {
        logger.error("[PTY] Failed to write command:", err);
      }
    }, 500);

    // Reset counter if stable for 5s
    setTimeout(() => {
      if (ptyProcess && ptyRestartState.count > 0) {
        logger.debug("[PTY] Claude stable for 5s, resetting restart counter");
        ptyRestartState.count = 0;
      }
    }, 5000);

    return proc;
  } catch (err) {
    logger.error("[PTY] Failed to spawn:", err);
    return null;
  }
}

// Broadcast message to all connected clients
function broadcastToClients(message: MessageType): void {
  const data = JSON.stringify(message);
  for (const [_, ws] of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(data);
      } catch (err) {
        // Socket might be closing, ignore
        logger.warn('[WS] Failed to send to client:', err);
      }
    }
  }
}

// Send message to specific client
function sendToClient(clientId: string, message: MessageType): void {
  const ws = clients.get(clientId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

// Write state to file (Channel 2)
function writeStateFile(stateData: unknown): void {
  const statePath = join(CONFIG.WORKSPACE_DIR, "state.json");
  const stateContent = JSON.stringify({
    timestamp: Date.now(),
    version: Date.now(),
    syncId: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    state: stateData,
  }, null, 2);

  try {
    writeFileSync(statePath, stateContent);
    logger.info(`[State] Written to ${statePath}`);
  } catch (err) {
    logger.error("[State] Failed to write state file:", err);
  }
}

// Request state sync (broadcast to web clients)
function requestStateSync(syncId?: string): void {
  if (syncInProgress) {
    logger.debug("[State] Sync already in progress, skipping");
    return;
  }

  syncInProgress = true;
  logger.info("[State] Requesting state sync from browser");

  broadcastToClients({
    type: "request_state_sync",
    data: { syncId },
  });

  // Clear lock after timeout in case browser doesn't respond
  setTimeout(() => {
    syncInProgress = false;
  }, 5000);
}

// File watcher for HMR
function setupFileWatcher(): void {
  const watchPaths = [
    join(CONFIG.WORKSPACE_DIR, "*.html"),
    join(CONFIG.WORKSPACE_DIR, "*.css"),
    join(CONFIG.WORKSPACE_DIR, "*.js"),
  ];

  const watcher = watch(watchPaths, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
  });

  watcher.on("change", (path) => {
    logger.debug(`[Watcher] File changed: ${path}`);
    // Vite's HMR will handle the actual reloading
    // We just log for debugging purposes
  });

  watcher.on("add", (path) => {
    logger.debug(`[Watcher] File added: ${path}`);
  });

  watcher.on("error", (error) => {
    logger.error("[Watcher] Error:", error);
  });
}

// WebSocket request handler
function handleWebSocket(ws: ServerWebSocket<WebSocketData>): void {
  const clientId = generateClientId();

  // Initialize client data
  ws.data = {
    clientId,
    channels: new Set(),
  };

  clients.set(clientId, ws);
  logger.info(`[WS] Client connected: ${clientId} (total: ${clients.size})`);

  // Send welcome message
  sendToClient(clientId, { type: "connected", clientId });

  // Start Claude PTY if first client
  if (clients.size === 1 && !ptyProcess) {
    const newPty = spawnClaudePTY();
    if (newPty) {
      ptyProcess = newPty;
    } else {
      logger.error('[WS] Failed to spawn PTY - terminal will not be available');
      // Send error to client
      sendToClient(clientId, {
        type: 'error',
        message: 'Failed to spawn terminal. Check if your shell is available.',
      } as MessageType);
    }
  }
}

// Handle WebSocket messages
function handleMessage(ws: ServerWebSocket<WebSocketData>, rawMessage: string): void {
  try {
    const message = JSON.parse(rawMessage) as MessageType;

    switch (message.type) {
      case "chat_input":
        // Forward chat input to PTY
        if (ptyProcess && ptyProcess.terminal && message.data) {
          ptyProcess.terminal.write(message.data);
        } else {
          logger.warn(`[WS] PTY not ready, dropping chat_input: ptyProcess=${!!ptyProcess}`);
        }
        break;

      case "pty_resize":
        // Resize PTY
        if (ptyProcess && ptyProcess.terminal && message.rows && message.cols) {
          ptyProcess.terminal.resize(message.cols, message.rows);
          logger.debug(`[PTY] Resized to ${message.cols}x${message.rows}`);
        }
        break;

      case "state_sync_result":
        // Received state from browser -> write to file
        syncInProgress = false;
        if (message.data?.state) {
          writeStateFile(message.data.state);
        }
        break;

      case "dom_command":
        // DOM commands from AI - just broadcast with version
        // (Client doesn't send these, AI sends via HTTP endpoint)
        logger.warn("[WS] Received dom_command from client (should use HTTP endpoint)");
        break;

      case "ping":
        // Heartbeat ping, ignore
        break;

      default:
        logger.warn("[WS] Unknown message type:", message.type);
    }
  } catch (err) {
    logger.error("[WS] Failed to parse message:", err);
  }
}

// Create Bun server
const server = serve({
  port: CONFIG.WS_PORT,
  websocket: {
    async open(ws) {
      handleWebSocket(ws);
    },
    async close(ws) {
      const { clientId } = ws.data;
      clients.delete(clientId);
      logger.info(`[WS] Client disconnected: ${clientId} (total: ${clients.size})`);

      // Stop PTY if no clients left (optional - or keep alive)
      if (clients.size === 0 && ptyProcess) {
        logger.info("[PTY] No clients, stopping Claude");
        try {
          ptyProcess.kill();
        } catch (err) {
          logger.warn("[PTY] Error killing process (may already be dead):", err);
        }
        ptyProcess = null;
      }
    },
    async message(ws, message) {
      handleMessage(ws, message.toString());
    },
  },
  async fetch(req) {
    const url = new URL(req.url);

    // Health check endpoint
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({
        status: "ok",
        clients: clients.size,
        ptyActive: !!ptyProcess,
        viteActive: !!viteProcess,
        workspace: CONFIG.WORKSPACE_DIR,
      }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // State file endpoint (for external reads)
    if (url.pathname === "/state" && req.method === "GET") {
      try {
        const statePath = join(CONFIG.WORKSPACE_DIR, "state.json");
        const stateContent = existsSync(statePath)
          ? readFileSync(statePath, "utf-8")
          : "{}";
        return new Response(stateContent, {
          headers: { "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: "Failed to read state" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Trigger state sync endpoint
    if (url.pathname === "/sync" && req.method === "POST") {
      const body = await req.json().catch(() => ({})) as { syncId?: string };
      requestStateSync(body.syncId);
      return new Response(JSON.stringify({ status: "requested" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // DOM command endpoint (for AI to send live DOM manipulation commands)
    // Supports single command OR batch:"commands": [...]
    if (url.pathname === "/command" && req.method === "POST") {
      try {
        const body = await req.json() as {
          action?: DomCommand["action"];
          selector?: string;
          value?: string | boolean;
          property?: string;
          attribute?: string;
          commands?: Array<{
            action: DomCommand["action"];
            selector: string;
            value?: string | boolean;
            property?: string;
            attribute?: string;
          }>;
        };

        const results: { id: string; version: number }[] = [];

        // Handle batch commands
        if (body.commands && Array.isArray(body.commands)) {
          logger.info(`[Command] Processing batch of ${body.commands.length} commands`);

          for (const cmdBody of body.commands) {
            const cmd: DomCommand = {
              type: "dom_command",
              id: `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              version: getNextCommandVersion(),
              timestamp: Date.now(),
              action: cmdBody.action,
              selector: cmdBody.selector,
              value: cmdBody.value,
              property: cmdBody.property,
              attribute: cmdBody.attribute,
            };
            recordCommand(cmd);
            broadcastToClients(cmd);
            results.push({ id: cmd.id, version: cmd.version });
            logger.info(`[Command] Batch item: ${cmd.action} on "${cmd.selector}"`);
          }

          return new Response(JSON.stringify({
            status: "ok",
            batch: true,
            count: results.length,
            results,
          }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        // Handle single command
        if (!body.action || !body.selector) {
          return new Response(JSON.stringify({ error: "Missing action or selector" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const cmd: DomCommand = {
          type: "dom_command",
          id: `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          version: getNextCommandVersion(),
          timestamp: Date.now(),
          action: body.action,
          selector: body.selector,
          value: body.value,
          property: body.property,
          attribute: body.attribute,
        };

        recordCommand(cmd);
        const clientCount = clients.size;
        logger.info(`[Command] Broadcasting to ${clientCount} clients: ${cmd.action} on "${cmd.selector}"`);
        broadcastToClients(cmd);
        logger.info(`[Command] v${cmd.version}: ${cmd.action} on "${cmd.selector}"`);

        return new Response(JSON.stringify({
          status: "ok",
          version: cmd.version,
          id: cmd.id,
        }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (err) {
        logger.error("[Command] Failed to process:", err);
        return new Response(JSON.stringify({ error: "Invalid command" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Get commands since version (for HMR replay)
    if (url.pathname === "/commands" && req.method === "GET") {
      const sinceVersion = parseInt(url.searchParams.get("since") || "0");
      const commands = getCommandsSince(sinceVersion);
      return new Response(JSON.stringify({
        currentVersion: getCurrentVersion(),
        commands,
      }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Swap shadow to live (copy files and trigger HMR)
    if (url.pathname === "/swap" && req.method === "POST") {
      try {
        logger.info("[Swap] Starting shadow → stage sync");

        // Verify directories exist
        if (!existsSync(CONFIG.SHADOW_PATH)) {
          mkdirSync(CONFIG.SHADOW_PATH, { recursive: true });
        }
        if (!existsSync(CONFIG.STAGE_PATH)) {
          mkdirSync(CONFIG.STAGE_PATH, { recursive: true });
        }

        // Sync shadow → stage using Bash (rsync preferred, fallback to cp)
        const syncProc = Bun.spawn({
          cmd: ["bash", "-c", `
            if command -v rsync >/dev/null 2>&1; then
              rsync -av --delete "${CONFIG.SHADOW_PATH}/" "${CONFIG.STAGE_PATH}/"
            else
              rm -rf "${CONFIG.STAGE_PATH}"/*
              cp -r "${CONFIG.SHADOW_PATH}"/* "${CONFIG.STAGE_PATH}/" 2>/dev/null || true
            fi
          `],
          stdout: "pipe",
          stderr: "pipe",
        });

        const exitCode = await syncProc.exited;
        if (exitCode !== 0) {
          const stderr = await new Response(syncProc.stderr).text();
          logger.warn("[Swap] Sync had issues:", stderr);
        }

        // Clear live command history after swap (source is now authoritative)
        clearCommandHistory();

        logger.info(`[Swap] Complete: synced ${CONFIG.SHADOW_PATH} → ${CONFIG.STAGE_PATH}`);

        return new Response(JSON.stringify({
          status: "ok",
          shadow: CONFIG.SHADOW_PATH,
          stage: CONFIG.STAGE_PATH,
          method: "rsync or cp",
        }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (err) {
        logger.error("[Swap] Failed:", err);
        return new Response(JSON.stringify({ error: String(err) }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Get workspace info (shadow/live paths)
    if (url.pathname === "/workspaces" && req.method === "GET") {
      return new Response(JSON.stringify({
        shadow: CONFIG.SHADOW_PATH,
        live: CONFIG.STAGE_PATH,
        shadowExists: existsSync(CONFIG.SHADOW_PATH),
        liveExists: existsSync(CONFIG.STAGE_PATH),
      }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Upgrade to WebSocket
    if (url.pathname === "/ws") {
      const success = server.upgrade(req, { data: { clientId: "", channels: new Set() } });
      if (!success) {
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      return new Response(null, { status: 101 }); // Continue with WebSocket
    }

    return new Response("Not Found", { status: 404 });
  },
});

// Graceful shutdown
process.on("SIGINT", () => {
  logger.info("\n[Server] Shutting down...");
  stopVite();
  if (ptyProcess) {
    try {
      ptyProcess.kill();
    } catch {
      // Ignore errors during shutdown
    }
  }
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("\n[Server] Shutting down...");
  stopVite();
  if (ptyProcess) {
    try {
      ptyProcess.kill();
    } catch {
      // Ignore errors during shutdown
    }
  }
  process.exit(0);
});

// Start servers
logger.info(`
╔══════════════════════════════════════════════════════════════╗
║                    Freeflow Server                           ║
╠══════════════════════════════════════════════════════════════╣
║ WebSocket: ws://localhost:${CONFIG.WS_PORT}/ws                       ║
║ Playground: http://localhost:${CONFIG.VITE_PORT}                       ║
║ Workspace: ${CONFIG.WORKSPACE_DIR.padEnd(47)}║
╚══════════════════════════════════════════════════════════════╝
`);

// Initialize
spawnVite();
setupFileWatcher();

// Export for potential module imports
export { CONFIG, requestStateSync };
