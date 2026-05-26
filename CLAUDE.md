# Freeflow - Project Context

## Project Overview

Freeflow is an AI-powered interactive playground with two-pane layout:
- **Left**: Chat (xterm.js) running AI CLI via PTY
- **Right**: Playground (static HTML/JS) showing AI-generated UI

## Smooth Deploy Architecture

Freeflow uses a phased update workflow for smooth user experience:

```
PHASE 1: UPDATING          PHASE 2: PRE-DEPLOY       PHASE 3: RELOAD
─────────────────          ───────────────────       ─────────────
Send ui_cooking             Send ui_pre_deploy        Deploy shadow→stage
Show toast                  Block input                ↓
User works normally         Send final state          Send ui_reload
    ↓                           ↓                      ↓
[Live commands] → Read state.json → Reload page
(optional)          Update shadow
                    with state
```

### Workspace Layout

```
workspaces/
└── default/              # Workspace root
    ├── .claude/          # AI skills and configuration
    │   ├── CLAUDE.md     # This file
    │   └── skills/
    │       └── playground-update/
    │           ├── SKILL.md      # Deploy workflow skill
    │           └── deploy.sh     # Deploy script
    │
    ├── stage/            # ← Live UI (served by Bun)
    │   ├── index.html    # Current UI displayed to user
    │   ├── style.css
    │   ├── app.js
    │   └── state.json    # Auto-synced user state
    │
    └── shadow/           # ← AI edit workspace
        ├── index.html    # Draft changes
        ├── style.css
        └── app.js
```

### Key Files

- `stage/` - Live files served to user (read-only for AI)
- `shadow/` - AI's workspace for editing (draft area)
- `_shared/` - Infrastructure files (freeflow-core.js, etc.)
- `.claude/skills/` - AI skills for the playground

## How the AI Agent Fits In

As the AI component running in the PTY:
1. User types requests in chat
2. You receive the message naturally
3. You **edit files** in `shadow/` using your file tools
4. Use the `playground-update` skill for smooth deploy
5. You can **read state.json** to see user interactions

## The Playground-Update Skill

**ALWAYS invoke this skill for UI updates:**
```
/skill playground-update
```

This skill gives you the full playbook for:
- **Mode 1**: Live commands for quick tweaks
- **Mode 2**: Full shadow→stage deploy workflow

## State Collection

State auto-syncs every 5 seconds. Read `stage/state.json` to see user input:

```json
{
  "formValues": {
    "username": "john",
    "email": "john@example.com"
  },
  "activeTab": "settings"
}
```

## Protected Files - NEVER EDIT

- `/_shared/freeflow-core.js` - Infrastructure
- `/_shared/freeflow-collectors.js` - State collection
- `.claude/` directory - Skills and config
- Script tags in HTML pointing to `/_shared/`

## Workspace Location

In development, the default workspace is at:
```
./workspaces/default/
```

You edit files in `shadow/`, deploy to `stage/`.

## Quick Commands

```bash
# Deploy shadow to stage
bash .claude/skills/playground-update/deploy.sh

# Quick syntax (from anywhere in workspace)
bash deploy.sh
```

## Development Tips

1. **Start simple** - Plain HTML, add complexity as requested
2. **Use IDs** - Makes state collection easier
3. **Semantic class names** - `.primary-btn` not `.btn-1`
4. **Vanilla JS** - Easier for AI generation and debugging
5. **Always use the skill** - Don't deploy manually, follow the workflow
