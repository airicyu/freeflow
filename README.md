# Freeflow

AI-powered interactive playground where you chat with an AI Agent in a terminal on the left, and see AI-generated UI come to life in a playground on the right.

## What is "AI Agent"?

**AI Agent** = AI CLI tool running in the terminal PTY (e.g., Claude Code). It controls the playground UI through:
- **Live Commands** - Immediate DOM manipulation via HTTP API
- **Shadow/Stage Workflow** - File-based changes with smooth deploy

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  BROWSER                                                        │
│  ┌──────────────────┬───────────────────────────────────────┐  │
│  │ Chat             │  Playground                           │  │
│  │ (xterm.js)       │  (iframe + static files)              │  │
│  │                  │                                       │  │
│  │ AI Agent         │  ┌─────────────────────────────────┐  │  │
│  │ (AI CLI)         │  │                                 │  │  │
│  │ running in PTY   │  │  Interactive UI (AI-generated)  │  │  │
│  │                  │  │                                 │  │  │
│  │ ↕ stdin/stdout   │  └─────────────────────────────────┘  │  │
│  └───────┬──────────┘                                       │  │
│          │                                                    │  │
└──────────┼────────────────────────────────────────────────────┘
           │ WebSocket (messages by type)
           ▼
┌─────────────────────┐
│  Bun Server         │◄───────┐
│  • WebSocket hub    │        │
│  • PTY manager      │        │
│  • HTTP endpoints   │        │
│  • Static file      │   Deploy (shadow → stage)
│    server           │        │
└─────────┬───────────┘        │
          │                    │
          │ Spawns             │
          ▼                    │
┌─────────────────────┐        │
│  AI Agent           │        │
│  (AI CLI)           │        │
│  • Edits shadow/    │────────┘
│  • Deploys to stage │
│  • Sends commands   │
│  • Reads state.json │
└─────────────────────┘
```

## How It Works

### Two-Panel Layout

| Panel | Technology | Content | Updates |
|-------|------------|---------|---------|
| **Chat** (left) | xterm.js + PTY | Claude Code TUI | Live character-by-character |
| **Playground** (right) | Static files + iframe | AI-generated UI | Live commands instantly, smooth deploy for changes |

### Smooth Deploy Workflow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ Cooking  │────▶│ Pre-     │────▶│ Deploy   │────▶│ Reload   │
│ Phase    │     │ Deploy   │     │          │     │          │
│          │     │          │     │          │     │          │
│ • Toast  │     │ • Block  │     │ • rsync  │     │ • State  │
│ • Live   │     │   input  │     │   shadow │     │   restore│
│   cmd OK │     │ • Sync   │     │   →stage │     │ • New UI │
│ • User   │     │   state  │     │          │     │   shown  │
│   works  │     │          │     │          │     │          │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
```

### Message Types

| Direction | Type | Purpose |
|-----------|------|---------|
| C → S | `chat_input` | Terminal keystrokes to PTY |
| S → C | `pty_output` | PTY output to display |
| S → C | `dom_command` | Live command to execute in playground |
| S → C | `ui_cooking` | Show non-blocking toast |
| S → C | `ui_pre_deploy` | Block input, sync final state |
| S → C | `ui_reload` | Trigger page reload |

## Terminology

| Term | Definition |
|------|------------|
| **AI Agent** | AI component that controls the playground (runs in terminal chat) |
| **Playground** | Right panel iframe (live UI) |
| **Chat** | Left panel (xterm.js) |
| **Shadow** | `shadow/` folder - AI's draft workspace |
| **Stage** | `stage/` folder - Live files served to user |
| **Live Command** | HTTP POST `/command` - Immediate DOM update |
| **Deploy** | `rsync shadow/ stage/` - Publish draft to live |

## Quick Start

### Prerequisites

1. [Bun](https://bun.sh) installed
2. AI CLI tool installed (see [AI CLI Support](#ai-cli-support) below)

### Installation

```bash
bun run install:all
```

### Running

```bash
bun start
```

or

```bash
./start-dev.sh
```

**Access:**
- Web UI: http://localhost:3002

### Stopping

Press `Ctrl+C` in the terminal running `bun start` or `./start-dev.sh` - both server and client will terminate together.

## Project Structure

```
freeflow/
├── freeflow-app/            # Bun server (WebSocket + PTY + HTTP + static files)
│   ├── src/
│   │   ├── server.ts
│   │   ├── routes.ts
│   │   ├── workspace.ts
│   │   └── config.ts
│   └── package.json
│
├── freeflow-web/            # React web client
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── TerminalPanel.tsx    # Chat panel
│   │   │   ├── PlaygroundPanel.tsx  # Playground iframe
│   │   │   └── ResizableSplit.tsx   # Draggable divider
│   │   └── hooks/
│   │       └── useWebSocket.ts
│   └── package.json
│
├── workspaces/
│   ├── _shared/             # Infrastructure files
│   │   ├── freeflow-core.js
│   │   └── freeflow-collectors.js
│   │
│   └── default/             # Default workspace
│       ├── .claude/         # AI skills and config
│       │   ├── CLAUDE.md
│       │   └── skills/
│       │       ├── playground-update/
│       │       │   ├── SKILL.md
│       │       │   └── deploy.sh
│       │       └── playground-intent/
│       │           └── SKILL.md
│       │
│       ├── stage/           # Live UI (served by Bun)
│       └── shadow/          # AI's draft workspace
│
├── start-dev.sh             # Single command to start both
└── README.md
```

## Key Features

- **Full AI CLI TUI** in browser terminal (Claude Code, Cursor, etc.)
- **Live Commands** - HTTP API for instant DOM manipulation
- **Smooth Deploy** - Phased workflow (cooking → pre-deploy → reload)
- **State Sync** - Bidirectional: AI creates UI, captures user interactions
- **Single Start Command** - `./start-dev.sh` starts both server and client
- **Clean Termination** - Ctrl+C stops everything, no stale processes

## AI CLI Support

Freeflow supports multiple AI CLI tools. By default, **Claude Code** is configured.

### Supported CLIs

| CLI | Setup Command | Configuration |
|-----|---------------|---------------|
| **Claude Code** (default) | `npm install -g @anthropic-ai/claude-code` | No changes needed |
| **Cursor** | Install via [Cursor](https://cursor.sh) | Update `.env` file |

### Using Cursor

To use Cursor instead of Claude Code:

1. Open `.env` in the project root
2. Change the `AGENT_CLI_CMD` variable:

```bash
# From
AGENT_CLI_CMD=claude

# To
AGENT_CLI_CMD=cursor
```

3. Restart the server with `./start-dev.sh`

See [DISCLAIMER.md](DISCLAIMER.md) for security considerations.

