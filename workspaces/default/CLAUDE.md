# Freeflow AI Brain - Workspace Guide

**AI Brain** = Claude Code running in the terminal PTY.

## CRITICAL: Use the Shadow-Staging Skill

For ALL UI updates, invoke the skill first:
```
/skill shadow-staging
```

This gives you the full playbook for Mode 1 (Live Commands) and Mode 2 (Shadow → Deploy).

---

## PROTECTED FILES - NEVER EDIT

These are INFRASTRUCTURE files. **Never** edit them:
- `freeflow-core.js` - Live commands, WebSocket bridge, core system
- `freeflow-collectors.js` - Default collectors, registration API
- `.claude/` directory - Skills and infrastructure
- `<script src="freeflow-*">` tags in HTML

## CLEAR PLAYGROUND BEHAVIOR

When asked to "clear" or "reset" the playground:
1. **Keep** HTML structure (`<!DOCTYPE>`, `<html>`, `<head>`, `<body>`)
2. **Keep** all `<script>` tags (especially `freeflow-core.js`, `freeflow-collectors.js`)
3. **Clear** only `<body>` inner content
4. **Clear** only `app.js` content (business logic)
5. **Never** remove freeflow-*.js files

## STATE COLLECTORS

- **Never** edit `freeflow-collectors.js`
- Add new collectors in `app.js`: `window.freeflow.registerCollector('name', () => ({...}))`
- Skeleton collectors handle basic form elements automatically

---

## Quick Reference

### Mode 1: Live Commands (DEFAULT for quick changes)
Use for: checkbox toggles, text updates, adding/removing elements

**Flow:** Live command FIRST (instant UI) → Edit shadow → Deploy (persist)

```bash
# 1. Update UI immediately (user sees instant feedback)
curl -X POST http://localhost:3000/command \
  -d '{"action":"uncheck","selector":"#task1"}'

# 2. Sync shadow to match
Read shadow/index.html
Edit shadow/index.html

# 3. Deploy so changes persist on refresh
bash .claude/skills/shadow-staging/deploy.sh
```

### Mode 2: Shadow → Deploy (complex changes)
Use for: new forms, redesigns, multi-file changes

**No live commands** - build entirely in shadow, then deploy atomically.

```bash
Read stage/index.html
Write shadow/index.html
Write shadow/style.css
bash .claude/skills/shadow-staging/deploy.sh
```

---

## Decision Table

| User Request | Mode | Why |
|--------------|------|-----|
| "Tick this checkbox" | **Mode 1** | Instant feedback |
| "Change text to..." | **Mode 1** | Immediate visual update |
| "Remove that task" | **Mode 1** | Immediate removal |
| "Create new form" | **Mode 2** | Complex, multi-step |
| "Redesign page" | **Mode 2** | Atomic deployment |

---

## File Locations

```
./
├── stage/                      # Live UI (Vite serves) - READ ONLY
├── shadow/                     # Your edit workspace - EDIT HERE
├── freeflow-core.js           # INFRASTRUCTURE - NEVER EDIT
├── freeflow-collectors.js     # INFRASTRUCTURE - NEVER EDIT
├── app.js                      # Business logic - EDIT HERE
└── .claude/                    # Skills and config - NEVER EDIT
```

**Key:** Shadow is YOUR workspace - edit `app.js`, `style.css`, `index.html` body content. Never touch infrastructure files.
