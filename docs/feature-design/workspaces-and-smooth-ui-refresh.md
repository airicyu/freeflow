# Freeflow: Multi-Workspace Support + Smooth UI Refresh

## Overview

This design addresses two key improvements:
1. **Remove Vite** - Use static file server instead of Vite dev server
2. **Smooth UI refresh** - Replace HMR with controlled reload phases
3. **Multi-workspace support** - Serve multiple workspaces from one server

---

## Architecture Changes

### Before: Vite + Single Workspace

```
services/
├── Bun server (port 3000) - WebSocket + API
├── Vite dev server (port 3001) - Serves /workspaces/default/stage/
└── Claude PTY - Edits /workspaces/default/shadow/

workspaces/
└── default/
    ├── stage/  ← Vite serves this
    └── shadow/
```

**Problems:**
- Vite HMR causes full page reload (no state preservation)
- Only one workspace
- Second process to manage (Vite)

### After: Static Server + Multi-Workspace

```
services/
├── Bun server (port 3000) - WebSocket + API + static files
└── Claude PTY(s) - One per workspace

workspaces/
├── default/
│   ├── stage/  ← Bun serves files directly
│   └── shadow/
├── project-alpha/
│   ├── stage/
│   └── shadow/
└── sessions/
    └── sess-xxx/
        ├── stage/
        └── shadow/
```

---

## Part 1: Static File Server

### URL Design

```
http://localhost:3000/workspaces/default/*    →  ./workspaces/default/stage/*
http://localhost:3000/workspaces/alpha/*      →  ./workspaces/alpha/stage/*
http://localhost:3000/sessions/sess-xxx/*      →  ./workspaces/sessions/sess-xxx/stage/*
```

### Server Implementation

```typescript
// bun-server/src/server.ts
async fetch(req) {
  const url = new URL(req.url);

  // Route workspace requests
  const match = url.pathname.match(/\/(workspaces|sessions)\/([^\/]+)\/(.*)/);
  if (match) {
    const [, type, workspaceId, filepath] = match;
    const path = `./workspaces/${type}/${workspaceId}/stage/${filepath || 'index.html'}`;
    return new Response(Bun.file(path));
  }

  // ... WebSocket, API routes
}
```

---

## Part 2: Smooth UI Refresh Flow

### The Problem with Current HMR

Vite HMR causes **full page reload** for HTML changes:
1. User typing in a form
2. AI deploys new UI
3. **FLASH** - Page refreshes
4. User loses:
   - Form input focus
   - Scroll position
   - Dropdown selections
   - Everything!

### The Solution: Phased Reload

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│ User asks   │────▶│ AI receives  │────▶│ WS: ui_cooking  │
│ for change  │     │ request      │     │ Show toast      │
└─────────────┘     └──────────────┘     └─────────────────┘
                                                │
                                                │ User types normally
                                                │ Live commands applied
                                                ├────────────────┐
                                                │                │
┌─────────────┐     ┌──────────────┐     ┌────────────┐   ┌──────▼──────────┐
│ Page reload │◀────│ WS: reload   │◀────│ Deploy     │◀──│ AI reads state, │
│ (smooth)    │     │              │     │ shadow→stage│   │ updates shadow  │
└─────────────┘     └──────────────┘     └────────────┘   └─────────────────┘
                                                │
                                         ┌──────▼──────────┐
                                         │ WS: pre_deploy  │
                                         │ Blocking overlay│
                                         │ Final state send│
                                         └─────────────────┘
```

### Message Protocol

#### 1. ui_cooking (Non-blocking)

```typescript
// Server → Client (WebSocket)
{
  type: "ui_cooking",
  updateId: "upd-123",
  message: "AI is cooking the UI changes..."
}
```

**Client behavior:**
- Shows toast at top center
- User can interact normally
- State continues syncing
- Live commands (DOM updates) still work

**Visual:**
```
┌─────────────────────────────────────┐
│  🔄 AI is cooking the UI changes... │  ← Top center, small, non-blocking
├─────────────────────────────────────┤
│                                     │
│  [User can still type/interact]    │  ← UI fully functional
│                                     │
└─────────────────────────────────────┘
```

#### 2. ui_pre_deploy (Blocking)

```typescript
// Server → Client (WebSocket)
{
  type: "ui_pre_deploy",
  updateId: "upd-123"
}

// Client → Server (response)
{
  type: "state_sync_result",
  updateId: "upd-123",
  data: {
    formValues: { username: "john", ... },
    isFinal: true  // Signal this is the last sync
  }
}
```

**Client behavior:**
- Dismisses cooking toast
- Shows thin overlay (blocks input)
- Sends final state sync
- UI is now frozen

**Visual:**
```
┌─────────────────────────────────────┐
│  🔄 AI is deploying...             │  ← Top center
├─────────────────────────────────────┤
│                                     │
│  [Gray overlay, no interaction]    │  ← Input blocked
│                                     │
└─────────────────────────────────────┘
```

**Why block?**
- Prevents new input from happening
- Ensures AI reads consistent state
- No race conditions

#### 3. ui_reload (Finally)

```typescript
// Server → Client (WebSocket)
{
  type: "ui_reload",
  updateId: "upd-123"
}
```

**Client behavior:**
1. Save scroll position
2. Save focused element ID
3. Save any other UI state
4. `window.location.reload()`

**After reload:**
1. Page loads with new UI from stage/
2. Restore scroll position
3. Restore focus (if element still exists)

### State Preservation

```typescript
// freeflow-core.js
class FreeflowCore {
  beforeReload() {
    // Save state for restoration
    sessionStorage.setItem('ff-internal-scroll', String(window.scrollY));
    sessionStorage.setItem('ff-internal-focus', document.activeElement?.id || '');
  }

