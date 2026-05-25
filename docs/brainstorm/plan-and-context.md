# Freeflow Project Plan & Context

## Project Vision
**Goal**: Build an interactive AI-powered playground where:
- Left side: Chat interface
- Right side: Free-form playground for building UIs, mockups, diagrams, etc.
- User and AI brain collaborate iteratively on creating and modifying the main view

**Key Insight (2024-05-23)**: Using HTML/CSS/JS instead of Canvas could solve the "blind AI" problem elegantly. The AI can understand and generate HTML natively, and the DOM structure IS the state representation.

## Current Constraints
- **Cannot use Anthropic API directly** (no API key or access)
- **Must use synthetic wrapper command `claudep`** that:
  - Loads environment variables for API keys
  - Loads environment variables for AI brain
  - Then spawns actual AI brain CLI
- Works similar to "claude with it connecting to other AI models"

## Architecture Drafted

```
Browser (Chat + Canvas)
    ↕ WebSocket
Bun Server (message router, conversation state)
    ↕ stdin/stdout (spawn)
claudep (user's wrapper)
    ↓
AI brain (the actual AI CLI)
```

## Key Requirements Identified

1. **Stateful AI Memory Required**
   - User will iteratively refine the canvas
   - Example: "Draw a login form" → "Make the button blue" → "Add a sidebar"
   - AI brain must remember what's on canvas, what was discussed

2. **AI Must Output Structured Commands**
   - Not just text replies
   - Machine-readable canvas manipulation commands:
   ```json
   {
     "reply": "I'll draw a login form",
     "canvas": {
       "actions": [
         { "cmd": "draw_rect", "x": 100, "y": 100, "w": 200, "h": 300, "color": "white" },
         { "cmd": "add_text", "text": "Login", "x": 200, "y": 150 }
       ]
     }
   }
   ```

3. **Protocol Between Bun Server and AI**
   - Bun sends: User message + context
   - AI receives: Instruction
   - AI outputs: JSON with chat reply + canvas commands
   - Bun broadcasts: To browser via WebSocket
   - Browser renders: Canvas updates

## Critical Problem: The AI Brain is BLIND

**The Problem**: The AI brain outputs commands to draw elements, but it **never sees the result**. It issues commands but has no visual feedback of the actual canvas state.

**Example scenario that breaks**:
1. User: "Draw a login form"
2. AI brain: `{cmd: "draw_rect", x: 100, y: 100}` → Browser draws rectangle
3. User: "Make the button blue"
4. AI brain: "What button?" ❌

The AI brain doesn't know:
- Where the button is located (coordinates)
- What elements actually exist on canvas
- The visual appearance of what it created

### Possible Solutions

#### Solution 1: DOM-to-Text Representation
Bun server serializes the current canvas state as text/description and sends to AI brain:

```json
{
  "user_message": "Make the button blue",
  "canvas_state": [
    {"id": "rect-1", "type": "rect", "x": 100, "y": 100, "w": 200, "h": 50, "fill": "white"},
    {"id": "text-1", "type": "text", "x": 200, "y": 130, "content": "Login"}
  ]
}
```

**Pros**: Text-only, works with any AI
**Cons**: May misunderstand spatial relationships, verbose for complex scenes

#### Solution 2: Screenshot + Vision
- Take screenshot of canvas (canvas.toDataURL or dom-to-image)
- Send image + user message to AI
- AI "sees" the canvas

**Pros**: Natural, like human interaction
**Cons**: 
- Requires AI with vision capability
- **Token cost is INSANE**: 800x600 image = 100K+ tokens per request
- Adds latency
- Heavy payload
- Not sustainable for iterative back-and-forth

**Use case only**: Occasional complex layout review, not every message

#### Solution 3: Named Elements Registry
- Everything AI creates gets a semantic ID/name
- "draw_rect ... label: login-button"
- AI brain receives: "Current canvas: [login-button at (100,100), username-input at (100,200)]"

**Pros**: Compact, semantically meaningful
**Cons**: Requires discipline in naming, may not capture visual details

#### Solution 4: Hybrid Approach
- Use named elements for programmatic manipulation
- Use descriptions for "make it look nicer" feedback loops

#### Solution 5: Command Echo / Diff-Based State
AI sends commands → Bun executes → Bun sends back "diff/confirmation" showing what changed.

```
User: "Draw a login form"
AI: {actions: [{cmd: "draw_rect", id: "btn", ...}, {cmd: "draw_text", id: "lbl", ...}]}
Bun → AI: "Executed: created btn (rect, 100,100), lbl (text, 200,150)"
User: "Make btn blue"
AI: Knows "btn" is the rect at 100,100
```

**Pros**: Minimal tokens, builds up state gradually, semantic IDs persist
**Cons**: AI relies on its own memory of what it created

#### Solution 6: Sparse Vision (On-Demand Screenshots)
Don't send screenshot every message. Only send when:
- User says "this", "that", "the red one" (ambiguous reference)
- User explicitly asks "what do you see?"
- AI asks "can you show me the current state?"

**Pros**: 99% of messages are cheap text, only expensive when needed
**Cons**: Requires some intelligence to know when to ask for vision

#### Solution 7: File Mirror / Live Filesystem Sync (User's Proposal)
**Concept**: The browser's playground state is serialized and written to actual files that the AI can read.

**Flow:**
```
Browser (playground HTML/CSS/JS state)
    ↓ serialize
WebSocket → Bun Server
    ↓ write files
./playground/
  ├── index.html
  ├── styles.css
  ├── script.js
  └── state.json (UI state like form values, etc.)
    ↓ AI reads
AI Brain (sees full source as files)
    ↓ edits
AI outputs: updated files OR edit commands
    ↓ Bun applies
Browser re-renders
```

**Key Idea**: The AI brain has access to a **live file system** that mirrors the browser state. It can:
- `cat index.html` to see current structure
- `cat styles.css` to see styling
- Edit files and Bun syncs back to browser

**Pros**:
- AI is very good at reading/writing files
- Natural for AI to think in "edit this file" terms
- Files are "ground truth" - clear mental model
- Can use AI's existing file editing capabilities (Claude Code's specialty!)
- Replaces complex serialization protocols

**Cons**:
- Need to sync bidirectionally (browser ↔ files ↔ AI)
- Race conditions if browser and AI edit simultaneously
- File I/O overhead
- What about transient UI state (scroll position, focus)?

**Twist**: This leverages Claude Code's strength - it's already designed to edit files!

**Implementation idea**: 
1. Browser playground state is always backed by files
2. AI can read/modify files using its normal file tools
3. Bun watches files and syncs to browser via WebSocket

### The Runtime State Problem (Critical Insight)

User identified a key distinction:

