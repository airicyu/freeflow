# Freeflow Test Playbook: Interactive Workflow Design Journey

## Overview
This playbook guides you through a realistic user-AI collaboration scenario to test Freeflow's core features: terminal-based AI interaction, live UI updates, shadow/staging workflow, and interactive playground elements.

---

## Scene 1: Initial Workflow Request

### Your Input (in terminal)
```
I need to design a new user onboarding workflow for our app. Can you draw out the current flow where a user signs up, verifies email, completes profile, and sees the dashboard? I want to see it as a visual flow diagram.
```

### Expected AI Behavior
- AI recognizes this as **Mode 1 (bulk creation)** - needs shadow workspace
- Creates HTML with flow diagram (boxes, arrows)
- Runs deploy script to show result
- AI says: "I've created a visual workflow. Check the playground."

### What You See
1. Terminal: AI thinking/editing files
2. Playground: Flow diagram appears after HMR refresh

### Interaction Points
- Do you like the layout?
- Should we adjust colors/spacing?

---

## Scene 2: Discuss and Iterate

### Your Input
```
The flow looks good, but I want to add a decision point after email verification. If the user is from a referral, show them a welcome bonus screen. Otherwise go straight to profile. Can you update that?
```

### Expected AI Behavior
- **Mode 2 (live + shadow)** for targeted updates
- Live command: highlight the email verification box
- Edit shadow to add decision diamond + branch paths
- Deploy to show final result

### What You See
1. Live command highlights the verification step
2. Shadow deploy adds the decision branches
3. Refreshed diagram shows both paths

### Test Points
- Did live command work instantly?
- Did shadow deploy complete successfully?

---

## Scene 3: Add Alternative Workflow

### Your Input
```
Now I want to compare this with a different approach. Let's also build a version where there's a guided wizard with progress steps (1-2-3) instead of the branching flow. Can you show both side by side or toggle between them?
```

### Expected AI Behavior
- **Mode 1 (bulk creation)** for new component
- Creates tabs or toggle UI to switch between: "Option A: Branching" vs "Option B: Wizard"
- Adds interaction: clicking tabs switches visible workflow
- Deploys new version

### What You See
1. Tab interface appears (Option A | Option B)
2. Default shows branching flow from before
3. Click "Option B" tab → shows wizard steps UI

---

## Scene 4: Interactive Comparison

### Your Input
```
Let's do a pros/cons analysis. Can you create a comparison table that highlights tradeoffs between these two approaches? I want to interact with each row to see more details.
```

### Expected AI Behavior
- **Mode 2 (live updates)** for interactivity
- Creates comparison table with expandable rows
- Adds hover/click interactions on table rows
- Each row expands to show detailed analysis

### Interaction Flow
```
┌─────────────────────────────────────┐
│ Comparison: Branching vs Wizard     │
├─────────────────────────────────────┤
│ User Time to Complete      ▶ (expand)
│ Implementation Complexity  ▶ (expand)
│ User Drop-off Risk         ▶ (expand)
│ Maintenance Overhead       ▶ (expand)
└─────────────────────────────────────┘
```

### Live Commands Test
- Click row → live command expands row, shows detailed comparison
- Shadow updated to persist expanded state

---

## Scene 5: AI-Assisted Voting

### Your Input
```
Actually, let me think about this differently. Can we create a simple voting widget where I can rate each criteria (1-5 stars), and the AI calculates a recommendation based on my preferences?
```

### Expected AI Behavior
- **Mode 2 with state collection** - interactive voting form
- Star rating inputs for each criteria
- Live commands update ratings instantly
- "Calculate Recommendation" button
- State collected and sent back to AI

### Interaction
```
User Time to Complete      ⭐⭐⭐⭐☆ (4/5)
Implementation Complexity  ⭐⭐☆☆☆ (2/5)
User Drop-off Risk         ⭐⭐⭐☆☆ (3/5)
                           [Get Recommendation]
```

### Result
- AI receives state via sync
- AI calculates weighted recommendation
- AI explains: "Based on your ratings, Wizard scores 3.5 vs Branching 2.8. Would you like me to explore hybrid options?"

---

## Scene 6: Explore Hybrid Approach

### Your Input
```
Great idea! Let's explore a hybrid. What if we start with a wizard for the first 2 steps, then use smart branching based on user data? Can you visualize this hybrid flow and let me toggle between simplified and detailed views?
```

