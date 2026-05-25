# Freeflow Test Playbook: Interactive Workflow Design Journey

## Overview
This playbook guides you through a realistic user-AI collaboration scenario to test Freeflow's core features: terminal-based AI interaction, live UI updates, shadow/staging workflow, and interactive playground elements.

---

## Alternative Scenario: Support Ticket Routing Decision Tree

A more focused scenario demonstrating state collection and decision path tracking.

### Phase 1: Initial Request
**User:** "I need to design a support ticket routing workflow. When a ticket comes in, we check urgency, category, and route to the right team. Can you make it interactive so I can demonstrate the flow?"

**AI Actions:**
- Creates HTML with decision nodes: Urgency → Type → Complexity
- Each node has buttons that advance to next step
- Path sidebar shows current selections
- Final result shows routing decision + SLA

### Phase 2: User Interacts
**User clicks through in playground:**
1. "Critical (System Down)"
2. "Technical / Bug"
3. "L3: Engineering escalation"

### Phase 3: Collect and Document
**User:** "Save this path as an example"

**AI Actions:**
```bash
curl -X POST http://localhost:3000/sync
Read stage/state.json  # Gets workflowPath with all decisions
Write shadow/workflow-summary.md  # Documents the example path
bash .claude/skills/playground-update/deploy.sh
```

### Phase 4: Iterate
**User:** "Add customer tier (Free/Pro/Enterprise) - Enterprise gets priority bump"

**AI Actions:**
1. Live command: Show "New decision added!" notification
2. Edit shadow to insert new node
3. Deploy updated workflow

**Key Patterns:**
- `registerCollector('workflowPath', () => ({...}))` in app.js
- State sync captures full decision path
- Summary doc references actual user selections
- Iteration uses live command + shadow deploy