**Static Source (Easy)**:
- `index.html` - markup structure
- `styles.css` - styling rules  
- `script.js` - behavior code
- These are files that can be dumped and synced

**Runtime State (Hard)**:
- Form input values (what user typed)
- Which tab is active
- Toggle/checkbox states
- Scroll position
- Component internal state (React/Vue/etc)
- Variables in running JS

**Problem**: Runtime state lives in JavaScript memory, not in files. A generic script can't capture "what the user typed in that input" without specific knowledge of the app's state management.

**Implication**: The File Mirror approach works for **source code** but not for **live UI state**. The AI sees the code but not "the form has username='john' and password='secret' entered".

**Possible Solutions**:
1. **Stateless UI**: Design the playground so it doesn't have meaningful runtime state (static mockups only)
2. **Explicit State Export**: Browser periodically serializes known state to `state.json`
3. **Hybrid**: Source via files, runtime state via explicit message when user triggers action
4. **Accept Limitation**: AI designs the UI, user interacts, but AI doesn't see the interaction results unless explicitly told

## Open Decision: Option A vs Option B

### Option A: Persistent AI Process
- Spawn `claudep --daemon` once, keep it running
- Send messages via stdin, receive responses via stdout
- Pros: Natural conversation flow, no need to resend context
- Cons: AI brain has TUI (Terminal UI) - spawning raw may be tricky

### Option B: Stateless AI with Bun-Managed State
- Bun server maintains full conversation + canvas state
- Each request: Send complete history + canvas snapshot to fresh AI spawn
- Pros: Clean process per request, no TUI complexity
- Cons: Heavy payloads, need to serialize full context each time

**Status**: Pending user decision pending feasibility discussion

## Canvas vs HTML/CSS: A Critical Pivot

### Original Idea: Canvas
- AI outputs drawing commands: `{cmd: "draw_rect", x: 100, y: 100}`
- Browser renders pixels to `<canvas>` element
- **Problem**: AI is BLIND to the output - needs screenshots (expensive) or complex state serialization

### New Idea: HTML/CSS Playground
- AI outputs actual HTML/CSS/JS (or structured JSON that maps to DOM)
- Browser renders to a `<div id="playground">` element
- **Advantage**: AI understands HTML natively! The DOM **IS** the state.

**The "Aha!" moment:**
```
User: "Draw a login form"
// Instead of: {cmd: "draw_rect", ...}
AI outputs: "<div class='login-form'><input placeholder='Username'/><button>Login</button></div>"

User: "Make the button blue"
AI receives current HTML: "<div class='login-form'>...<button>Login</button>...</div>"
AI outputs: "<style>.login-form button { background: blue; }</style>" OR updates the HTML
```

**Why this is MUCH easier:**
1. **No blindness problem**: Send current HTML as text → AI understands instantly
2. **Text-to-text**: What LLMs excel at (vs. interpreting canvas pixel data)
3. **Self-describing**: `<button>` tells AI "this is a button"
4. **Semantic**: CSS classes give meaning (`.primary-btn` vs remembering rect at 100,100)
5. **Way cheaper**: HTML text is ~1K tokens vs 100K for screenshots
6. **AI already knows**: HTML/CSS from training data

### Two Implementation Flavors

#### Flavor A: Full HTML String
AI outputs complete HTML + CSS. Bun replaces the entire playground content.

```json
{
  "reply": "Here's a login form",
  "html": "<div class='card'><input/><button class='btn-primary'>Login</button></div>",
  "css": ".card { padding: 20px; } .btn-primary { background: blue; }"
}
```

**Pros**: AI sees/controls everything at once  
**Cons**: Full replacement, not incremental

#### Flavor B: Structured DOM Operations
AI outputs DOM manipulation commands.

```json
{
  "reply": "Adding a button",
  "operations": [
    {"op": "create", "tag": "button", "id": "login-btn", "text": "Login"},
    {"op": "style", "selector": "#login-btn", "css": "background: blue"}
  ]
}
```

**Pros**: Precise control, preserves existing elements  
**Cons**: More complexity on Bun side

## Recommendation

**Use Flavor A (Full HTML) for simplicity:**
- Start with full HTML replacement
- AI gets to see the entire current HTML before responding
- Natural for LLMs to generate complete markup
- Can evolve to Flavor B (incremental) later if needed

## Token Cost Analysis

**Vision approach is prohibitive for an interactive tool:**
- 800x600 screenshot ≈ 100K-150K tokens
- 10 back-and-forth messages = 1M+ tokens
- Claude API: ~$15/million input tokens → **$15+ just for 10 interactions**
- Even with Claude Code CLI (flat rate), heavy usage becomes expensive

**Recommendation**: Avoid vision as primary mechanism. Use it only for "show me" moments.

## Outstanding Questions

1. **Blind AI + Cost**: Solutions 5 (Command Echo) or 6 (Sparse Vision) seem most practical. Which direction?
2. **Feasibility**: Can `claudep` wrapper be modified for `--daemon` mode?
3. **Canvas tech**: HTML5 Canvas 2D, SVG, or library (Fabric.js/Konva.js)?
4. **Configuration**: Generic (any AI command) or hardcoded to `claudep`?
5. **TUI handling**: How to handle AI brain's TUI if going persistent (Option A)?

## Technical Stack
- Bun.js for server
- WebSocket for browser-server comms
- HTML/CSS playground (DOM-based, not Canvas) for the main view
- AI brain CLI via wrapper

## Outstanding Questions (Updated)

1. **HTML Playground Approach**: 
   - Flavor A: Full HTML replacement (simple, stateless)
   - Flavor B: Incremental DOM operations (complex, precise)
   - **Flavor C**: File Mirror (live files that AI reads/edits) ← NEW

