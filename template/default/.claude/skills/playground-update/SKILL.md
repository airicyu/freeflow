---
name: playground-update
description: Update playground UI with phased workflow - supports both quick tweaks and complex changes with state preservation
version: 5.0.0
tools: [file_read, file_write, bash]
---

# Playground - Unified Update & Deploy Workflow

**Purpose:** Update the playground UI with smooth user experience and state preservation. updating → [live commands] → edit shadow → pre-deploy → sync state → deploy → reload

**For ALL changes** - both quick tweaks and complex redesigns use the same workflow.

---

## Quick Decision: Which Variation?

| Change Type | Variation | When to Use |
|-------------|-----------|-------------|
| Checkbox, text, color | **With Live Commands** | User expects immediate visual feedback |
| New form, redesign | **Without Live Commands** | Building from scratch, no existing UI to update |

**Rule:** If user sees an existing element to change → use live commands. If creating new → skip live commands.

---

## Unified Workflow

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
                        ↓
                    Deploy
```

**Benefits:**
- User continues working during "updating" phase
- No lost input - captured in "pre-deploy" phase
- Smooth transition, state preserved across reload
- Same workflow for all change types

---

## Complete Workflow Steps

### Step 1: Start Updating Phase

Signal to client that AI is working. Show non-blocking toast.

```bash
# Signal start
curl -X POST "http://localhost:3000/workspaces/default/cooking" \
  -H "Content-Type: application/json" \
  -d '{"message":"AI is cooking the UI changes..."}'
```

**Client shows:** Toast at top center  
**User can:** Continue typing, clicking, interacting normally

---

### Step 2: Optional Live Commands (Quick Feedback)

**Use for:** Checkbox toggles, text updates, style changes - when user expects immediate visual feedback.

```bash
# Update UI instantly (user sees change while toast is showing)
curl -X POST http://localhost:3000/command \
  -d '{"action":"uncheck","selector":"#task1"}'

# Batch multiple commands
curl -X POST http://localhost:3000/command \
  -H "Content-Type: application/json" \
  -d '{"commands": [
    {"action":"uncheck","selector":"#task1"},
    {"action":"setText","selector":"#title","value":"New Title"},
    {"action":"setStyle","selector":"#header","value":{"color":"red"}}
  ]}'
```

**Skip this step for:** New forms, complete redesigns (no existing UI to update).

---

### Step 3: Edit Shadow Files

Edit your workspace (shadow/) while user continues working.

```bash
# Read current files
Read shadow/index.html
Read shadow/style.css
Read shadow/app.js

# Edit files with new content
Write shadow/index.html   # New HTML
Write shadow/style.css    # New styles  
Write shadow/app.js       # New logic
```

**Important:**
- Use placeholder values (don't worry about current user input yet)
- Build complete new UI
- Keep script imports: freeflow-core.js, freeflow-collectors.js, app.js

---

### Step 4: Signal Pre-Deploy (Blocking)

Lock user input, capture final state.

```bash
# Signal to client: "Freeze, send final state"
curl -X POST "http://localhost:3000/workspaces/default/pre-deploy" \
  -H "Content-Type: application/json" \
  -d '{"updateId":"upd-123"}'
```

**Client does:**
1. Dismisses toast
2. Shows blocking overlay: "AI is deploying..."
3. Sends final state sync with `isFinal: true`
4. Blocks all user input

**You:** Wait momentarily for state file to be updated.

---

### Step 5: Read State and Update Shadow

Capture user input before deploying.

```bash
# Read the final synced state
Read stage/state.json
```

**Example state:**
```json
{
  "values": {
    "formValues": {
      "username": "john_doe",
      "email": "john@example.com",
      "subscribe": true
    },
    "activeTab": "settings"
  }
}
```

**Update shadow with state:**

```bash
# Apply relevant state to shadow HTML
# - checkbox checked? --> add "checked" attribute
# - input has value? --> add "value=\"...\"" attribute
# - tab selected? --> add "active" class

Edit shadow/index.html (bake state values into HTML attributes)
```

**State preservation decisions:**
- New UI has same fields? → Apply values
- Complete redesign? → Selectively apply or start fresh
- User explicitly wants reset? → Ignore state

---

### Step 6: Deploy

Copy shadow to stage.

```bash
# Deploy: rsync shadow/ → stage/
bash .claude/skills/playground/deploy.sh
```

**What happens:**
- Copies all shadow files to stage/
- Overwrites old stage content
- New files are now live (but client hasn't reloaded yet)

---

### Step 7: Signal Reload

Trigger page reload with state restoration.

```bash
# Signal reload
curl -X POST "http://localhost:3000/workspaces/default/reload" \
  -H "Content-Type: application/json" \
  -d '{"updateId":"upd-123"}'
```

**Client does:**
1. Saves scroll position and focused element
2. Reloads page (shows new UI from stage/)
3. Restores scroll position
4. Restores focus (if element exists in new UI)
5. New UI displays with baked-in state values

---

## Example: Checkbox Toggle (With Live Commands)

```bash
# ===== PHASE 1: UPDATING =====
curl -X POST "/workspaces/default/cooking" \
  -d '{"message":"Updating tasks..."}'

# ===== PHASE 2: LIVE COMMANDS =====
# User sees checkbox untick immediately
curl -X POST "/command" \
  -d '{"action":"uncheck","selector":"#task1"}'

