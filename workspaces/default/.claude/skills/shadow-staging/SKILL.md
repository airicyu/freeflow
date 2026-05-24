---
name: shadow-staging
description: Use shadow/stage folders with live commands and atomic deployment for UI updates
version: 3.0.0
tools: [file_read, file_write, bash]
---

# Shadow-Staging UI Workflow

## Quick Decision: Which Mode?

| User Says | Mode | Why |
|-----------|------|-----|
| "Tick/untick checkbox" | **Mode 1: Live Command** | User expects instant feedback |
| "Change text to..." | **Mode 1: Live Command** | Immediate visual update |
| "Remove that task" | **Mode 1: Live Command** | Immediate removal |
| "Create new form" | **Mode 2: Shadow → Deploy** | Complex, multi-step |
| "Redesign page" | **Mode 2: Shadow → Deploy** | Atomic deployment |

**Rule:** Checkbox toggles, button clicks, text changes = **always Live Command FIRST**

---

## Mode 1: Live Commands (DEFAULT for quick changes)

**Use for:** checkbox toggles, button clicks, text updates, adding/removing elements

**Flow:** Live command FIRST (instant UI) → Edit shadow → Deploy (persist)

### Single Command
```bash
# Update UI instantly
curl -X POST http://localhost:3000/command \
  -d '{"action":"uncheck","selector":"#task1"}'
```

### Batch Commands (Efficient for multiple changes)
```bash
curl -X POST http://localhost:3000/command \
  -H "Content-Type: application/json" \
  -d '{
    "commands": [
      {"action":"uncheck","selector":"#task1"},
      {"action":"check","selector":"#task2"},
      {"action":"appendHtml","selector":"#list","value":"<div>New</div>"}
    ]
  }'
```

### Required: Update Shadow + Deploy (Persist Changes)
```bash
# 1. Read current shadow
Read shadow/index.html

# 2. Read current user state (checkbox states, form values, etc.)
Read stage/state.json

# 3. Edit shadow to match live changes, BAKING user state INTO the HTML
#    - If state.json shows task2=true, add 'checked' attribute to that checkbox
#    - If task1=false, remove 'checked' attribute
#    - If input field has value, set 'value="..."' attribute
#    This makes the HTML render with state already applied - no localStorage needed!
Edit shadow/index.html (apply changes + bake state into HTML attributes)

# 4. Deploy so changes persist across refreshes
bash .claude/skills/shadow-staging/deploy.sh
```

**Key:** Live command updates UI **immediately**. Shadow edit + deploy makes changes permanent. **CRITICAL:** Bake user state directly into HTML attributes (`checked`, `value`) so the initial render shows the correct state without relying on localStorage.

---

## Mode 2: Shadow Workflow (for complex changes)

**Use for:** New components, redesigns, multi-file changes (>30 seconds of work)

**No live commands** - build entirely in shadow, then deploy atomically.

### Workflow
```bash
# 1. Read current state (understand structure)
Read stage/index.html
Read stage/app.js

# 2. Edit in shadow (no HMR during edits - no flickering)
Write shadow/index.html  # Keep script imports!
Write shadow/style.css
Write shadow/app.js      # App logic + state collectors

# 3. Deploy to stage (atomic update)
bash .claude/skills/shadow-staging/deploy.sh

# 4. Vite HMR refreshes once with final result
```

---

## Deploy Script (Always Use This for Mode 2)

```bash
# Deploy shadow to stage - handles directory automatically
bash .claude/skills/shadow-staging/deploy.sh
```

This runs: `rsync -av --delete shadow/ stage/`

---

## Available Live Command Actions

| Action | Description | Example Value |
|--------|-------------|---------------|
| `check` / `uncheck` | Toggle checkbox | (no value needed) |
| `setText` | Change text content | `"New text"` |
| `setHtml` | Replace inner HTML | `"<div>...</div>"` |
| `appendHtml` | Add HTML at end | `"<li>Item</li>"` |
| `prependHtml` | Add HTML at start | `"<li>First</li>"` |
| `insertBefore` | Insert before element | `"<div>Before</div>"` |
| `insertAfter` | Insert after element | `"<div>After</div>"` |
| `addClass` / `removeClass` / `toggleClass` | CSS classes | `"completed"` |
| `setStyle` | Inline styles | `{"color": "red"}` |
| `setValue` | Input values | `"typed text"` |
| `setAttribute` | Any attribute | `"src"` (use `attribute` + `value` fields) |
| `setProperty` | DOM properties | `true` (use `property` + `value` fields) |
| `click` | Trigger click | (no value needed) |
| `focus` | Focus element | (no value needed) |
| `remove` | Delete element | (no value needed) |
| `scrollIntoView` | Scroll to element | `{"block": "center"}` |

---

## Example Scenarios

### Scenario 1: Checkbox Toggle (Mode 1)
```bash
# User: "Untick task 1"
curl -X POST /command -d '{"action":"uncheck","selector":"#task1"}'
Read shadow/index.html
Read stage/state.json  # task2=true, task3=false
Edit shadow/index.html (remove 'checked' from task1, add 'checked' to task2)
bash .claude/skills/shadow-staging/deploy.sh
```

### Scenario 2: Add New Task (Mode 1)
```bash
# User: "Add task 'Visit Parent' at 7pm"
curl -X POST /command \
  -d '{"action":"appendHtml","selector":"#checklist","value":"<div class=\"check-item\" data-id=\"4\"><input type=\"checkbox\" id=\"task4\"><div class=\"task-content\"><span class=\"task-text\">Visit Parent</span><span class=\"task-time\">7:00 PM</span></div></div>"}'
Read shadow/index.html
Edit shadow/index.html (add the same task HTML)
bash .claude/skills/shadow-staging/deploy.sh
```