  afterReload() {
    // Restore after page loads
    const scroll = sessionStorage.getItem('ff-internal-scroll');
    const focusId = sessionStorage.getItem('ff-internal-focus');

    if (scroll) {
      window.scrollTo(0, parseInt(scroll, 10));
      sessionStorage.removeItem('ff-internal-scroll');
    }

    if (focusId) {
      document.getElementById(focusId)?.focus();
      sessionStorage.removeItem('ff-internal-focus');
    }
  }
}

// Call afterReload on page load
window.addEventListener('DOMContentLoaded', () => {
  window.freeflow.restoreAfterReload();
});
```

### Why This Solves the Stale State Problem

**Old approach (racy):**
```
AI reads state → [user types more] → AI deploys
     ↑                              ↓
  outdated!                     User loses input
```

**New approach (blocking):**
```
AI: pre_deploy → Client blocks input → Client sends final state
                                                ↓
AI reads state (fresh) → AI updates shadow → Deploy → Reload
```

The blocking overlay ensures no new input between "AI decides to read" and "AI finishes deploying".

---

## Part 3: Critical - State Exclusion

### The Problem

If we collect "AI is cooking the UI changes..." toast as state:
```
1. Toast visible → collected in state.json
2. AI sees "there's an updating dialog" → includes dialog in new HTML
3. Page reloads
4. AI's dialog (in HTML) + real toast (from new ui_cooking message)
5. **BUG: Double dialogs!**
```

### The Solution

**Mark infrastructure UI elements, exclude from collection:**

```html
<!-- Infrastructure elements - NOT collected -->
<div id="ff-internal-internal-cooking-indicator">...</div>
<div id="ff-internal-internal-deploy-overlay">...</div>
<div data-ff-internal-internal>...</div>
```

```typescript
// freeflow-collectors.js
function collectState() {
  const state = {};

  // Run user collectors, skip infrastructure
  for (const [name, collector] of window.freeflow.collectors) {
    state[name] = collector();
  }

  return state;
}

// Check if element should be excluded
function isInfrastructure(el) {
  return (
    el.id?.startsWith('ff-internal-internal-') ||
    el.closest('[data-ff-internal-internal]') !== null
  );
}
```

**Convention:** All Freeflow-owned elements have:
- `id` starting with `ff-internal-internal-` (e.g., `ff-internal-internal-cooking-indicator`)
- `data-ff-internal-internal` attribute
- NOT collected by state collectors

---

## Part 4: AI Skill Flow

### Pseudo-code

```typescript
// AI receives user request for UI changes

async function deployUIChanges(workspaceId: string) {
  // Step 1: Signal cooking phase (non-blocking)
  await broadcastToWorkspace(workspaceId, {
    type: "ui_cooking",
    updateId: generateId(),
    message: "AI is cooking the UI changes..."
  });

  // Step 2: AI does its work
  // - User can interact
  // - State keeps syncing
  // - Live commands applied
  await aiWorkOnShadowFiles();

  // Step 3: Signal pre-deploy (blocking)
  await broadcastToWorkspace(workspaceId, {
    type: "ui_pre_deploy",
    updateId: currentUpdateId
  });

  // Step 4: Read final state
  const state = await readStateFile(workspaceId);

  // Step 5: Update shadow UI to reflect state (if applicable)
  // If new UI is similar, preserve form values
  // If new UI is completely different, ignore state
  if (shouldPreserveState(state)) {
    await updateShadowWithState(state);
  }

  // Step 6: Deploy
  await runDeployScript(workspaceId);  // rsync shadow → stage

  // Step 7: Signal reload
  await broadcastToWorkspace(workspaceId, {
    type: "ui_reload",
    updateId: currentUpdateId
  });
}
```

### State Applicability Logic

```typescript
function shouldPreserveState(state) {
  // AI checks if state values can be applied to new UI
  // Examples:
  // - Form field 'username' exists in new UI → preserve
  // - New UI is completely different (dashboard → settings) → ignore
  // - Partial match → preserve matching fields
}
```

---

## Part 5: Multi-Workspace Structure

### Directory Layout

```
workspaces/
├── default/                    # Default workspace
│   ├── stage/                 # What user sees
│   │   ├── index.html
│   │   ├── main.js
│   │   └── style.css
│   ├── shadow/                # AI edits here
│   └── .claude/              # Claude config per workspace
│
├── project-alpha/              # Named workspace
│   ├── stage/
│   ├── shadow/
│   └── .claude/
│
└── sessions/                  # Ephemeral workspaces
    ├── sess-abc123/
    │   ├── stage/
    │   └── shadow/
    └── sess-def456/
