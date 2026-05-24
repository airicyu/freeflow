# Freeflow

AI-powered interactive playground where you chat with an AI Brain (Claude Code) in a terminal on the left, and see AI-generated UI come to life in a playground on the right.

## What is "AI Brain"?

**AI Brain** = Claude Code running in the terminal PTY. It controls the playground UI through:
- **Live Commands** - Immediate DOM manipulation via HTTP API
- **Shadow Editing** - File-based changes that deploy to the live UI

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  BROWSER                                                        │
│  ┌──────────────────┬───────────────────────────────────────┐  │
│  │ Terminal         │  Playground                           │  │
│  │ (xterm.js)       │  (Vite + iframe)                      │  │
│  │                  │                                       │  │
│  │ AI Brain         │  ┌─────────────────────────────────┐  │  │
│  │ (Claude Code)    │  │                                 │  │  │
│  │ running in PTY   │  │  Interactive UI (AI-generated)  │  │  │
│  │                  │  │                                 │  │  │
│  │ ↕ stdin/stdout   │  └─────────────────────────────────┘  │  │
│  └───────┬──────────┘  ↑ HMR updates (after deploy)          │  │
│          │             ↑ Live commands (immediate)            │  │
└──────────┼────────────────────────────────────────────────────┘
           │ WebSocket (messages by type)
           ▼
┌─────────────────────┐        ┌─────────────────────┐
│  Bun Server         │◄───────┤  File Deploy        │
│  • WebSocket hub    │        │  (shadow → stage)   │
│  • PTY manager      │        │  • rsync / cp       │
│  • HTTP endpoints   │        │  • HMR trigger      │
│  • State handler    │        └─────────────────────┘
└─────────┬───────────┘
          │
          │ Spawns
          ▼
┌─────────────────────┐
│  AI Brain           │
│  (Claude Code)      │
│  • Sees shadow/     │  ← AI's edit area
│  • Sees stage/      │  ← Live UI (read-only)
│  • Sends commands   │
│  • Reads state.json │
└─────────────────────┘
```

## How It Works

### Three-Panel Layout

| Panel | Technology | Content | Updates |
|-------|------------|---------|---------|
| **Terminal** (left) | xterm.js + PTY | Claude Code TUI | Live character-by-character |
| **Playground** (right) | Vite + iframe | AI-generated UI | Live commands instantly, HMR after deploy |

### Message Flow (No Channels)

```
┌──────────────┐              ┌─────────┐              ┌──────────────┐
│   Browser    │ ──WebSocket──▶│ Server  │── WebSocket──▶│   Browser    │
│  (Terminal)  │  chat_input   │         │  pty_output    │  (Terminal)  │
└──────────────┘              │         │              └──────────────┘
                              │         │
┌──────────────┐  HTTP POST   │         │  WebSocket     ┌──────────────┐
│  AI Brain    │──/command───▶│         │──dom_command───▶│  Playground  │
│  (curl)      │              │         │                │  (iframe)    │
└──────────────┘              │         │              └──────────────┘
                              │         │
                              │         │◄─── File Watch ───┐
                              │         │                   │
                              └────┬────┘              ┌────┴────┐
                                   │                   │  Stage  │
                                   │◄── rsync / cp ────┤  (live) │
                                   │                   └────┬────┘
                              ┌────┴────┐                  │
                              │  Shadow │◄─── AI edits
                              │  (draft)│
                              └─────────┘
