/**
 * Types module - all TypeScript interfaces and type definitions
 */
import type { ServerWebSocket } from "bun";

export type WebSocketData = {
  clientId: string;
  channels: Set<"chat" | "state">;
  workspaceId?: string;
};

export type WorkspaceType = "named" | "session";

export type Workspace = {
  id: string;
  type: WorkspaceType;
  stagePath: string;
  shadowPath: string;
  basePath: string;
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

// UI Refresh Phase Messages
export type UiCookingMessage = {
  type: "ui_cooking";
  updateId: string;
  message: string;
};

export type UiPreDeployMessage = {
  type: "ui_pre_deploy";
  updateId: string;
};

export type UiReloadMessage = {
  type: "ui_reload";
  updateId: string;
};

export type StateSyncResultMessage = {
  type: "state_sync_result";
  data: {
    updateId: string;
    state: unknown;
    isFinal: boolean;
  };
};

export type MessageType =
  | { type: "chat_input"; data: string }
  | { type: "request_state_sync"; data?: { syncId?: string; updateId?: string } }
  | { type: "state_sync_result"; data: { syncId: string; state: unknown; timestamp: number } }
  | StateSyncResultMessage
  | { type: "pty_output"; data: string }
  | { type: "pty_resize"; rows: number; cols: number }
  | { type: "connected"; clientId: string }
  | { type: "vite_ready"; port: number }
  | { type: "error"; message: string }
  | { type: "ping" }
  | UiCookingMessage
  | UiPreDeployMessage
  | UiReloadMessage
  | DomCommand;

export type ClientWebSocket = ServerWebSocket<WebSocketData>;
