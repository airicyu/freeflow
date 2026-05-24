# Terminal Display Corruption Bug

## Issue
When typing input in the terminal panel (xterm.js), if Claude Code sends a recap/status update at the same time, the display gets corrupted. Characters appear in wrong positions, cursor desyncs.

## Reproduction
1. Start typing a long message in the terminal panel
2. Wait ~5-10 seconds for Claude Code recap to fire
3. Observe display corruption - typing line shows garbled text

## Root Cause
xterm.js Canvas renderer doesn't handle concurrent `term.write()` calls well while user is actively typing. The PTY output (recap) interferes with the input line rendering.

## Workaround
Disable recaps in Claude Code: `/config` → toggle off "Show status recaps"

## Potential Fixes (Not Implemented)

### Option 1: Switch to DOM Renderer
Replace `CanvasAddon` with xterm.js DOM renderer. More reliable for concurrent output but may impact performance on large scrollback.

```typescript
// Remove: import { CanvasAddon } from '@xterm/addon-canvas';
// xterm.js uses DOM renderer by default when no canvas addon loaded
```

### Option 2: Write Queue/Buffering
Queue PTY writes when user is actively typing, flush after input idle.

```typescript
const writeQueue: string[] = [];
let isTyping = false;
let typingTimeout: NodeJS.Timeout;

// On user input, mark typing	erm.onData(() => {
  isTyping = true;
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => isTyping = false, 300);
});

// Queue writes during typing
const handlePtyOutput = (data: string) => {
  if (isTyping) {
    writeQueue.push(data);
  } else {
    term.write(data);
  }
};
```

### Option 3: Disable Recaps at Server Level
Configure PTY spawn to disable recaps by default for this workspace.

## Priority
Low - Workaround available (disable recaps)

## Affected Files
- `web-client/src/components/TerminalPanel.tsx`