### Scenario 3: Batch Multiple Changes (Mode 1)
```bash
# User: "Untick task 1, tick task 2, remove task 3"
curl -X POST /command \
  -H "Content-Type: application/json" \
  -d '{
    "commands": [
      {"action":"uncheck","selector":"#task1"},
      {"action":"check","selector":"#task2"},
      {"action":"remove","selector":"[data-id=\"3\"]"}
    ]
  }'
Read shadow/index.html
Read stage/state.json
Edit shadow/index.html (remove task 3, apply current checkbox states from state.json)
bash .claude/skills/shadow-staging/deploy.sh
```

### Scenario 4: Create New Form (Mode 2)
```bash
# User: "Create a login form"
# (No live commands needed - building from scratch)
Write shadow/index.html (login form HTML - keep script imports!)
Write shadow/style.css (form styles)
Write shadow/app.js (form validation + collectors)
bash .claude/skills/shadow-staging/deploy.sh
```

### Scenario 5: Clear Playground (Mode 2)
```bash
# User: "Clear everything"
# Keep infrastructure, clear only business logic
Read shadow/index.html
Edit shadow/index.html (clear body content, KEEP script imports)
Write shadow/app.js (clear content or minimal init)
bash .claude/skills/shadow-staging/deploy.sh
```

**IMPORTANT:** When clearing:
- Keep `<script src="freeflow-core.js">`
- Keep `<script src="freeflow-collectors.js">`
- Keep `<script src="app.js">`
- Clear only body content and app.js logic

---

## Key Principles

1. **Shadow is YOUR workspace** - Edit directly, no permission needed from user
2. **Stage is what user sees** - Only update via live commands OR deploy
3. **Live commands = instant** - User sees change immediately
4. **Shadow changes need deploy** - User sees after `deploy.sh` runs
5. **Always do both for quick changes** - Live command + shadow edit
6. **Read first** - Check current HTML structure before modifying (`Read stage/index.html`)

## Protected Files - NEVER EDIT

- `freeflow-core.js` - Live commands, WebSocket bridge, core system
- `freeflow-collectors.js` - Default collectors, registration API
- `.claude/` directory - Skills and config
- `<script src="freeflow-*">` tags in HTML

## Clear Playground Behavior

When asked to "clear" or "reset" the playground:
1. **Keep** HTML structure (`<!DOCTYPE>`, `<html>`, `<head>`, `<body>`)
2. **Keep** all `<script>` tags (especially `freeflow-core.js`, `freeflow-collectors.js`)
3. **Clear** only `<body>` inner content
4. **Clear** only `app.js` content (business logic)
5. **Never** remove freeflow-*.js files

---

## State Preservation Pattern (Bake into HTML)

**Preferred approach:** Instead of loading state from localStorage on page load, bake the state directly into HTML attributes:

```html
<!-- BEFORE (static) -->
<input type="checkbox" id="task1">
<input type="checkbox" id="task2">
<input type="text" id="username">

<!-- AFTER (with baked state from state.json) -->
<input type="checkbox" id="task1" checked>  <!-- user had checked this -->
<input type="checkbox" id="task2">          <!-- user had unchecked this -->
<input type="text" id="username" value="john">  <!-- user had typed this -->
```

**Why this is better:**
- No flash of default state before localStorage loads
- No race conditions or timing issues
- State survives across deploys naturally
- Simpler mental model: HTML reflects the actual state

**When editing shadow HTML:**
1. Read `state.json` to get current values
2. Apply those values directly as HTML attributes (`checked`, `value`, `selected`, etc.)
3. Deploy - the UI renders with correct state immediately

## State Collection

To see what user has entered/selected:
```bash
Read stage/state.json
```

Or request sync:
```bash
curl -X POST http://localhost:3000/sync
```

Then read the updated `stage/state.json`.

---

## Workspace Structure

```
workspaces/default/
├── stage/                      # ← Live UI (Vite serves, HMR watches)
│   ├── index.html             # Current page (EDIT: body content, KEEP script imports)
│   ├── style.css              # Current styles (EDIT freely)
│   ├── app.js                 # Business logic (EDIT freely)
│   ├── freeflow-core.js       # ← INFRASTRUCTURE - NEVER EDIT
│   ├── freeflow-collectors.js # ← INFRASTRUCTURE - NEVER EDIT
│   ├── state.json             # User interaction state
│   └── .claude/               # Skills and config - NEVER EDIT
│
└── shadow/                     # ← YOUR edit workspace
    ├── index.html             # Draft page
    ├── style.css              # Draft styles
    ├── app.js                 # Draft business logic
    ├── freeflow-core.js       # Infrastructure (mirrored from stage)
    └── freeflow-collectors.js # Infrastructure (mirrored from stage)
```

**Protected Files (NEVER EDIT):**
- `freeflow-core.js` - Live commands, WebSocket bridge
- `freeflow-collectors.js` - State collectors, registration API
- `.claude/` directory - Skills and config

**Your Files (EDIT FREELY):**
- `index.html` - Keep structure, edit body content
- `style.css` - Edit freely
- `app.js` - Add your app logic and custom collectors

**Remember:** User only sees `stage/`. `shadow/` is your private draft area.
