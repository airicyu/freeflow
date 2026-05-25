/**
 * Logger module - centralized logging with file and console output
 */
import { createWriteStream } from "fs";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import { CONFIG } from "./config";

// Ensure log directory exists
if (!existsSync(CONFIG.LOG_DIR)) {
  mkdirSync(CONFIG.LOG_DIR, { recursive: true });
}

export const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 } as const;
type LogLevel = keyof typeof LOG_LEVELS;

const LOG_LEVEL = LOG_LEVELS[(process.env.LOG_LEVEL?.toUpperCase() as LogLevel) || "INFO"];

const logFileStream = createWriteStream(join(CONFIG.LOG_DIR, "server.log"), { flags: "a" });

function formatLog(level: string, msg: string): string {
  const ts = new Date().toISOString();
  return `[${ts}] [${level}] ${msg}`;
}

export function log(level: LogLevel, ...args: unknown[]) {
  const msg = args.map(a => typeof a === "string" ? a : JSON.stringify(a)).join(" ");
  const line = formatLog(level, msg);

  if (LOG_LEVELS[level] >= LOG_LEVEL) {
    console.log(line);
  }
  logFileStream.write(line + "\n");
}

export const logger = {
  debug: (...args: unknown[]) => log("DEBUG", ...args),
  info: (...args: unknown[]) => log("INFO", ...args),
  warn: (...args: unknown[]) => log("WARN", ...args),
  error: (...args: unknown[]) => log("ERROR", ...args),
};
