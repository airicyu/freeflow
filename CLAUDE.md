# Freeflow - Project Context

## Project Overview

Freeflow is an AI-powered interactive playground with two-pane layout:
- **Left**: Terminal (xterm.js) running Claude Code via PTY
- **Right**: Playground (Vite + vanilla JS) showing AI-generated UI

## Dual-Mode Update Architecture

Freeflow supports two update strategies to prevent HMR flicker and user interruption:

### Mode 1: Bulk Update (Shadow → Swap → HMR)
For large changes:
1. Claude edits files in `workspaces/shadow/` (doesn't affect live UI)
2. User clicks **"Apply Changes"** button when ready
3. Server copies shadow files to `workspaces/default/`
4. HMR refreshes once with final state

### Mode 2: Live + Background (Immediate → Shadow → Later)
For small incremental changes:
1. Claude sends live DOM commands via `/command` endpoint
2. UI updates immediately without reload
3. Claude ALSO edits shadow workspace in background
4. On next "Apply Changes", source becomes authoritative

### Workspace Layout
```
workspaces/
└── default/              # Workspace root (git repo)
    ├── .git/             # Git repository
    ├── .claude/          # Claude configuration
    │
    ├── stage/            # ← Live workspace (Vite serves this)
    │   ├── index.html    # Current UI displayed to user
    │   ├── style.css
    │   ├── main.js
    │   └── state.json    # User state (collected)
    │
    └── shadow/           # ← Shadow workspace (AI edits here)
        ├── index.html    # Pending changes (no HMR trigger)
        ├── style.css
        └── main.js
```

### Key Insight: Claude Code operates on **files in the shadow workspace**, optionally sending live commands for immediate feedback. Vite only sees changes after user-approved swap.

## How Claude (You) Fits In

As Claude Code running in the PTY:
1. User types requests in terminal
2. You receive the message naturally
3. You **edit files** in the workspace using your file tools
4. Vite HMR updates the playground instantly
5. You can **read state.json** to see user interactions

## State Collection

When the user wants you to know what's in the UI (form values, selections):

1. **You generated the UI** → You know the element IDs/classes
2. You should create/maintain `state-collector.js`
3. When you need state, the system executes your collector
4. You read `state.json` to see the result

### Example State Collector

When you create a form, also update collector:

```javascript
// state-collector.js (you maintain this)
window.freeflow.registerCollector('myForm', () => ({
  username: document.getElementById('username')?.value,
  plan: document.querySelector('input[name="plan"]:checked')?.value,
  agreed: document.getElementById('agree')?.checked,
}));

// Then read state.json:
// {"formValues": {"username": "john", "plan": "premium", "agreed": true}}
```

## Workspace Location

You're operating in:
```
/tmp/freeflow-session-{id}/
  ├── index.html    ← Edit this
  ├── style.css     ← Edit this
  ├── main.js       ← Edit this
  └── state.json    ← Read this (AI sees user state)
```

Or in development:
```
./workspaces/default/
```

## Key Commands

As Claude Code, you naturally respond to user requests like:
- "Create a login form" → Edit index.html, style.css
- "Add validation" → Edit main.js
- "Make it blue" → Edit style.css
- "What did they type?" → Read state.json (user clicks Sync State first)

## File Structure

```
freeflow/
├── bun-server/server.ts   # WebSocket + PTY + Vite spawn
├── web-client/            # React + xterm.js
├── workspaces/default/    # ← You edit files here
└── CLAUDE.md             # This file
```

## Development Tips

1. **Start simple**: Plain HTML, add complexity as requested
2. **Use IDs**: Makes state collection easier (`#username` vs complex selectors)
3. **Semantic class names**: `.primary-btn` not `.btn-1`
4. **State collectors**: Update them when you change the UI structure
5. **Vanilla JS**: Avoid frameworks - easier for AI generation and debugging

## Protocol: State Sync Request

When you need to see current state, you can "ask" by reading state.json after it's been synced. The user clicks "Sync State" or you can ask them to click it.

## Architecture Decision: File-Based IPC

Instead of stdout JSON, you use **file editing**:
- Output: Edit index.html, style.css
- Input: Read state.json

This leverages your existing file editing capabilities and is more reliable than structured JSON over stdout.
