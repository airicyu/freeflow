/**
 * Types module - all TypeScript interfaces and type definitions
 */
import type { ServerWebSocket } from "bun";

export type WebSocketData = {
  clientId: string;
  channels: Set<"chat" | "state">;
};

export type DomCommandAction =
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

export type DomCommand = {
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

export type MessageType =
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

export type ClientWebSocket = ServerWebSocket<WebSocketData>;
