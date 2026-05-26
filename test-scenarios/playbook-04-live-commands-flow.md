# Playbook 04: Live Commands & State Sync

## Scenario
Test the smooth update flow with live commands, state preservation, and phased deploy.

**Context:** Task list app with checkboxes and text inputs.

---

## Phase 1: Initial Build

### User Input
```
Create a simple task list with checkboxes.
```

### Expected AI Behavior
- Invoke `playground-update` skill
- **Mode 2** (no live commands, building from scratch)
- Create: input field, add button, task list with checkboxes
- Deploy once

### Success Criteria
- [ ] Task list appears
- [ ] Can add tasks
- [ ] Can check/uncheck boxes
- [ ] State collectors registered

---

## Phase 2: Quick Style Update (Live Commands)

### User Input
```
Make completed tasks gray.
```

### Expected AI Behavior
- Recognize as **quick visual tweak**
- Invoke `playground-update` skill
- **Mode 1 with Live Commands:**
  1. Send `cooking` signal (toast appears)
  2. Use live command to style completed tasks
  3. Update shadow CSS
  4. `pre-deploy` → read state → deploy → `reload`

### Success Criteria
- [ ] Non-blocking toast during cooking
- [ ] User can still interact
- [ ] State preserved across reload
- [ ] Checked boxes remain checked

---

## Phase 3: Batch Quick Changes

### User Input
```
Also add strikethrough to completed tasks, and change the button to green.
```

### Expected AI Behavior
- Multiple small changes → batch live commands
- User expects immediate visual feedback
- **Mode 1 with Live Commands:**
  1. Toast: "Updating styles..."
  2. Batch live commands:
     - Add strikethrough to `.task.completed`
     - Change button color
  3. Update shadow CSS
  4. Deploy & reload

### Success Criteria
- [ ] Both changes visible immediately
- [ ] Batch commands sent together
- [ ] Single reload at end
- [ ] Task state maintained

---

## Phase 4: Add New Feature

### User Input
```
Add a "Clear completed" button that removes checked items.
```

### Expected AI Behavior
- New feature, needs logic
- **Mode 1 possible:** Add button live, then add functionality
- Or **Mode 2:** Build in shadow with full logic
- Either approach acceptable if smooth

### Success Criteria
- [ ] Button appears
- [ ] Clicking removes completed tasks
- [ ] State collectors still work

---

## Phase 5: Structural Change

### User Input
```
Can we have two columns - Todo and Done? Checked items move to Done column.
```

### Expected AI Behavior
- Structural change (layout + logic)
- **Mode 2 recommended** (complex, not quick tweak)
- Full workflow:
  1. `cooking` → build in shadow
  2. `pre-deploy` → final state sync
  3. Read state → map checked tasks to Done column
  4. Deploy & reload

### Success Criteria
- [ ] Two columns layout
- [ ] Existing checked items appear in Done
- [ ] Unchecked items in Todo
- [ ] Checking moves item to Done
- [ ] No lost tasks

---

## Phase 6: User Typing During Deploy

### Setup
AI in `cooking` phase, building shadow.

### User Action
User typing in input field while cooking toast showing.

### Expected AI Behavior
- User input continues normally (non-blocking)
- State collectors capture input
- When `pre-deploy` signals:
  - Freeze input (blocking overlay)
  - Send final state
  - Update shadow with latest input value
  - Deploy

### Success Criteria
- [ ] User can type during cooking
- [ ] Input not lost during transition
- [ ] Final value preserved in reloaded UI

---

## Phase 7: Error Recovery

### Setup
Deploy fails (simulate by breaking shadow file).

### User Input
```
The page didn't update. What happened?
```

### Expected AI Behavior
- Check terminal/error output
- Diagnose: deploy failed
- Communicate clearly: "Deploy encountered an issue. Let me retry."
- Fix issue and retry

### Success Criteria
- [ ] Clear error communication
- [ ] Retry mechanism
- [ ] Eventual success

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Live command latency | <100ms |
| State preservation | 100% - no lost input |
| Deploy success | >95% |
| User interruption | Allowed during cooking, blocked during pre-deploy |
| UX smoothness | User perceives as "smooth" |

---

## Visual Flow Check

```
User: Make it blue

AI: invoke playground-update skill
↓
send cooking signal
→ [Toast appears, non-blocking]
→ User can still work
↓
Live command: change color to blue
→ [UI updates immediately]
→ User sees change instantly
↓
Update shadow CSS
↓
send pre-deploy signal
→ [Blocking overlay appears]
→ Final state sync
↓
Read state.json
→ Capture current values
↓
Update shadow with state
↓
Deploy
→ rsync shadow → stage
↓
send reload signal
→ Reload page
→ Restore state
→ New UI with preserved values
↓
Done ✓
```

---

## Failure Modes to Watch

1. **Blocking too early** - Prevents user input during cooking phase
2. **Lost state** - User input not captured before reload
3. **Double reload** - Multiple deploys trigger multiple reloads
4. **Stuck overlay** - Blocking overlay doesn't clear on error
5. **No visual feedback** - User doesn't know AI is working