# ===== PHASE 3: EDIT SHADOW =====
Read shadow/index.html
# Shadow already has the right structure, just need to match live change
Edit shadow/index.html (remove 'checked' from task1 if present)

# ===== PHASE 4: PRE-DEPLOY =====
curl -X POST "/workspaces/default/pre-deploy" \
  -d '{"updateId":"upd-123"}'

# ===== PHASE 5: READ STATE & UPDATE =====
Read stage/state.json
# Check if other tasks have state to preserve
Edit shadow/index.html (apply any other checkbox states from state.json)

# ===== PHASE 6: DEPLOY =====
bash deploy.sh

# ===== PHASE 7: RELOAD =====
curl -X POST "/workspaces/default/reload" \
  -d '{"updateId":"upd-123"}'
```

---

## Example: New Login Form (No Live Commands)

```bash
# ===== PHASE 1: UPDATING =====
curl -X POST "/workspaces/default/cooking" \
  -d '{"message":"Creating login form..."}'

# ===== PHASE 2: (Skip live commands - nothing to update live)

# ===== PHASE 3: EDIT SHADOW =====
Read shadow/index.html

Write shadow/index.html '''
  // ... login form HTML with placeholder values ...
'''
Write shadow/style.css (login styles)
Write shadow/app.js (login collectors)

# ===== PHASE 4: PRE-DEPLOY =====
curl -X POST "/workspaces/default/pre-deploy" \
  -d '{"updateId":"upd-456"}'

# ===== PHASE 5: READ STATE & UPDATE =====
Read stage/state.json
# Previous form had username, preserve it
Edit shadow/index.html (add value="john" if previous form had username field)

# ===== PHASE 6: DEPLOY =====
bash deploy.sh

# ===== PHASE 7: RELOAD =====
curl -X POST "/workspaces/default/reload" \
  -d '{"updateId":"upd-456"}'
```

---

## Live Command Actions

| Action | Description | Value Example |
|--------|-------------|---------------|
| `check` / `uncheck` | Toggle checkbox | (no value) |
| `setText` | Change text content | `"New text"` |
| `setHtml` | Replace inner HTML | `"&lt;div&gt;...&lt;/div&gt;"` |
| `setValue` | Input values | `"typed text"` |
| `setStyle` | CSS styles | `{"color":"red"}` |
| `addClass` / `removeClass` / `toggleClass` | CSS classes | `"completed"` |
| `click` | Trigger click | (no value) |
| `focus` | Focus element | (no value) |
| + more | See full list in core.js | |

---

## State Preservation Guide

### When to Preserve

| Scenario | Decision | Example |
|----------|----------|---------|
| Common fields | ✓ Preserve | Old has "username", new has "username" → copy value |
| Complete redesign | △ Selective | Choose important values only |
| User reset request | ✗ Ignore | Follow user intent, start fresh |
| No matching fields | ✗ Ignore | New UI starts with defaults |

### HTML Mapping

```javascript
// From state.json
{
  "formValues": {
    "email": "john@example.com",
    "agree": true,
    "tab": "settings"
  }
}

// To HTML:
// Text:  value attribute
&lt;input id="email" value="john@example.com"&gt;

// Checkbox: checked attribute
&lt;input type="checkbox" id="agree" checked&gt;

// Tab: active class
&lt;button class="tab active" data-tab="settings"&gt;Settings&lt;/button&gt;
```

---

## Protected Files - NEVER EDIT

These enable the workflow:
- `freeflow-core.js` - Handles messages, UI phases, state restore
- `freeflow-collectors.js` - Collects form values, selections
- `.claude/` directory - Skills and config
- Script tags: `&lt;script src="freeflow-*.js"&gt;`

---

## Error Handling

### Deploy Fails
```
deploy.sh exits with error
  ↓
Check terminal output
  ↓
Fix issue (permissions, disk space)
  ↓
Retry: bash deploy.sh
  ↓
Continue: curl reload
```

### State Read Empty
```
Read stage/state.json → {}
  ↓
Normal if user hadn't interacted
  ↓
Proceed with deploy using defaults
```

### Taking Too Long
```
User sees "AI is deploying..." for &gt;3 min
  ↓
User may ask in chat: "What's taking so long?"
  ↓
Reply via terminal, continue working
  ↓
User waits for completion
```

---

## Workspace Structure

```
workspaces/default/
├── stage/                      # ← Live UI (user sees this)
│   ├── index.html             # Current page
│   ├── style.css              # Current styles
│   ├── app.js                 # Business logic
│   ├── freeflow-core.js       # ← INFRASTRUCTURE
│   ├── freeflow-collectors.js # ← INFRASTRUCTURE
│   └── state.json             # Synced user state
│
└── shadow/                     # ← YOUR edit workspace
    ├── index.html             # Draft page
    ├── style.css              # Draft styles
    └── app.js                 # Draft business logic
```

**Process:** Edit in shadow → Deploy to stage → Served to user

---

## Quick Reference

```bash
# Full workflow commands
curl -X POST /workspaces/default/cooking     -d '{"message":"..."}'
curl -X POST /workspaces/default/pre-deploy  -d '{"updateId":"..."}'
curl -X POST /workspaces/default/reload      -d '{"updateId":"..."}'
bash .claude/skills/playground/deploy.sh

# Optional live commands during cooking phase
curl -X POST /command -d '{"action":"...","selector":"...","value":"..."}'
```