2. **AI Context Strategy**:
   - If Flavor A: Send full HTML on each request (may get large)
   - If Flavor C: AI reads from files directly (leverages Claude Code's file tools)

3. **Key Decision**: 
   - Flavor C (File Mirror) seems promising - uses AI's existing file editing capabilities
   - But requires persistent AI process with file system access

4. **Feasibility**: 
   - Can `claudep` wrapper be modified for `--daemon` mode?
   - Can AI access/modify files in a sandbox directory?
   - How to sync browser ↔ files bidirectionally?

5. **Configuration**: 
   - Generic (any AI command) or hardcoded to `claudep`?

6. **State Synchronization**:
   - Browser edits → Serialize → Write files → AI sees
   - AI edits → File watcher → Notify Bun → Push to browser
   - Conflict resolution if both edit simultaneously?

7. **Runtime State Gap**:
   - File mirror captures static source (HTML/CSS/JS)
   - But NOT runtime state (form values, toggles, etc.)
   - How important is it for AI to see live UI state?
   - Can we design around this (static mockups vs interactive apps)?

---

## Change Application Strategies (Idea A/B/C/D)

User asked: When AI brain generates/writes code, how are changes applied to the browser?

### Idea A: Web LLM Translates AI Intent to DOM Ops
**Flow**:
```
User: "Make the button blue"
AI Brain: "Change the button with class 'submit-btn' to blue color"
Web LLM: Parses intent → generates DOM manipulation JS
Browser: Executes JS → button turns blue
```

**Pros**:
- AI brain speaks in natural intent, not code
- Web LLM handles browser-specific implementation
- Clean separation of concerns

**Cons**:
- Requires Web LLM to understand both AI intent AND current DOM
- Translation layer adds complexity and failure modes
- Two LLMs must coordinate

---

### Idea B: AI Brain Generates JS, Browser Evals It
**Flow**:
```
User: "Make the button blue"
AI Brain: Generates JS: `document.querySelector('.submit-btn').style.backgroundColor = 'blue'`
Bun: Sends JS via WebSocket
Browser: eval() or new Function(js)() → applies change
```

**Pros**:
- Direct, no translation layer
- AI has full DOM power
- Simple implementation

**Cons**:
- **SECURITY RISK**: eval() of AI-generated code can be dangerous
- AI must write working JS every time
- Harder to sandbox/validate
- Errors crash the app

**Security mitigation**: Run in sandboxed iframe, use CSP, validate with Web LLM first?

---

### Idea C: File Mirror + Iframe Refresh (File-based)
**Flow**:
```
User: "Make the button blue"
AI Brain: Edits ./playground/styles.css directly
File Watcher: Detects change
Bun: Notifies browser: "files changed"
Browser: Refreshes iframe src or hot-reloads CSS
```

**Pros**:
- Uses standard file editing (Claude Code's strength)
- Natural development workflow (edit file → see result)
- No eval(), no JS generation risk
- Browser loads files normally

**Cons**:
- Full page refresh loses runtime state
- File sync latency
- Iframe isolation may be needed

**Variant: Hot Module Replacement (HMR)**
- Bun server watches files
- Injects CSS changes without refresh
- Full reload only on HTML/JS changes

---

### Idea D: Structured JSON Protocol (Hybrid)
**Flow**:
```
User: "Make the button blue"
AI Brain: Outputs JSON: `{action: "style", selector: ".submit-btn", css: "background: blue"}`
Bun: Validates → sends to browser
Browser: Has set of safe DOM manipulation functions
         → calls `applyStyle(".submit-btn", "background", "blue")`
```

**Pros**:
- Structured, not freeform JS
- Safe: restricted API, no arbitrary code execution
- Easy to validate/transform
- AI doesn't need to write code

**Cons**:
- Limited to predefined operations
- Less flexible than raw JS
- More upfront design of protocol

**Example JSON protocol**:
```json
{
  "action": "update_element",
  "target": { "selector": ".submit-btn" },
  "changes": {
    "style": { "backgroundColor": "blue" },
    "textContent": "Submit"
  }
}
```

---

## Comparison Matrix

| Approach | Security | Flexibility | Simplicity | Performance | Best For |
|----------|----------|-------------|------------|-------------|----------|
| **A** (Web LLM Translates) | High | Medium | Low (complex) | Medium | Complex intent understanding |
| **B** (AI Generates JS) | **Low** | **High** | **High** | **High** | Quick prototyping (risky) |
| **C** (File Mirror) | High | High | Medium | Low (file I/O) | Traditional dev workflow |
| **D** (Structured JSON) | **High** | Medium | **High** | **High** | **Production, recommended** |

---

## User Preference: Idea C with Vite Hot Reload

**Selected**: File Mirror approach with Vite as dev server for hot module replacement.

### Vite Setup
```
./playground/          # AI-editable files
├── index.html
├── style.css
├── main.js
└── vite.config.js

Bun runs: vite ./playground --port 3001
Browser: iframe src="http://localhost:3001"
```

**Benefits**:
- AI edits files → Vite HMR → browser updates automatically
- No custom file watching logic needed
- Industry standard, well tested
- Can handle CSS injection without full reload

---

## Two-Channel Architecture (Clarified)

### Channel 1: Chat Proxy (Human ↔ AI Brain)
```
Browser Chat UI
    ↓ WebSocket
Bun Server
    ↓ stdin/stdout
AI Brain (claudep)
```
**Purpose**: Pure chat conversation. User messages go to AI, AI responses come back.
**Does NOT**: Touch UI directly. Just conversation.

### Channel 2: State Synchronization (Web LLM → Bun Server) ✅ DEFINED
```
Web LLM (in browser, Transformers.js/WebLLM)
    ↓ WebSocket (separate from Channel 1)
Bun Server
    ↓ write file
./sandbox/state.json  (local to AI brain process)
```
**Purpose**: 
- Web LLM analyzes DOM and extracts semantic UI state
- Sends structured state to Bun
- Bun writes to `state.json` in AI brain's working directory
- AI brain can read state.json to understand "what user selected/typed"

**Key Insight**: Channel 2 is one-way Web LLM → Bun (save state), not a conversation.
The state is then read by AI brain via file system when needed.

**Reality check**: Maybe start with Channel 1 only, add Channel 2 when need emerges?

---

## The Remaining Problem: UI Runtime State Visibility

**Current situation with Idea C**:
- ✅ AI sees: `index.html`, `style.css`, `main.js` (static files)
- ❌ AI cannot see: Form values, checkbox states, which tab is selected

**Scenario that still breaks**:
```
User: "Draw a form with username and password fields"
AI: Creates form HTML/CSS

User: (types into form) username: "john", password: "secret123"

User: "Make the password field show an error"
AI: Sees HTML but not that password="secret123" → "What password field? What error?"
```

### Solutions for Runtime State Visibility

#### S1: Periodic State Snapshot (JSON)
Browser periodically dumps known form values to `state.json`:
```json
{
  "formValues": {"username": "john", "password": "secret123"},
  "activeTab": "settings",
  "toggles": {"darkMode": true}
}
```
AI brain reads `state.json` alongside source files.

**Pros**: Simple, explicit
**Cons**: Poll-based, may be stale, doesn't capture everything

#### S2: Explicit Capture Command
User clicks "Show AI the current state" button → Browser snapshot → Sent to AI.

**Pros**: On-demand, user controls when
**Cons**: Manual, interrupts flow

#### S3: Event-Driven State Sync
Browser sends state updates on every user interaction:
```
User types in input → WebSocket → Bun → state.json → AI sees
```

**Pros**: Near real-time
**Cons**: Chatty, high volume of messages, need to throttle

#### S4: Web LLM State Extraction (User's Choice) ✅ SELECTED
**The Web LLM's Job**: Analyze DOM and extract semantic state, not just raw values.

**Example**: AI creates an option selection UI
```html
User selected "Option B" in this radio group:
- Option A: Annual Plan ($100)
- Option B: Monthly Plan ($10) ← SELECTED
- Option C: Free Plan ($0)
```

**Plain JavaScript can't capture**: "User chose Monthly Plan over Annual"
**Web LLM can extract**: Semantic understanding of what the selection means.

**Flow**:
```
1. AI Brain creates UI (radio buttons, forms, etc.) via file edits
2. User interacts (clicks, selects, types)
3. Web LLM (browser side) analyzes DOM → extracts semantic state
4. Channel 2: WebSocket → Bun → writes state.json locally
5. User chats: "Confirm my selection"
6. Channel 1: Sends message + context to AI Brain
7. AI Brain reads state.json → "User selected Monthly Plan" → responds
```

**Pros**: 
- Handles abstract/complex state
- Semantic understanding, not just raw values
- User preference confirmed ✅

**Cons**: 
- Requires Web LLM in browser (Transformers.js/WebLLM)
- Adds complexity
- May have latency for state extraction

#### S5: Design Constraint (No State Visibility)
Design the use case so runtime state doesn't matter:
- AI designs UI mockups (visual only)
- Runtime interaction is "preview mode"
- If state matters, user describes it in chat

**Pros**: Simplest implementation
**Cons**: Less powerful, user must describe state manually

---

## Final Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  BROWSER                                                    │
│  ┌──────────────┐      ┌──────────────┐      ┌────────────┐ │
│  │ Chat UI      │      │ Playground   │      │ Web LLM    │ │
│  │ (React/Vue)  │      │ (Vite iframe)│      │(Transformers│ │
│  └──────┬───────┘      └──────┬───────┘      └─────┬──────┘ │
│         │                     │                    │        │
│         │  ┌─────────────────────────────────────────┐        │
│         │  │ Extracts DOM state → semantic JSON    │        │
│         │  └─────────────────────────────────────────┘        │
└─────────┼─────────────────────┼──────────────────────┼──────────┘
          │                     │                      │
          │ Channel 1           │                      │ Channel 2
          │ (WebSocket)         │                      │ (WebSocket)
          └──────────┬──────────┘                      │
                     │                                 │
┌────────────────────┼─────────────────────────────────┼────────────┐
│                    ▼                                 ▼            │
│  Bun Server    ┌──────────────────┐   ┌──────────────────────┐    │
│                │  Route chat      │   │  Receive state       │    │
│                │  messages to     │   │  from Web LLM        │    │
│                │  AI brain        │   │  → write to file     │    │
│                └────────┬─────────┘   └───────────┬──────────┘    │
│                         │                         │                │
│                         ▼                         ▼                │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │  AI Brain Sandbox                                         │   │
│  │  Working Directory: /tmp/freeflow-session-{id}/           │   │
│  │  ├─ index.html    ← AI edits via file tools              │   │
│  │  ├─ style.css     ← AI edits via file tools              │   │
│  │  ├─ main.js       ← AI edits via file tools              │   │
│  │  └─ state.json    ← Channel 2 writes here               │   │
│  │                        ↑ AI reads to understand user    │   │
│  └───────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────┘
```

## Implementation Components

### 1. Bun Server (hub)
- WebSocket server for Channel 1 (chat)
- WebSocket server for Channel 2 (state sync)
- File system bridge: monitors AI brain edits → notifies browser → HMR via Vite
- State file writer: receives from Channel 2 → writes to AI brain's working dir

### 2. Browser - Chat UI (left panel)
- Simple chat interface
- Sends messages to Bun (Channel 1)
- Receives AI brain responses
- **Does NOT directly modify UI**

### 3. Browser - Playground (right panel)
- iframe: `http://localhost:3001` (Vite dev server)
- Loads from AI brain's working directory
- User interacts with UI (forms, buttons, etc.)

### 4. Browser - Web LLM (background worker)
- Uses Transformers.js or WebLLM
- Watches playground DOM for changes
- Periodic or event-driven state extraction
- Sends structured state via Channel 2

### 5. AI Brain (claudep wrapper)
- Runs as persistent process (Option A)
- Can use file tools to read/write `/tmp/freeflow-session-{id}/`
- Sees: HTML, CSS, JS, state.json
- Edits files directly
- **No stdin/stdout for UI ops** - uses file system!

## File System as "Inter-Process Communication"

| Direction | Mechanism | What |
|-----------|-----------|------|
| AI Brain → Browser | File write → Vite HMR | HTML/CSS/JS changes |
| Browser → AI Brain | Web LLM → Channel 2 → File write | state.json |
| Human → AI Brain | WebSocket Channel 1 | Chat messages |
| AI Brain → Human | WebSocket Channel 1 | Chat responses |

## Critical Design Decision: AI Brain Uses File Tools

**Key Insight**: Instead of AI brain outputting JSON to stdout, it uses its **file editing capability** directly.

```
User: "Make a login form"
  ↓
AI Brain: "I'll create a login form in index.html"
  → Edits /tmp/freeflow-session-{id}/index.html via file tool
  → Vite detects change → HMR → Browser updates

User: (types username "john")
  ↓
Web LLM: Extracts "{username: 'john'}" from DOM input
  → Sends via Channel 2 → Bun writes /tmp/freeflow-session-{id}/state.json

User: "Show me my username"
  ↓
AI Brain: Reads state.json → "Your username is john"
  → Responds via Channel 1
```

## State Navigation (Soft vs Hard Reload)

User requirement: "Navigate UI changes without losing state"

**Solution**: AI Brain maintains state history, can restore previous states.

```
Scenario:
1. AI creates form → user fills it (state captured in state.json)
2. AI modifies form (file edit → Vite HMR → form changes)
3. User: "Go back to previous version"
4. AI Brain: Has previous state.json, can restore values
5. AI edits file back + restores state → soft navigation complete
```

**Implementation**: State.json includes version history or AI brain remembers previous states.

## Web LLM Trigger Mechanism (Q1 Clarified)

**Hybrid approach with skill-based sync control**:

### Periodic Sync (Baseline)
- Web LLM runs sync every ~5-10 seconds automatically
- Captures state drift even without explicit triggers

### Skill-Based Request Sync (On-Demand)
AI Brain can explicitly request sync via Channel 1 → Bun → WebSocket → Web LLM

```
User: "I'm done with my selection"
AI Brain: "Let me check the current state"
  ↓ Uses skill: "/freeflow:request-sync"
  ↓ Claude Code executes MCP tool → sends "REQUEST_SYNC" to Bun
  ↓ Bun broadcasts via WebSocket: "Please sync now"
  ↓ Web LLM receives message → immediately runs extraction → sends state.json
AI Brain: Receives signal that state is ready → Reads state.json
```

### MCP Tool Definition (`.claude/skills/freeflow.json`)
```json
{
  "name": "request_sync",
  "description": "Request Web LLM to immediately sync UI state to state.json",
  "parameters": {},
  "handler": "bun-server.websocket.broadcast({type: 'REQUEST_SYNC'})"
}
```

### Duplicate Sync Prevention
- **Sync Lock**: Web LLM sets `syncing: true` before extraction
- Bun debounces multiple rapid REQUEST_SYNC messages (500ms window)
- State.json includes `timestamp` and `version` fields
- AI brain can check timestamp to confirm freshness

---

## State.json Format Options (Q2 Clarified)

```typescript
// Option 1: Flat key-values (simple)
{
  "timestamp": 1716481200000,
  "version": 42,
  "syncId": "uuid-v4",
  "inputs": {
    "email": "john@example.com",
    "password": "",
    "rememberMe": true
  },
  "selections": {
    "plan": "monthly"
  }
}

// Option 2: Hierarchical with structure
{
  "timestamp": 1716481200000,
  "version": 42,
  "uiState": {
    "forms": {
      "loginForm": {
        "fields": {
          "email": { "value": "john@example.com", "valid": true },
          "password": { "value": "", "valid": false, "error": "Required" }
        },
        "submitEnabled": false
      }
    },
    "activeTab": "login",
    "visibleModals": []
  }
}

// Option 3: Semantic (Web LLM extracts meaning)
{
  "timestamp": 1716481200000,
  "version": 42,
  "semanticState": {
    "userIntent": "Logging in with new account",
    "formProgress": "partial",
    "blockers": ["Password field is empty"],
    "currentSelections": {
      "plan": { "id": "monthly", "label": "Monthly Plan", "price": 10 }
    }
  }
}
```

**Recommendation**: Option 2 (hierarchical) for structure + Option 3 (semantic) if Web LLM is powerful enough.

---

## Vite Integration Details (Q3 Clarified)

**Question**: Does Bun spawn Vite as child process, or is Vite separate?

### Option A: Bun Spawns Vite (Recommended)
```typescript
// Bun server manages both HTTP and Vite
const viteProcess = Bun.spawn(['bunx', 'vite', './playground', '--port', '3001'], {
  cwd: aiBrainWorkingDir,
  stdout: 'pipe',
  stderr: 'pipe',
});

// Browser iframe points to http://localhost:3001
```

**Pros**:
- Single process tree, Bun manages lifecycle
- Easy to restart on session change
- Can capture Vite logs

**Cons**: 
- Vite runs as separate process (more resource usage)
- Need to manage port conflicts

### Option B: Bun Uses Vite as Middleware
```typescript
// Bun server directly serves playground via Vite
import { createServer } from 'vite';

const vite = await createServer({
  root: './playground',
  server: { middlewareMode: true }
});

// Bun routes /playground/* to Vite middleware
```

**Pros**:
- Single Bun process
- Direct integration

**Cons**:
- Vite is Node-first, Bun compatibility unknown
- More complex error handling

### Recommendation: Option A (Bun spawns Vite)
**Why**: Simpler, proven pattern, Vite handles HMR natively.

---

## Web LLM Model/Library Options

### Option 1: Transformers.js (Hugging Face)
```typescript
// Using Xenova models (optimized for browser)
import { pipeline } from '@xenova/transformers';

const extractor = await pipeline(
  'feature-extraction', 
  'Xenova/all-MiniLM-L6-v2' // 23MB, fast
);

// For DOM analysis, use text-generation
const generator = await pipeline(
  'text-generation',
  'Xenova/LaMini-Flan-T5-783M' // 783M params, ~1.5GB download
);
```

**Pros**:
- Pure JavaScript, no build step
- Wide model selection
- WebGL acceleration
- Works in Web Workers

**Cons**:
- Smaller models (~1B params max)
- Quality may suffer for complex semantic extraction
- First download is large

**Best for**: Simple state extraction (form values, active tab)

---

### Option 2: WebLLM (MLC AI)
```typescript
import * as webllm from '@mlc-ai/web-llm';

const chat = new webllm.ChatModule();
await chat.reload('Llama-3.2-1B-Instruct-q4f16_1');

const domContext = `
  DOM: ${JSON.stringify(simplifiedDom)}
  Extract semantic state as JSON...
`;

const result = await chat.generate(domContext);
// Parse JSON from result
```

**Available models**:
- `Llama-3.2-1B-Instruct` - Fast, 600MB, good for simple tasks
- `Llama-3.2-3B-Instruct` - Better quality, 1.8GB
- `Phi-3-mini-4k-instruct` - Microsoft, good reasoning

**Pros**:
- Real Llama/Mistral models
- WebGPU acceleration (fast)
- Better reasoning than Transformers.js options
- Structured output possible

**Cons**:
- Larger download (600MB-4GB)
- Requires WebGPU support (modern browsers only)
- First load takes time

**Best for**: Complex semantic extraction (understanding user intent from UI)

---

### Option 3: Ollama Bridge (Not Pure Browser)
```typescript
// Ollama runs locally on user's machine
// Browser talks to localhost:11434

const response = await fetch('http://localhost:11434/api/generate', {
  method: 'POST',
  body: JSON.stringify({
    model: 'llama3.2',
    prompt: `Analyze this DOM: ${domSnapshot}\nExtract semantic state:`,
    stream: false
  })
});
```

**Pros**:
- Full-quality models (8B+ params)
- Runs on user's GPU
- No browser download

**Cons**:
- Requires Ollama installed locally
- Not "Web LLM" in browser
- More setup for users

**Best for**: Power users who want best quality

---

### Recommendation: WebLLM with Llama-3.2-1B

**Why**:
1. **Fast**: 1B params, WebGPU accelerated
2. **Quality**: Real Llama model, good at following instructions
3. **Size**: 600MB download (acceptable for modern web)
4. **Structured output**: Can be prompted to output JSON directly

**Fallback**: If WebLLM fails, use Transformers.js with Xenova/Flan-T5

**Setup**:
```bash
# In web-client/web-llm/
bun install @mlc-ai/web-llm
```

**Worker thread**:
```typescript
// worker.ts
import * as webllm from '@mlc-ai/web-llm';

// Runs in background, doesn't block UI
const extractState = async (domSnapshot: string) => {
  const chat = new webllm.ChatModule();
  await chat.reload('Llama-3.2-1B-Instruct-q4f16_1');
  
  const prompt = `
    Analyze this HTML DOM and extract semantic UI state.
    Output valid JSON only.
    
    DOM: ${domSnapshot}
    
    Extract:
    - form fields and values
    - selected options with their meaning
    - visible/hidden sections
    - current user task/intent
  `;
  
  const result = await chat.generate(prompt);
  return JSON.parse(result); // state.json format
};
```

---

## New Approach: AI-Generated State Collector Scripts (No Web LLM!) ⭐

**User's Insight**: Instead of downloading a 600MB Web LLM, have the **AI brain generate state-collection scripts** because it knows what UI it created!

### How It Works

```
Step 1: AI creates UI
  AI Brain: "I'll create a login form with email and plan selection"
  → Writes to index.html:
     - Input id="email"
     - Radio buttons name="plan" (monthly/yearly)
     → Simultaneously generates state-collector.js:
        ```js
        function collectState() {
          return {
            email: document.getElementById('email')?.value,
            plan: document.querySelector('input[name="plan"]:checked')?.value,
            planLabel: document.querySelector('input[name="plan"]:checked')
              ?.closest('label')?.textContent?.trim()
          };
        }
        ```

Step 2: User interacts
  User: (types email, selects "yearly" plan)

Step 3: AI requests sync  
  AI Brain: "I need to see current state"
  → Sends message via Channel 1 (with flag: REQUEST_STATE)
  → Bun forwards to browser via Channel 2

Step 4: Browser executes collector
  Browser: Receives signal → executes state-collector.js
  → Returns: `{ email: "john@example.com", plan: "yearly", planLabel: "Yearly Plan ($100/yr)" }`
  → Sends back via Channel 2 → Bun → state.json

Step 5: AI reads state
  AI Brain: Reads state.json → "User entered john@example.com and selected Yearly Plan"
```

### Why This Is Better

| Aspect | Web LLM | AI-Generated Scripts |
|--------|---------|----------------------|
| Download | 600MB | 0MB |
| Accuracy | May hallucinate | Precise (AI knows exactly what it created) |
| Context | Generic DOM analysis | Knows semantic meaning of each element |
| Cost | High compute on client | Zero compute, just script execution |
| Complexity | High (WebGPU, workers) | Low (standard JS execution) |

### Script Generation Strategy

When AI brain creates/modifies UI, it also maintains `state-collector.js`:

```javascript
// Example: AI creates a wizard form with 3 steps
function collectWizardState() {
  const currentStep = document.querySelector('.step.active')?.dataset.step;
  const stepData = {};
  
  switch(currentStep) {
    case '1':
      stepData.personal = {
        name: document.getElementById('name')?.value,
        age: document.getElementById('age')?.value
      };
      break;
    case '2':
      stepData.preferences = {
        theme: document.getElementById('theme')?.value,
        notifications: document.getElementById('notifications')?.checked
      };
      break;
  }
  
  return {
    currentStep,
    data: stepData,
    progress: calculateProgress()
  };
}

function calculateProgress() {
  const total = document.querySelectorAll('.step').length;
  const completed = document.querySelectorAll('.step.completed').length;
  return { completed, total, percent: Math.round(completed/total * 100) };
}
```

### Update Protocol

When user says "Add a new field", AI knows:
1. How to update the HTML
2. How to update the collector script to capture that field

### Fallback: Heuristic Detection

If no collector script exists (legacy/old UI), fall back to generic:
```javascript
function fallbackCollect() {
  const state = {};
  document.querySelectorAll('input, select, textarea').forEach(el => {
    if (el.id || el.name) {
      const key = el.id || el.name;
      state[key] = el.type === 'checkbox' ? el.checked : el.value;
    }
  });
  return state;
}
```

## Final Tech Stack (Revised)

| Component | Technology | Reason |
|-----------|------------|--------|
| **Chat UI** | Vite + React | Rich interactivity needed |
| **Playground** | Vite + **Vanilla JS** | Easier for AI to generate, no JSX complexity |
| **State Collection** | **AI-generated scripts** | No 600MB download, precise, contextual |
| **Bun Server** | Bun | Fast, handles WebSocket + file watching |
| **AI Brain** | Claude Code CLI via `claudep` | Generates UI + collector scripts |
| **Dev Server** | Vite (spawned by Bun) | HMR out of box |

## Project Structure (Revised)

```
freeflow/
├── bun-server/                 # Bun server code
│   ├── server.ts              # WebSocket + file coordination
│   ├── ai-brain-manager.ts   # Spawns/manages claudep process
│   ├── state-handler.ts      # Channel 2 state writes
│   └── script-runner.ts      # Executes collector scripts
│
├── web-client/                # Browser-side code
│   ├── chat-ui/              # React app (Vite)
│   │   ├── src/
│   │   ├── package.json
│   │   └── vite.config.ts
│   │
│   ├── playground-host/        # Playground wrapper
│   │   └── iframe-wrapper.html
│   │
│   └── state-collector/       # State collection runtime
│       ├── executor.ts        # Executes AI-generated scripts
│       └── fallback.ts        # Generic detection if no script
│
├── playground/                # AI-editable workspace
│   ├── index.html            # Entry point
│   ├── style.css             # Styles
│   ├── main.js               # Behavior (Vanilla JS)
│   ├── state.json            # Runtime state (AI reads)
│   └── **state-collector.js** # ← AI generates this!
│
└── .claude/
    └── skills/
        └── request-sync.json   # MCP tool for AI brain
```

## Build Commands

```bash
# Start everything
cd freeflow
bun run dev

# This starts:
# 1. Bun server (WebSocket hub + file watcher)
# 2. Vite for chat-ui (port 3000)
# 3. Vite for playground (port 3001)
# 4. AI brain process (claudep in workspace/)
```

## Verified Architecture Decisions

✅ **Channel 1**: Chat messages only (stdin/stdout to AI brain)  
✅ **Channel 2**: Web LLM → Bun → state.json (WebSocket)  
✅ **Trigger**: Periodic (5-10s) + on-demand skill (`@freeflow/requestSync`)  
✅ **Sync Prevention**: Lock + debounce + version IDs  
✅ **State Format**: Hierarchical + semantic JSON  
✅ **Playground**: Vanilla JS (AI generates plain HTML/CSS/JS)  
✅ **File IPC**: AI edits files → Vite HMR → browser updates  
✅ **Backwards Navigation**: AI maintains state history, can restore values  

---

## Critical Problem: Claude Code is a TUI (Terminal UI) App

**User identified**: Claude Code has interactive terminal features that will break with simple stdin/stdout proxying.

### Problem 1: Arrow Key Selection UI

**Claude Code behavior**:
```
Claude: I can help you with that. What would you like to do?

  ➜ Create a new component
    Edit existing file  
    Run tests
    Exit

  Use ↑/↓ to navigate, Enter to select
```

**Web proxy breaks**: Browser can't send arrow key sequences the way a terminal expects (`\x1b[A` for up, etc.)

### Problem 2: Dynamic Terminal Rendering

**Claude Code behavior**:
- Measures terminal width/height on startup
- Uses React Ink for TUI rendering
- Dynamic updates, progress bars, spinners
- ANSI escape codes for colors, positioning

**Web proxy breaks**:
- Terminal size detection fails or is 0x0
- ANSI codes render as gibberish `[33m[1mClaude[0m`
- Interactive prompts hang waiting for input
- Screen clearing (`\x1b[2J`) doesn't work

### Problem 3: Auto-Complete and Input Handling

**Claude Code behavior**:
- Tab completion for file paths
- Ctrl+C handling
- Password prompts (hidden input)
- Multi-line input (shift+enter)

**Web proxy breaks**: All of these require terminal control that browsers don't provide.

---

## Solutions to TUI Problem

### Solution A: Force Non-Interactive Mode

Wrap Claude Code to disable TUI entirely, force it to be text-only.

```bash
# Hypothetical flags (may not exist)
claude --no-interactive --plain-output

# Or via environment
export FORCE_INTERACTIVE=false
export CLAUDE_NO_TUI=1
claude
```

**Pros**: Just text I/O, easy to proxy  
**Cons**: May not exist. Claude Code IS designed as TUI.

---

### Solution B: PTY (Pseudo-Terminal) Emulation

Spawn Claude Code in a PTY so it thinks it has a real terminal.

```typescript
import { spawn } from 'node-pty'; // or bun's similar

const pty = spawn('claudep', [], {
  name: 'xterm-color',
  cols: 80,
  rows: 24,
  cwd: process.env.HOME,
  env: process.env
});

// Terminal outputs ANSI codes
pty.onData((data) => {
  // Parse ANSI codes, convert to React components
  // Or strip them for text-only mode
});

// Send keystrokes
pty.write('Hello\r'); // \r = Enter
pty.write('\x1b[A');  // Up arrow
```

**Pros**: Claude Code thinks it has terminal, full feature support  
**Cons**: 
- Complex ANSI parsing
- Arrow key mappings need browser → PTY translation
- Terminal size must be managed
- Heavy dependencies

---

### Solution C: Alternate Mode - Claude API Instead

**Pivot**: Instead of wrapping Claude Code CLI, use Claude API directly (but user said no API access...)

Wait, user constraint: *"Cannot use Anthropic API directly"* - but maybe Claude Code can be used differently?

Actually, `claude -p` (pipe mode) exists! Let me check if we can force non-interactive.

---

### Solution D: Hybrid - Two AI Processes

**Key insight**: Separate concerns into TWO AI processes:

1. **Chat AI** (`claude -p` mode): Stateless, text-only, handles conversation
2. **File Editor AI** (`claude` interactive): Runs in background, only does file edits via MCP

```
User: "Create a login form"
  ↓
Chat AI (claude -p): "I'll help you create that"
  → Sends structured command to File Editor AI via MCP
  → File Editor AI: edits playground/index.html
  → Done!
```

**Pros**: 
- Chat AI can be stateless, text-only
- File Editor AI uses Claude Code's file editing strength
- No TUI proxying needed for chat

**Cons**:
- Two AI contexts to manage
- More complex orchestration

---

### Solution E: Embed Actual Terminal (xterm.js)

Use **xterm.js** in browser to render a real terminal interface.

```
Browser: xterm.js canvas
    ↕ WebSocket
code-server/node-pty
    ↕
AI Brain (claude running in real PTY)
```

**Implementation**:
```typescript
// Browser
import { Terminal } from 'xterm';
const term = new Terminal();
term.open(document.getElementById('terminal'));

term.onData((data) => {
  // Send keystrokes to Bun
  websocket.send(JSON.stringify({ type: 'input', data }));
});

websocket.on('message', (msg) => {
  if (msg.type === 'output') {
    term.write(msg.data); // Raw terminal bytes
  }
});
```

**Pros**: 
- Real terminal experience
- All TUI features work (arrows, colors, etc.)
- Claude Code's React Ink renders correctly

**Cons**:
- Heavy (xterm.js + websocket + PTY)
- User is looking at raw terminal, not styled chat
- More complex UI (terminal in browser)

---

### Solution F: Constrain Claude Code Behavior

**Hack**: Force Claude Code to never show TUI prompts by:

1. **Always provide full context** so it never needs to ask clarifying questions
2. **Use system prompts** to instruct: "Never use interactive UI. Always output structured JSON."
3. **Auto-respond** to any prompts with default values

System prompt:
```
You are Claude Code in API mode. You MUST:
1. Never use arrow-key selection UI
2. Never ask clarifying questions interactively
3. If you need user input, output JSON: {"action": "request_input", "prompt": "..."}
4. Always proceed with best assumptions if ambiguous
```

**Pros**: Works within existing constraints  
**Cons**: Brittle, Claude Code may still use TUI internally

---

## Selected Architecture: Option B (xterm.js Terminal + Scrollback)

User choice:
- **Left side**: xterm.js terminal (full Claude Code TUI experience)
- **Right side**: Playground (iframe with Vite, interactive)

### Design

```
┌─────────────────────────────────────────────────────────────┐
│  Terminal (left 40%)         │  Playground (right 60%)        │
│  (xterm.js)                  │                                │
│                              │  ┌─────────────────────────┐  │
│  ┌────────────────────────┐  │  │                         │  │
│  │ Scrollable History     │  │  │   iframe                │  │
│  │                        │  │  │   (Vite dev server)     │  │
│  │ User: Create a form    │  │  │                         │  │
│  │                        │  │  │   [Interactive UI]      │  │
│  │ Claude: I'll help you  │  │  │   - Clickable!          │  │
│  │ create a login form.   │  │  │   - Forms               │  │
│  │                        │  │  │   - Buttons             │  │
│  │ [Menu appears ↓]       │  │  │                         │  │
│  │   ➜ Create component   │  │  └─────────────────────────┘  │
│  │     Edit existing      │  │                                │
│  │     Run tests          │  │  User clicks here → iframe     │
│  │                        │  │  gets focus, mouse works       │
│  │ ↑ Previous messages    │  │                                │
│  │ (scrollback buffer)    │  │  Click terminal → type to      │
│  └────────────────────────┘  │  Claude Code                   │
└─────────────────────────────────────────────────────────────┘
```

### Terminal Features (xterm.js)

1. **Scrollback**: `1000` lines default (configurable to any number)
   - Scroll up to see full conversation history
   - Works with mouse wheel or touch
   - **Memory limited**: Each line ~100-500 bytes
   - 10,000 lines ≈ 5MB RAM (usually fine)
   - 50,000 lines ≈ 25MB RAM (might lag on older machines)

2. **Focus behavior**:
   ```
   Click Terminal  → Terminal focused, captures keyboard
   Click Playground → Terminal unfocused, iframe gets mouse/keyboard
   ```

3. **Full TUI support**:
   - Arrow keys (`↑/↓` menus)
   - Colors (ANSI codes)
   - File pickers
   - Progress bars
   - Everything Claude Code does

### Why This Works

- **No proxy complexity**: Claude Code runs in real PTY (pseudo-terminal)
- **Full feature support**: All TUI interactions work
- **Generic**: Can swap `claude` for any other TUI CLI (`aider`, `codellama-cli`, etc.)
- **Simple**: No need to parse TUI output, convert to React, etc.

### Mouse Interaction

```
User flow:
1. Types in terminal: "Create a login form"
2. Claude Code shows arrow menu
3. User clicks playground (focus shifts)
4. User fills form in playground
5. User clicks terminal, types: "Check what I entered"
6. Claude Code uses MCP skill to request state sync
7. Browser sends state back
8. Claude Code reads state, responds in terminal
```

### Terminal Pane Options

```typescript
// xterm.js config
const term = new Terminal({
  rows: 24,
  cols: 80,
  scrollback: 10000,       // Chat history (~5MB RAM)
  cursorBlink: true,
  fontSize: 14,
  theme: {
    background: '#1e1e1e',
    foreground: '#d4d4d4'
  }
});

// Make it resizable
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
window.addEventListener('resize', () => fitAddon.fit());

// Copy/Paste handling
term.attachCustomKeyEventHandler((event) => {
  // Cmd+C / Ctrl+C = Copy (when text selected)
  // Cmd+V / Ctrl+V = Paste
  if ((event.metaKey || event.ctrlKey) && event.key === 'c') {
    const selection = term.getSelection();
    if (selection) {
      navigator.clipboard.writeText(selection);
      return false; // Don't send Ctrl+C to terminal (no SIGINT)
    }
  }
  if ((event.metaKey || event.ctrlKey) && event.key === 'v') {
    navigator.clipboard.readText().then(text => {
      term.paste(text);
    });
    return false;
  }
  return true; // Let xterm handle other keys
});
```

### Copy/Paste Behavior

| Action | Shortcut | What Happens |
|--------|----------|--------------|
| **Copy** | Cmd+C (Mac) / Ctrl+C (Win) | Copies selected text from terminal (if text selected) |
| **Copy** | Ctrl+C (no selection) | Sends SIGINT to process (cancel command) |
| **Paste** | Cmd+V / Ctrl+V | Pastes clipboard to terminal |
| **Select All** | Cmd+A / Ctrl+A | Selects all terminal text |

**Standard terminal behavior**:
- Select text → Copy works
- No selection → Ctrl+C interrupts process (SIGINT)

---

---

## Why Not Anthropic API (Confirmed Constraint)

**User clarification**: Want to avoid vendor lock-in. Claude Code proxy approach works with:
- Claude Code
- Aider (another TUI AI CLI)
- Any future chat-based AI CLI

**Benefit**: Not locked to Anthropic API, can swap AI backend.

---

## Workspace Concept (Simplified)

**User clarification**: Replace "session" with "workspace". Workspace = folder. Not tied to Claude Code's internal session concept.

### Folder Structure

```
freeflow/                          # Project root (fixed UI lives here)
├── web-client/                    # Chat UI (fixed)
│   ├── src/
│   └── index.html                # Root HTML
│
├── bun-server/                    # Server (fixed)
│   └── server.ts
│
├── templates/                     # Workspace templates (future)
│   └── default-workspace/
│       ├── index.html
│       ├── style.css
│       └── main.js
│
└── workspaces/                    # User workspaces (AI editable)
    └── default/                    # MVP: Only this one
        ├── index.html            # ← AI edits
        ├── style.css             # ← AI edits
        ├── main.js               # ← AI edits
        └── state-collector.js    # ← AI generates
```

### What Happens (MVP)

1. **UI (fixed)**: `freeflow/web-client/` - React + xterm.js, never changes
2. **AI brain**: Spawned with `cwd: freeflow/workspaces/default/`
3. **Playground**: Vite serves from `workspaces/default/`
4. **User edits**: AI edits files in `workspaces/default/`

**Claude Code sees:**
```bash
$ pwd
/home/user/freeflow/workspaces/default

$ ls
index.html  style.css  main.js

# AI brain operates here
```

### Out of Scope for MVP

| Feature | Status | Future |
|---------|--------|--------|
| Create new workspace | ❌ Skip | Copy from `templates/default-workspace/` |
| Switch workspaces | ❌ Skip | Restart Vite with new cwd |
| Delete workspace | ❌ Skip | rm -rf folder |
| Rename workspace | ❌ Skip | mv old new |

### Workspace Commands (Future)

```
/workspace new [name]     Create new workspace
/workspace switch <name>   Switch to workspace
/workspace ls             List workspaces
/workspace rename <name>   Rename current
```

**Implementation (future)**: Switch = kill Claude, restart Vite with new cwd, refresh iframe

### Why "Workspace" Not "Session"

- **Workspace**: Physical folder, simple concept
- **Session**: Implies Claude's internal state, more complex
- AI brain's internal "session" is irrelevant - it just sees files in a folder

---

## Final Architecture

```
┌────────────────┬────────────────────────────┐
│  Terminal      │  Playground (Vite)         │
│  (xterm.js)    │                             │
│                │  ┌────────────────────────┐ │
│  Claude Code   │  │  index.html            │ │
│  running in    │  │  style.css             │ │
│  PTY           │  │  main.js (Vanilla)     │ │
│                │  │  state-collector.js    │ │
│  ↓ stdout      │  │  state.json            │ │
│  ↓ ANSI codes  │  └────────────────────────┘ │
│  xterm renders │              ↑              │
│                │         HMR updates          │
└────────────────┴───────────────────────────────┘
       ↑                   ↑
   Bun server         Bun spawns Vite
   (WebSocket)        (Port 3001)
       ↑
   Channel 2: state-collector.js results
       ↑
   workspace/session-{id}/ (switchable!)
```

## Development Sequence

**Phase 1: Core Infrastructure**
1. Bun server with Channel 1 (chat forwarding)
2. AI brain wrapper with file access
3. Vite serving static files
4. Browser chat UI + playground iframe

**Phase 2: File Sync**
1. File watcher for AI edits → HMR trigger
2. State capture mechanism (start simple)
3. AI reads state.json

**Phase 3: Web LLM**
1. Transformers.js integration
2. Channel 2 implementation
3. Semantic state extraction

**Phase 4: Polish**
1. Soft navigation / state restoration
2. Multiple AI brain sessions
3. Undo/redo for UI changes
