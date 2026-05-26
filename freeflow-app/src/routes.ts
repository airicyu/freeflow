/**
 * Routes module - HTTP route handlers
 */
import type { Server, ServerWebSocket } from "bun";
import type { WebSocketData } from "./types";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import { CONFIG } from "./config";
import { logger } from "./logger";
import { requestStateSync, readStateFile, writeStateFile } from "./state";
import { isPtyActive } from "./pty";
import { getClientCount, broadcastToClients } from "./websocket";
import type { DomCommand, UiCookingMessage, UiPreDeployMessage, UiReloadMessage } from "./types";
import {
  getNextCommandVersion,
  recordCommand,
  clearCommandHistory,
} from "./commands";
import { resolveWorkspaceFromUrl, serveWorkspaceFile, getOrCreateWorkspace, deployWorkspace, getContentType } from "./workspace";

// CORS headers for cross-origin requests from web client
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Handle CORS preflight
export function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }
  return null;
}

// Health check
function healthHandler(): Response {
  return new Response(JSON.stringify({
    status: "ok",
    clients: getClientCount(),
    ptyActive: isPtyActive(),
    workspaceRoot: CONFIG.WORKSPACES_ROOT,
    defaultWorkspace: CONFIG.DEFAULT_WORKSPACE,
  }), {
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// Trigger sync
async function statePostHandler(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({})) as { syncId?: string };
  requestStateSync(body.syncId);
  return new Response(JSON.stringify({ status: "requested" }), {
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
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
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    if (!body.action || !body.selector) {
      return new Response(JSON.stringify({ error: "Missing action or selector" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
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
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  } catch (err) {
    logger.error("[Command] Failed to process:", err);
    return new Response(JSON.stringify({ error: "Invalid command" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
}

// Workspace cooking phase handler
async function workspaceCookingHandler(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const match = url.pathname.match(/^\/workspaces\/([^\/]+)\/cooking$/);
    if (!match) {
      return new Response(JSON.stringify({ error: "Invalid workspace path" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    const workspaceId = match[1];
    const body = await req.json().catch(() => ({})) as { message?: string };

    const message: UiCookingMessage = {
      type: "ui_cooking",
      updateId: `upd-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      message: body.message || "AI is cooking the UI changes...",
    };

    broadcastToClients(message);

    return new Response(JSON.stringify({
      status: "ok",
      updateId: message.updateId,
      phase: "cooking",
    }), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  } catch (err) {
    logger.error("[Routes] Cooking handler failed:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
}

// Workspace pre-deploy phase handler
async function workspacePreDeployHandler(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const match = url.pathname.match(/^\/workspaces\/([^\/]+)\/pre-deploy$/);
    if (!match) {
      return new Response(JSON.stringify({ error: "Invalid workspace path" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    const workspaceId = match[1];
    const body = await req.json().catch(() => ({})) as { updateId?: string };

    const message: UiPreDeployMessage = {
      type: "ui_pre_deploy",
      updateId: body.updateId || `upd-${Date.now()}`,
    };

    broadcastToClients(message);

    return new Response(JSON.stringify({
      status: "ok",
      updateId: message.updateId,
      phase: "pre_deploy",
    }), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  } catch (err) {
    logger.error("[Routes] Pre-deploy handler failed:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
}

// Workspace reload phase handler
async function workspaceReloadHandler(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const match = url.pathname.match(/^\/workspaces\/([^\/]+)\/reload$/);
    if (!match) {
      return new Response(JSON.stringify({ error: "Invalid workspace path" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    const workspaceId = match[1];
    const body = await req.json().catch(() => ({})) as { updateId?: string };

    const message: UiReloadMessage = {
      type: "ui_reload",
      updateId: body.updateId || `upd-${Date.now()}`,
    };

    broadcastToClients(message);

    return new Response(JSON.stringify({
      status: "ok",
      updateId: message.updateId,
      phase: "reload",
    }), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  } catch (err) {
    logger.error("[Routes] Reload handler failed:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
}

// Workspace deploy handler (rsync shadow to stage)
async function workspaceDeployHandler(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const match = url.pathname.match(/^\/workspaces\/([^\/]+)\/deploy$/);
    if (!match) {
      return new Response(JSON.stringify({ error: "Invalid workspace path" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    const workspaceId = match[1];
    const workspace = getOrCreateWorkspace(workspaceId, "named");

    const result = await deployWorkspace(workspace);

    if (result.success) {
      return new Response(JSON.stringify({
        status: "ok",
        workspace: workspaceId,
        message: "Deployed shadow to stage",
      }), {
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    } else {
      return new Response(JSON.stringify({
        error: "Deploy failed",
        details: result.error,
      }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }
  } catch (err) {
    logger.error("[Routes] Deploy handler failed:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
}

// Get workspace state file
async function workspaceStateHandler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const match = url.pathname.match(/^\/workspaces\/([^\/]+)\/state$/);
  if (!match) {
    return new Response(JSON.stringify({ error: "Invalid workspace path" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  const workspaceId = match[1];
  const workspace = getOrCreateWorkspace(workspaceId, "named");

  if (req.method === "GET") {
    // Read state file
    const statePath = join(workspace.stagePath, "state.json");
    if (!existsSync(statePath)) {
      return new Response(JSON.stringify({ state: {} }), {
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    try {
      const content = await Bun.file(statePath).text();
      return new Response(content, {
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    } catch (err) {
      return new Response(JSON.stringify({ state: {}, error: "Failed to read state" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// Route definitions
const routes = [
  { method: "GET", path: "/health", handler: healthHandler },
  { method: "POST", path: "/sync", handler: statePostHandler },
  { method: "POST", path: "/command", handler: commandHandler },
  { method: "POST", pattern: /^\/workspaces\/[^\/]+\/cooking$/, handler: workspaceCookingHandler },
  { method: "POST", pattern: /^\/workspaces\/[^\/]+\/pre-deploy$/, handler: workspacePreDeployHandler },
  { method: "POST", pattern: /^\/workspaces\/[^\/]+\/reload$/, handler: workspaceReloadHandler },
  { method: "POST", pattern: /^\/workspaces\/[^\/]+\/deploy$/, handler: workspaceDeployHandler },
  { method: "GET", pattern: /^\/workspaces\/[^\/]+\/state$/, handler: workspaceStateHandler },
];

// Async router
export async function handleRouteAsync(req: Request, server: Server<WebSocketData>): Promise<Response | null> {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const url = new URL(req.url);

  // Check exact path routes first
  for (const route of routes) {
    if (route.method === req.method) {
      // Check exact path match
      if (route.path && route.path === url.pathname) {
        const result = route.handler(req);
        return result instanceof Promise ? await result : result;
      }
      // Check pattern match
      if (route.pattern && route.pattern.test(url.pathname)) {
        const result = route.handler(req);
        return result instanceof Promise ? await result : result;
      }
    }
  }

  // Handle shared infrastructure file serving
  // /_shared/* -> workspaces/_shared/*
  const sharedMatch = url.pathname.match(/^\/_shared\/(.+)$/);
  if (sharedMatch) {
    const filepath = sharedMatch[1];
    const sharedPath = join(CONFIG.WORKSPACES_ROOT, "_shared", filepath);
    if (existsSync(sharedPath)) {
      const file = Bun.file(sharedPath);
      return new Response(file, {
        headers: {
          "Content-Type": getContentType(filepath),
          "Cache-Control": "no-cache",
          ...CORS_HEADERS,
        },
      });
    }
    return new Response("Not Found", { status: 404 });
  }

  // Handle workspace static file serving
  // /workspaces/{id}/* and /sessions/{id}/*
  const workspaceResult = resolveWorkspaceFromUrl(req.url);
  if (workspaceResult) {
    return serveWorkspaceFile(workspaceResult.workspace, workspaceResult.remainingPath);
  }

  // Handle root redirect to default workspace
  if (url.pathname === "/" || url.pathname === "/index.html") {
    return new Response(null, {
      status: 302,
      headers: {
        "Location": `/workspaces/${CONFIG.DEFAULT_WORKSPACE}/`,
      },
    });
  }

  return null;
}
