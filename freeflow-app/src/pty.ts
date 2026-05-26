/**
 * PTY module - Agent Cli process management with restart handling
 */
import type { Subprocess } from "bun";
import { CONFIG, getWorkspacePaths } from "./config";
import { logger } from "./logger";
import type { MessageType } from "./types";

let ptyProcess: Subprocess | null = null;
let broadcastFn: ((msg: MessageType) => void) | null = null;

const ptyRestartState = {
  count: 0,
  lastRestart: 0,
  maxRetries: 5,
  baseDelay: 1000,
  backoffMultiplier: 2,
};

function getRestartDelay(): number {
  const delay = ptyRestartState.baseDelay * Math.pow(ptyRestartState.backoffMultiplier, ptyRestartState.count);
  return Math.min(delay, 30000);
}

export function initPty(broadcast: (msg: MessageType) => void) {
  broadcastFn = broadcast;
}

export function getPty(): Subprocess | null {
  return ptyProcess;
}

export function isPtyActive(): boolean {
  return !!ptyProcess;
}

export function writeToPty(data: string): boolean {
  if (ptyProcess?.terminal) {
    ptyProcess.terminal.write(data);
    return true;
  }
  return false;
}

export function resizePty(rows: number, cols: number): boolean {
  if (ptyProcess?.terminal) {
    ptyProcess.terminal.resize(cols, rows);
    logger.debug(`[PTY] Resized to ${cols}x${rows}`);
    return true;
  }
  return false;
}

export function killPty(): void {
  if (ptyProcess) {
    logger.info("[PTY] Killing process...");
    try {
      ptyProcess.kill();
    } catch (err) {
      logger.warn("[PTY] Error killing process:", err);
    }
    ptyProcess = null;
  }
}

export function spawnAgentCliPTY(workspaceId: string = CONFIG.DEFAULT_WORKSPACE): Subprocess | null {
  const paths = getWorkspacePaths(workspaceId, "named");
  logger.info(`[PTY] Spawning AI agent in ${paths.basePath}`);

  const agentCommand = process.env.AGENT_CLI_WRAPPER || CONFIG.AGENT_CLI_CMD;
  logger.info(`[PTY] Will run: ${agentCommand}`);

  try {
    const proc = Bun.spawn({
      cmd: ["bash"],
      terminal: {
        cols: CONFIG.TERM_COLS,
        rows: CONFIG.TERM_ROWS,
        name: "xterm-256color",
        data(_terminal, data) {
          try {
            const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
            broadcastFn?.({ type: "pty_output", data: text });
          } catch (err) {
            logger.error("[PTY] Error broadcasting data:", err);
          }
        },
      },
      cwd: paths.basePath,
      env: process.env,
    });

    const spawnTime = Date.now();

    proc.exited.then((exitCode) => {
      const lifetime = Date.now() - spawnTime;
      logger.info(`[PTY] Agent CLI exited with code ${exitCode} (lived ${lifetime}ms)`);
      ptyProcess = null;

      if (lifetime < 2000) {
        logger.warn(`[PTY] Agent CLI exited very quickly (${lifetime}ms)`);
      }

      ptyRestartState.count++;
      ptyRestartState.lastRestart = Date.now();

      if (ptyRestartState.count >= ptyRestartState.maxRetries) {
        logger.error(`[PTY] Max retries reached`);
        broadcastFn?.({
          type: "error",
          message: `Agent CLI failed to start after ${ptyRestartState.maxRetries} attempts`,
        });
        return;
      }

      const delay = Math.max(getRestartDelay(), 1000);
      logger.info(`[PTY] Restarting in ${delay}ms (attempt ${ptyRestartState.count}/${ptyRestartState.maxRetries})`);

      setTimeout(() => {
        if (!ptyProcess) {
          const newPty = spawnAgentCliPTY();
          if (newPty) ptyProcess = newPty;
        }
      }, delay);
    });

    setTimeout(() => {
      try {
        if (proc.terminal) {
          proc.terminal.write('\x1bc');
          proc.terminal.write('clear\r');
          setTimeout(() => {
            proc.terminal?.write(`${agentCommand}\r`);
          }, 100);
        }
      } catch (err) {
        logger.error("[PTY] Failed to write command:", err);
      }
    }, 500);

    setTimeout(() => {
      if (ptyProcess && ptyRestartState.count > 0) {
        logger.debug("[PTY] Claude stable for 5s, resetting restart counter");
        ptyRestartState.count = 0;
      }
    }, 5000);

    ptyProcess = proc;
    return proc;
  } catch (err) {
    logger.error("[PTY] Failed to spawn:", err);
    return null;
  }
}
