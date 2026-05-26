# Freeflow AI Brain - Workspace Guide

**AI Brain** = Claude Code running in the terminal PTY.

## Understanding the Conversation Context

When operating in this workspace, you are inside the **Freeflow web interface**. The user is typing in the chat view (terminal panel) and seeing responses there.

**Key insight:** The user's conversation is almost always about **their ideas/subject matter** — not about the playground HTML project itself. The playground (right panel) is a visualization canvas for exploring those ideas.

- User says "workflow diagram" → They want to **discuss/whiteboard** a workflow concept
- User says "show me a login form" → They want to **see** what a login form could look like
- The playground content is the **medium**, not the **topic**

Only implement in the playground when the user explicitly asks to "build", "create", "add", or "show" something visual.

## Memory vs Playground: Understanding User Intent

**Critical:** Distinguish between "saving content" (playground) vs "remembering preferences" (memory).

| User says... | Interpret as... | Action |
|--------------|-----------------|--------|
| "Save this example" | Add to playground UI | Use `/skill playground-update` |
| "Add a card for X" | Visual content | Use `/skill playground-update` |
| "Document this path" | Show in playground | Use `/skill playground-update` |
| "Create a list of..." | Render in UI | Use `/skill playground-update` |
| "Remember I prefer..." | Personal preference | Use memory system |
| "Don't use emojis" | Feedback/correction | Use memory system |
| "I'm a backend engineer" | User profile | Use memory system |

**Rule:** If the user wants to "save", "add", "create", or "document" something in the **playground content**, invoke the playground-update skill. If they want you to "remember" something about **them personally**, use the memory system.

**Examples:**
- "Save this routing example" → Interpret as "Add example to playground UI" → Use skill
- "Save my username as john" → Interpret as "Remember my username" → Use memory

## When Intent is Unclear: Use playground-intent Skill

**Ambiguous words** like "save", "draw", "show", "clear" can mean multiple things in playground context.

**When user says something ambiguous, invoke:**
```
/skill playground-intent
```

This helps you:
- Distinguish "save as export" vs "save state" vs "add to UI"
- Tell brainstorm mode from product mode
- Know when to ask clarifying questions vs just act

**Key principle:** Don't guess intent. When uncertain, use the intent skill or ask.

---

## CRITICAL: Use the playground-update Skill

For ALL UI updates, invoke the skill first:
```
/skill playground-update
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
bash .claude/skills/playground-update/deploy.sh
```

### Mode 2: Shadow → Deploy (complex changes)
Use for: new forms, redesigns, multi-file changes

**No live commands** - build entirely in shadow, then deploy atomically.

```bash
Read stage/index.html
Write shadow/index.html
Write shadow/style.css
bash .claude/skills/playground-update/deploy.sh
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
