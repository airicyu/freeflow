#!/usr/bin/env bun
/**
 * Freeflow Bun Server - Main Orchestrator
 */

import { serve } from "bun";
import type { Server } from "bun";
import { CONFIG } from "./config";
import { logger } from "./logger";
import { spawnVite, stopVite } from "./vite";
import { spawnClaudePTY, killPty, getPty } from "./pty";
import type { WebSocketData } from "./types";
import {
  initWebSocket,
  handleWebSocket,
  handleWebSocketClose,
  handleMessage,
  broadcast,
} from "./websocket";
import { handleRouteAsync } from "./routes";
import { initPty } from "./pty";
import { initVite } from "./vite";
import { initState } from "./state";

// Initialize modules
initPty(broadcast);
initVite(broadcast);
initState(broadcast);
initWebSocket(() => {
  if (!getPty()) {
    const newPty = spawnClaudePTY();
    if (!newPty) {
      logger.error("[Server] Failed to spawn PTY");
    }
  }
});

// Create Bun server with typed WebSocket data
const server: Server<WebSocketData> = serve({
  port: CONFIG.WS_PORT,
  websocket: {
    async open(ws) {
      handleWebSocket(ws);
    },
    async close(ws) {
      handleWebSocketClose(ws);
    },
    async message(ws, message) {
      handleMessage(ws, message.toString());
    },
  },
  async fetch(req, srv) {
    const routeResponse = await handleRouteAsync(req, srv as Server<WebSocketData>);
    if (routeResponse) {
      return routeResponse;
    }

    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      const success = (srv as Server<WebSocketData>).upgrade(req, { data: { clientId: "", channels: new Set() } });
      if (!success) {
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      return new Response(null, { status: 101 });
    }

    return new Response("Not Found", { status: 404 });
  },
});

// Graceful shutdown
function shutdown(signal: string) {
  logger.info(`\n[Server] Shutting down (${signal})...`);
  stopVite();
  killPty();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

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

spawnVite();

export { CONFIG };