```

### Workspace Types

| Type | URL | Lifecycle |
|------|-----|-----------|
| Named | `/workspaces/{name}/*` | Persistent - created/deleted explicitly |
| Session | `/sessions/{id}/*` | Ephemeral - auto-cleanup after idle |

### Workspace Resolution

```typescript
class WorkspaceManager {
  resolve(workspaceId: string, type: 'named' | 'session'): Workspace {
    const basePath = type === 'session'
      ? `./workspaces/sessions/${workspaceId}/`
      : `./workspaces/${workspaceId}/`;

    return {
      id: workspaceId,
      type,
      stagePath: join(basePath, 'stage'),
      shadowPath: join(basePath, 'shadow'),
    };
  }
}
```

---

## Part 6: Error Handling

### Failed Deploy (deploy.sh fails)

**Behavior:**
- rsync returns non-zero exit code
- AI sees error in terminal output
- AI can diagnose (permission error, disk full, etc.)
- User can see AI's response
- User can tell AI to retry

**No automatic retry needed** - AI handles it.

### Timeout Between Phases

**Typical timing:**
- `ui_pre_deploy` to `ui_reload`: 1-3 minutes (AI updating shadow)

**If longer:**
- User sees "AI is deploying..." overlay
- User can check terminal (Claude side) for progress
- User can type in chat "what's taking so long?"
- AI responds

**No automatic timeout** - let AI handle through chat.

---

## Part 7: Implementation Summary

### Server Changes (freeflow-app/)

1. **Remove Vite**
   - Delete `src/vite.ts`
   - Update `src/server.ts` to serve static files
   - Remove Vite dependency from `package.json`

2. **Add workspace routing**
   - Handle `/workspaces/{id}/*` and `/sessions/{id}/*`
   - Serve files from `stage/` subdirectory

3. **Add WebSocket phases**
   - `ui_cooking` - broadcast to workspace clients
   - `ui_pre_deploy` - broadcast to workspace clients
   - `ui_reload` - broadcast to workspace clients

4. **Add HTTP endpoints**
   - `POST /workspaces/{id}/cooking` - AI triggers cooking
   - `POST /workspaces/{id}/pre-deploy` - AI triggers pre-deploy
   - `POST /workspaces/{id}/reload` - AI triggers reload
   - `POST /workspaces/{id}/sync` - Trigger state sync

### Client Changes (workspaces/_shared/)

1. **Update freeflow-core.js**
   - Handle `ui_cooking` → show non-blocking toast
   - Handle `ui_pre_deploy` → show blocking overlay
   - Handle `ui_reload` → save state, reload, restore state
   - Restore scroll and focus after reload

2. **Update freeflow-collectors.js**
   - Exclude elements with `id` starting with `ff-internal-`
   - Exclude `[data-ff-internal-infrastructure]` elements

3. **Add CSS**
   - Styles for cooking toast (top center, non-blocking)
   - Styles for deploy overlay (thin, blocking)

### AI Skill Changes

1. **Update deploy skill**
   - Send `ui_cooking` at start
   - Send `ui_pre_deploy` before reading state
   - Read state, update shadow if applicable
   - Send `ui_reload` after deploy

---

## Visual Summary

### Phase 1: Cooking
```
╔════════════════════════════════════════════╗
║  🔄 AI is cooking the UI changes...       ║  ← Small toast, top center
╠════════════════════════════════════════════╣
║                                            ║
║  ┌────────────────────────────────────┐    ║
║  │  Username: [john                ]  │    ║  ← User can type
║  │  Email:    [john@example.com    ]  │    ║
║  │                                    │    ║
║  │  [Save]  [Cancel]                  │    ║
║  └────────────────────────────────────┘    ║
║                                            ║
╚════════════════════════════════════════════╝
```

### Phase 2: Pre-deploy
```
╔════════════════════════════════════════════╗
║  🔄 AI is deploying...                    ║  ← Top center
╠════════════════════════════════════════════╣
║  ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒   ║  ← Thin gray overlay
║  ▒                                      ▒   ║
║  ▒  ┌───────────────────────────────────┐▒ ║
║  ▒  │  Username: [john                ]  │▒ ║  ← Frozen
║  ▒  │  Email:    [john@example.com    ]  │▒ ║
║  ▒  └───────────────────────────────────┘▒ ║
║  ▒                                      ▒   ║
╚════════════════════════════════════════════╝
```

### Phase 3: Reload
```
[Page reloads]

╔════════════════════════════════════════════╗
║                                            ║
║  ┌────────────────────────────────────┐     ║
║  │  ✅ Profile saved!                 │     ║  ← New UI
║  │                                    │     ║
║  │  Name:     [John Doe            ] │     ║  ← Restored scroll
║  │  Bio:      [Software developer  ] │     ║  ← Restored focus
║  │                                    │     ║
║  └────────────────────────────────────┘     ║
║                                            ║
╚════════════════════════════════════════════╝
```

---

## Questions?

See `CLAUDE.md` for project context.
