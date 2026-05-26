/**
 * Workspace module - multi-workspace management
 */
import { join } from "path";
import { existsSync, mkdirSync, readdirSync, statSync } from "fs";
import { CONFIG, getWorkspacePaths, ensureWorkspace, copyAgentSkills } from "./config";
import { logger } from "./logger";
import type { Workspace, WorkspaceType } from "./types";

// CORS headers for cross-origin requests
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const workspaces = new Map<string, Workspace>();

/**
 * Resolve workspace from request URL
 * Supports:
 * - /workspaces/{id}/* -> named workspaces
 * - /sessions/{id}/* -> ephemeral session workspaces
 */
export function resolveWorkspaceFromUrl(url: string): { workspace: Workspace; remainingPath: string } | null {
  const urlObj = new URL(url, "http://localhost");
  const pathname = urlObj.pathname;

  // Match /workspaces/{id}/*
  const workspaceMatch = pathname.match(/^\/workspaces\/([^\/]+)(?:\/(.+))?$/);
  if (workspaceMatch) {
    const [, id, filepath] = workspaceMatch;
    const workspace = getOrCreateWorkspace(id, "named");
    return { workspace, remainingPath: filepath || "index.html" };
  }

  // Match /sessions/{id}/*
  const sessionMatch = pathname.match(/^\/sessions\/([^\/]+)(?:\/(.+))?$/);
  if (sessionMatch) {
    const [, id, filepath] = sessionMatch;
    const workspace = getOrCreateWorkspace(id, "session");
    return { workspace, remainingPath: filepath || "index.html" };
  }

  return null;
}

/**
 * Get or create a workspace
 */
export function getOrCreateWorkspace(id: string, type: WorkspaceType): Workspace {
  const key = `${type}:${id}`;

  if (workspaces.has(key)) {
    return workspaces.get(key)!;
  }

  const paths = getWorkspacePaths(id, type);
  ensureWorkspace(id, type);
  copyAgentSkills(id, type);

  const workspace: Workspace = {
    id,
    type,
    stagePath: paths.stagePath,
    shadowPath: paths.shadowPath,
    basePath: paths.basePath,
  };

  workspaces.set(key, workspace);
  logger.info(`[Workspace] Created ${type} workspace: ${id}`);
  return workspace;
}

/**
 * Get an existing workspace
 */
export function getWorkspace(id: string, type: WorkspaceType): Workspace | undefined {
  const key = `${type}:${id}`;
  return workspaces.get(key);
}

/**
 * List all workspaces
 */
export function listWorkspaces(): Workspace[] {
  return Array.from(workspaces.values());
}

/**
 * Get workspace by client (WebSocket data)
 */
export function getWorkspaceForClient(clientId: string): Workspace | undefined {
  // Default to default workspace for now
  // In future, track which workspace each client is connected to
  return getWorkspace(CONFIG.DEFAULT_WORKSPACE, "named");
}

/**
 * Serve a static file from workspace stage directory
 */
export async function serveWorkspaceFile(workspace: Workspace, filepath: string): Promise<Response> {
  const fullPath = join(workspace.stagePath, filepath);

  // Security: ensure file is within workspace
  if (!fullPath.startsWith(workspace.stagePath)) {
    logger.warn(`[Workspace] Attempted path traversal: ${filepath}`);
    return new Response("Forbidden", { status: 403 });
  }

  // Check file exists
  if (!existsSync(fullPath)) {
    // If requesting directory or no extension, try index.html
    if (!filepath.includes(".") || filepath.endsWith("/")) {
      const indexPath = join(fullPath, "index.html");
      if (existsSync(indexPath)) {
        return serveFile(indexPath, "text/html");
      }
    }

    logger.debug(`[Workspace] File not found: ${fullPath}`);
    return new Response("Not Found", { status: 404 });
  }

  // Check if it's a directory
  const stats = statSync(fullPath);
  if (stats.isDirectory()) {
    const indexPath = join(fullPath, "index.html");
    if (existsSync(indexPath)) {
      return serveFile(indexPath, "text/html");
    }
    return new Response("Directory listing not allowed", { status: 403 });
  }

  return serveFile(fullPath, getContentType(filepath));
}

/**
 * Serve a file with appropriate content type
 */
async function serveFile(filepath: string, contentType: string): Promise<Response> {
  try {
    const file = Bun.file(filepath);
    const exists = await file.exists();

    if (!exists) {
      return new Response("Not Found", { status: 404 });
    }

    return new Response(file, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-cache",
        ...CORS_HEADERS,
      },
    });
  } catch (err) {
    logger.error(`[Workspace] Failed to serve file ${filepath}:`, err);
    return new Response("Internal Server Error", { status: 500 });
  }
}

/**
 * Get content type from file extension
 */
export function getContentType(filepath: string): string {
  const ext = filepath.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    html: "text/html",
    htm: "text/html",
    css: "text/css",
    js: "application/javascript",
    json: "application/json",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    ico: "image/x-icon",
    webp: "image/webp",
    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf",
    otf: "font/otf",
    eot: "application/vnd.ms-fontobject",
  };
  return types[ext || ""] || "application/octet-stream";
}

/**
 * Deploy shadow to stage (copy files)
 */
export async function deployWorkspace(workspace: Workspace): Promise<{ success: boolean; error?: string }> {
  try {
    const { spawn } = await import("bun");
    const proc = spawn({
      cmd: ["rsync", "-av", "--delete", `${workspace.shadowPath}/`, `${workspace.stagePath}/`],
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;

    if (exitCode === 0) {
      logger.info(`[Workspace] Deployed ${workspace.id}: shadow -> stage`);
      return { success: true };
    } else {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`rsync failed with code ${exitCode}: ${stderr}`);
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error(`[Workspace] Deploy failed for ${workspace.id}:`, errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Initialize default workspace on startup
 */
export function initWorkspaces(): void {
  // Ensure default workspace exists
  getOrCreateWorkspace(CONFIG.DEFAULT_WORKSPACE, "named");
  logger.info("[Workspace] Initialized workspace system");
}
