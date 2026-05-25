/**
 * Routes module - HTTP route handlers
 */
import type { Server, ServerWebSocket } from "bun";
import type { WebSocketData } from "./types";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import { CONFIG } from "./config";
import { logger } from "./logger";
import { requestStateSync } from "./state";
import { isPtyActive } from "./pty";
import { isViteActive } from "./vite";
import { getClientCount, broadcastToClients } from "./websocket";
import type { DomCommand } from "./types";
import {
  getNextCommandVersion,
  recordCommand,
  clearCommandHistory,
} from "./commands";

// Health check
function healthHandler(): Response {
  return new Response(JSON.stringify({
    status: "ok",
    clients: getClientCount(),
    ptyActive: isPtyActive(),
    viteActive: isViteActive(),
    workspace: CONFIG.WORKSPACE_DIR,
  }), {
    headers: { "Content-Type": "application/json" },
  });
}

// Trigger sync
async function statePostHandler(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({})) as { syncId?: string };
  requestStateSync(body.syncId);
  return new Response(JSON.stringify({ status: "requested" }), {
    headers: { "Content-Type": "application/json" },
  });
}

// DOM commands
async function commandHandler(req: Request): Promise<Response> {
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
    broadcastToClients(cmd);

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

// Route definitions
const routes = [
  { method: "GET", path: "/health", handler: healthHandler },
  { method: "POST", path: "/sync", handler: statePostHandler },
  { method: "POST", path: "/command", handler: commandHandler },
];

// Async router
export async function handleRouteAsync(req: Request, server: Server<WebSocketData>): Promise<Response | null> {
  const url = new URL(req.url);

  for (const route of routes) {
    if (route.method === req.method && route.path === url.pathname) {
      const result = route.handler(req);
      return result instanceof Promise ? await result : result;
    }
  }

  return null;
}
