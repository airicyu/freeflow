/**
 * WebSocket module - Connection management and message routing
 */
import type { ServerWebSocket } from "bun";
import { logger } from "./logger";
import type { WebSocketData, ClientWebSocket, MessageType } from "./types";
import { initPty, spawnClaudePTY, getPty, killPty, resizePty, writeToPty } from "./pty";
import { writeStateFile, completeSync } from "./state";

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
        if (message.data?.state) {
          writeStateFile(message.data.state);
        }
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

export { broadcastToClients as broadcast };
