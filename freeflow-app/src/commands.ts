/**
 * Commands module - DOM command versioning and history management
 */
import type { DomCommand } from "./types";

const commandState = {
  version: 0,
  commandHistory: [] as DomCommand[],
  maxHistorySize: 100,
};

export function getNextCommandVersion(): number {
  return ++commandState.version;
}

export function recordCommand(cmd: DomCommand) {
  commandState.commandHistory.push(cmd);
  if (commandState.commandHistory.length > commandState.maxHistorySize) {
    commandState.commandHistory.shift();
  }
}

export function getCommandsSince(version: number): DomCommand[] {
  return commandState.commandHistory.filter(cmd => cmd.version > version);
}

export function getCurrentVersion(): number {
  return commandState.version;
}

export function clearCommandHistory() {
  commandState.commandHistory = [];
  commandState.version = 0;
}
