/**
 * Vite module - Vite dev server management
 */
import type { Subprocess } from "bun";
import { CONFIG } from "./config";
import { logger } from "./logger";
import type { MessageType } from "./types";

let viteProcess: Subprocess | null = null;
let broadcastFn: ((msg: MessageType) => void) | null = null;

export function initVite(broadcast: (msg: MessageType) => void) {
  broadcastFn = broadcast;
}

export function isViteActive(): boolean {
  return !!viteProcess;
}

export function spawnVite(): void {
  if (viteProcess) {
    logger.info("[Vite] Already running, skipping spawn");
    return;
  }

  const viteBin = CONFIG.VITE_BIN === "bunx" ? "bunx" : "npx";
  const viteArgs = ["vite", ".", "--port", CONFIG.VITE_PORT.toString(), "--host"];

  logger.info(`[Vite] Starting: ${viteBin} ${viteArgs.join(" ")} in ${CONFIG.WORKSPACE_DIR}`);

  viteProcess = Bun.spawn({
    cmd: [viteBin, ...viteArgs],
    cwd: CONFIG.WORKSPACE_DIR,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, FORCE_COLOR: "1" },
  });

  const decoder = new TextDecoder();
  if (viteProcess.stdout && typeof viteProcess.stdout !== "number") {
    (async () => {
      for await (const chunk of viteProcess.stdout as ReadableStream<Uint8Array>) {
        const text = decoder.decode(chunk, { stream: true });
        if (text.includes("ready") || text.includes("Local:")) {
          logger.info(`[Vite] ${text.trim()}`);
          broadcastFn?.({ type: "vite_ready", port: CONFIG.VITE_PORT });
        }
      }
    })();
  }

  if (viteProcess.stderr && typeof viteProcess.stderr !== "number") {
    (async () => {
      for await (const chunk of viteProcess.stderr as ReadableStream<Uint8Array>) {
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

export function stopVite(): void {
  if (viteProcess) {
    logger.info("[Vite] Stopping...");
    viteProcess.kill();
    viteProcess = null;
  }
}