```

### Message Types (No Channels)

| Direction | Type | Payload | Purpose |
|-----------|------|---------|---------|
| C → S | `chat_input` | `{data: string}` | Terminal keystrokes to PTY |
| C → S | `pty_resize` | `{rows, cols}` | Terminal resize |
| C → S | `state_sync_result` | `{syncId, state, timestamp}` | UI state from playground |
| S → C | `pty_output` | `{data: string}` | PTY output to display |
| S → C | `dom_command` | `{action, selector, value, ...}` | Live command to execute |
| S → C | `request_state_sync` | `{syncId?}` | Ask playground for state |
| HTTP | `command` | `{action, selector}` or `{commands: []}` | AI sends live command(s) |

**Key:** No logical channels. All messages use same WebSocket, routed by `type` field.

## Terminology

| Term | Definition | Access |
|------|------------|--------|
| **AI Brain** | Claude Code in terminal | AI only |
| **Playground** | Right panel iframe (live UI) | User interacts |
| **Terminal** | Left panel (xterm.js) | User types, sees AI output |
| **Shadow** | `shadow/` folder | AI edits (draft workspace) |
| **Stage** | `stage/` folder | Live files (Vite serves this) |
| **Live Command** | HTTP POST `/command` | Immediate DOM update |
| **Deploy** | `rsync shadow/ stage/` | Publish draft to live |

## Two Update Modes

### Mode 1: Live Commands (Quick changes)

For: checkbox toggles, text updates, button clicks, element removal

```bash
# Single command
curl -X POST /command -d '{"action":"uncheck","selector":"#task1"}'

# Batch commands (atomic)
curl -X POST /command -d '{
  "commands": [
    {"action":"uncheck","selector":"#task1"},
    {"action":"check","selector":"#task2"},
    {"action":"appendHtml","selector":"#list","value":"<li>New</li>"}
  ]
}'
```

**Result:** User sees change instantly. Browser console shows: `[Playground] Received dom_command`

### Mode 2: Shadow Workflow (Complex changes)

For: New components, redesigns, multi-file refactors

```bash
# Edit in shadow (no HMR during edits)
echo "html" > shadow/index.html
echo "css" > shadow/style.css

# Deploy when ready
bash .claude/skills/shadow-staging/deploy.sh

# Vite HMR refreshes with final result
```

**Result:** User sees nothing during edits. Final result appears atomically.

## Quick Start

### Prerequisites

1. [Bun](https://bun.sh) installed
2. Claude Code CLI installed (`npm install -g @anthropic-ai/claude-code`)

### Installation

```bash
cd freeflow
bun run install:all
```

### Running

**Terminal 1 - Bun Server:**
```bash
bun run dev:server
```

**Terminal 2 - Web Client:**
```bash
bun run dev:client
```

**Access:**
- Web Client: http://localhost:3002
- WebSocket: ws://localhost:3000
- Playground: http://localhost:3001

## Project Structure

```
freeflow/
├── bun-server/              # Bun server (WebSocket + PTY + HTTP)
│   ├── server.ts
│   └── package.json
│
├── web-client/              # React web client
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── TerminalPanel.tsx
│   │   │   ├── PlaygroundPanel.tsx
│   │   │   └── ResizableSplit.tsx
│   │   └── hooks/
│   │       └── useWebSocket.ts
│   └── package.json
│
├── workspaces/
│   └── default/             # AI's workspace
│       ├── stage/           # ← Live UI (Vite serves)
│       │   ├── index.html
│       │   ├── style.css
│       │   ├── main.js      # Live command executor
│       │   └── state.json   # User interaction state
│       │
│       ├── shadow/          # ← AI's draft workspace
│       │   ├── index.html
│       │   ├── style.css
│       │   └── main.js
│       │
│       └── .claude/skills/shadow-staging/
│           ├── SKILL.md     # AI skill documentation
│           └── deploy.sh    # Deploy script
│
└── README.md
```

## Key Features

- **Full Claude Code TUI** in browser terminal
- **Live Commands** - HTTP API for instant DOM manipulation
- **Shadow/Stage** - Two-folder atomic deployment workflow
- **State Sync** - Bidirectional: AI creates UI, captures user interactions
- **Shared WebSocket** - Single connection for terminal + playground
- **Message-based routing** - No channels, just message types

## Common AI Commands

```bash
# Read current playground state
cat stage/state.json

# Send live command
curl -X POST http://localhost:3000/command \
  -d '{"action":"setText","selector":"#title","value":"Hello"}'

# Deploy shadow changes
bash .claude/skills/shadow-staging/deploy.sh

# Request state sync
curl -X POST http://localhost:3000/sync
```

## License

MIT
