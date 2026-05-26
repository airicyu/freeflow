/**
 * WebSocket module - Connection management and message routing
 */
import type { ServerWebSocket } from "bun";
import { logger } from "./logger";
import type { WebSocketData, ClientWebSocket, MessageType } from "./types";
import { initPty, spawnAgentCliPTY, getPty, killPty, resizePty, writeToPty } from "./pty";
import { writeStateFile, completeSync } from "./state";
import { CONFIG } from "./config";

// Track active update IDs for UI phases
const activeUpdates = new Map<string, {
  phase: "cooking" | "pre_deploy" | "reload";
  startedAt: number;
}>();

const clients = new Map<string, ClientWebSocket>();

let onFirstConnect: (() => void) | null = null;

export function initWebSocket(onFirstClient?: () => void) {
  onFirstConnect = onFirstClient || null;
  initPty(broadcastToClients);
}

export function getClientCount(): number {
  return clients.size;
}

export function getClients(): Map<string, ClientWebSocket> {
  return clients;
}

function generateClientId(): string {
  return `client-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function broadcastToClients(message: MessageType): void {
  const data = JSON.stringify(message);
  for (const [_, ws] of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(data);
      } catch (err) {
        logger.warn("[WS] Failed to send to client:", err);
      }
    }
  }
}

export function sendToClient(clientId: string, message: MessageType): void {
  const ws = clients.get(clientId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

export function handleWebSocket(ws: ClientWebSocket): void {
  const clientId = generateClientId();

  ws.data = {
    clientId,
    channels: new Set(),
  };

  clients.set(clientId, ws);
  logger.info(`[WS] Client connected: ${clientId} (total: ${clients.size})`);

  sendToClient(clientId, { type: "connected", clientId });

  if (clients.size === 1 && !getPty()) {
    onFirstConnect?.();
  }
}

export function handleWebSocketClose(ws: ClientWebSocket): void {
  const { clientId } = ws.data;
  clients.delete(clientId);
  logger.info(`[WS] Client disconnected: ${clientId} (total: ${clients.size})`);

  if (clients.size === 0) {
    logger.info("[PTY] No clients, stopping Claude");
    killPty();
  }
}

export function handleMessage(ws: ClientWebSocket, rawMessage: string): void {
  try {
    const message = JSON.parse(rawMessage) as MessageType;

    switch (message.type) {
      case "chat_input":
        if (!writeToPty(message.data)) {
          logger.warn(`[WS] PTY not ready, dropping chat_input`);
        }
        break;

      case "pty_resize":
        resizePty(message.rows, message.cols);
        break;

      case "state_sync_result":
        completeSync();
        if (message.type === "state_sync_result") {
          const { updateId, isFinal } = message.data as { updateId: string;state: unknown;isFinal: boolean;}
          if (updateId) {
            logger.info(`[WS] Received state_sync_result for update ${updateId}, final: ${isFinal}`);
            if (isFinal) {
              activeUpdates.delete(updateId);
            }
          }
          if (message.data?.state) {
            writeStateFile(message.data.state, ws.data.workspaceId || CONFIG.DEFAULT_WORKSPACE);
          }
        }
        break;

      case "ui_cooking":
        // Track cooking phase
        activeUpdates.set(message.updateId, { phase: "cooking", startedAt: Date.now() });
        broadcastToClients(message);
        break;

      case "ui_pre_deploy":
        // Track pre-deploy phase
        if (message.updateId) {
          activeUpdates.set(message.updateId, { phase: "pre_deploy", startedAt: Date.now() });
        }
        broadcastToClients(message);
        break;

      case "ui_reload":
        // Track reload phase
        if (message.updateId) {
          activeUpdates.set(message.updateId, { phase: "reload", startedAt: Date.now() });
        }
        broadcastToClients(message);
        break;

      case "dom_command":
        logger.warn("[WS] Received dom_command from client (should use HTTP endpoint)");
        break;

      case "ping":
        break;

      default:
        logger.warn("[WS] Unknown message type:", (message as { type: string }).type);
    }
  } catch (err) {
    logger.error("[WS] Failed to parse message:", err);
  }
}

/**
 * Get active update info
 */
export function getActiveUpdate(updateId: string): { phase: "cooking" | "pre_deploy" | "reload"; startedAt: number } | undefined {
  return activeUpdates.get(updateId);
}

/**
 * Broadcast to workspace clients only
 */
export function broadcastToWorkspace(workspaceId: string, message: MessageType): void {
  const data = JSON.stringify(message);
  for (const [_, ws] of clients) {
    if (ws.readyState === WebSocket.OPEN && ws.data.workspaceId === workspaceId) {
      try {
        ws.send(data);
      } catch (err) {
        logger.warn("[WS] Failed to send to workspace client:", err);
      }
    }
  }
}

export { broadcastToClients as broadcast };
