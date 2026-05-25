/**
 * State module - state file management and sync handling
 */
import { join } from "path";
import { writeFileSync, existsSync, readFileSync } from "fs";
import { CONFIG } from "./config";
import { logger } from "./logger";
import { getWorkspacePaths } from "./config";
import type { MessageType } from "./types";

let syncInProgress = false;
let broadcastFn: ((msg: MessageType) => void) | null = null;

export function initState(broadcast: (msg: MessageType) => void) {
  broadcastFn = broadcast;
}

export function writeStateFile(stateData: unknown, workspaceId: string = CONFIG.DEFAULT_WORKSPACE): void {
  const paths = getWorkspacePaths(workspaceId, "named");
  const statePath = join(paths.stagePath, "state.json");
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

export function readStateFile(workspaceId: string = CONFIG.DEFAULT_WORKSPACE): unknown {
  const paths = getWorkspacePaths(workspaceId, "named");
  const statePath = join(paths.stagePath, "state.json");
  if (!existsSync(statePath)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(statePath, "utf-8"));
  } catch {
    return {};
  }
}

export function requestStateSync(syncId?: string, updateId?: string): void {
  if (syncInProgress) {
    logger.debug("[State] Sync already in progress, skipping");
    return;
  }

  syncInProgress = true;
  logger.info("[State] Requesting state sync from browser");

  broadcastFn?.({
    type: "request_state_sync",
    data: { syncId, updateId },
  });

  setTimeout(() => {
    syncInProgress = false;
  }, 5000);
}

export function completeSync(): void {
  syncInProgress = false;
}

export function isSyncInProgress(): boolean {
  return syncInProgress;
}