### Expected AI Behavior
- **Mode 1 (bulk redesign)** - major UI change
- Creates hybrid diagram with mode toggle
- "Simplified" shows just wizard + branch
- "Detailed" shows all screens with thumbnails
- Toggle switch at top

### Live Interaction Test
```
[○ Simplified]  [● Detailed]

Step 1: Sign Up        ┌────────────┐
Step 2: Email Verify ──┤ Decision   ├── Dashboard (existing user)
                       └─────┬──────┘
                             └── Profile + Wizard Remaining
```

---

## Scene 7: Stress Test - Rapid Iterations

### Rapid Fire Inputs (send quickly, one after another)
```
1. "Change the decision diamond color to green"
2. "Add a 'Skip for now' button to profile step"
3. "Remove the wizard step 3 from simplified view"
4. "Make the comparison table sticky at top"
5. "Add a 'Preview as User' button that highlights the active path"
```

### Expected AI Behavior
- Live commands for colors (#1, #5)
- Shadow edits + deploy for structural changes (#2, #3, #4)
- Shows rapid UI updates without breaking

### Validation
- All 5 changes appear correctly?
- No HMR flicker during rapid changes?
- State persists across changes?

---

## Scene 8: Recovery & Edge Cases

### Test Error Handling
```
"I accidentally checked 'Skip for now' in the preview mode, but now I can't uncheck it. Can you help?"
```

```
"The hybrid view is broken - clicking detailed mode shows nothing. Can you debug?"
```

### Expected AI Behavior
- AI reads state.json to see current UI state
- AI sends live commands to fix/clear broken state
- AI updates shadow to fix underlying bug
- Everything recovers smoothly

---

## Scene 9: Final Export

### Your Input
```
This workflow is finalized. Can you generate a proper handoff document with the final flow, the comparison analysis, and the ratings I gave? I want it in a downloadable format.
```

### Expected AI Behavior
- Creates formatted document in shadow
- Includes screenshots/preserves final UI
- Deploys to root or provides download link

---

## Success Criteria Checklist

### Live Commands ✅
- [ ] Checkbox/rating changes reflect instantly
- [ ] Color/style updates without reload
- [ ] Button clicks trigger actions

### Shadow Workflow ✅
- [ ] Bulk changes deploy cleanly
- [ ] HMR refreshes once, not flickering
- [ ] State persists after refresh

### State Sync ✅
- [ ] AI can read user interactions (ratings, toggles)
- [ ] User clicks "Sync State" → AI receives data
- [ ] AI responds to user state changes

### Terminal Integration ✅
- [ ] Commands execute in terminal visible
- [ ] WebSocket connection stable
- [ ] No duplicate connections

### Error Recovery ✅
- [ ] Broken UI states can be fixed
- [ ] AI can inspect state.json
- [ ] Deployment errors handled gracefully

---

## Quick Reference: Test Commands

### For User (copy/paste in terminal)
```bash
# Trigger state sync manually
curl -X POST http://localhost:3000/sync

# Read current state
curl http://localhost:3000/state | jq .

# Force reload
killall -HUP vite 2>/dev/null || echo "Vite restarted"
```

### For AI (should happen automatically)
```bash
# Standard workflow
curl -X POST http://localhost:3000/command -d '{"action":"setStyle","selector":"#decision","value":{"backgroundColor":"green"}}'
bash .claude/skills/shadow-staging/deploy.sh
```

---

## Notes for Test Runner

**Pace yourself:**
- Don't rush Scene 5 (voting) - let state sync happen
- Scene 7 (rapid fire) - observe for flickering or missed updates

**Watch for:**
- Console errors in browser dev tools
- Terminal showing command execution
- Network tab for WebSocket reconnections

**Known limitations to test:**
- iframe sandbox may block some interactions
- State sync is polled (5s) not instant
- Very large HTML in shadow may take time to deploy

---

## Optional Advanced Scenarios

### A. Multi-User Simulation
Open playground in second browser tab - does state sync work?

### B. Mobile Responsive
Shrink browser window - does layout adapt?

### C. Long-Running Session
Leave tab open 30+ min - does connection stay alive?

---

**Start with Scene 1 and work through naturally. The journey is the test!**
