# Playbook 06: Decision/Strategy Tool

## Scenario
User needs to make decisions with branching options. AI creates an interactive decision tree where user choices matter and should be preserved.

**Context:** Product manager deciding feature prioritization with trade-offs.

---

## Key Characteristics

| | Decision Tool |
|--|---------------|
| **Purpose** | Make actual decisions, capture choices |
| **Value** | The **result** (what user chose) |
| **Interaction** | User clicks options, sees outcomes |
| **State matters** | YES - choices should be saved |
| **"Save" means** | Persist current selections as default view |

**Contrast with Demo:**
- Demo = Show how routing works (value is the exploration)
- Decision Tool = "I chose urgent + T3, save this as my config" (value is the result)

---

## Phase 1: Build Decision Framework

### User Input
```
I need to prioritize features for Q3. There are 3 criteria: impact, effort, confidence. Each has options. Can you build an interactive tool?
```

### Expected AI Behavior
- Recognize as **working tool** (not demo)
- Invoke `playground-update` skill
- Create decision tree with:
  - **Decision Point 1**: Impact (High/Medium/Low)
  - **Decision Point 2**: Effort (Large/Medium/Small)  
  - **Decision Point 3**: Confidence (High/Medium/Low)
  - **Result Panel**: Shows calculated priority score
  - **Save button**: "Save this decision"

### UI Structure
```
┌─────────────────────────────────────────┐
│ Feature Prioritization Tool             │
├─────────────────────────────────────────┤
│                                         │
│ Impact:  [High] [Medium] [Low]         │
│                                         │
│ Effort:  [Large] [Medium] [Small]       │
│                                         │
│ Confidence: [High] [Medium] [Low]       │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ Result: P2 (Medium Priority)        │ │
│ │ • Consider for Q3 if capacity       │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ [Save This Decision]                    │
│                                         │
└─────────────────────────────────────────┘
```

### State Collectors Needed
```javascript
window.freeflow.registerCollector('prioritization', () => ({
  impact: document.querySelector('[data-impact].selected')?.dataset.impact,
  effort: document.querySelector('[data-effort].selected')?.dataset.effort,
  confidence: document.querySelector('[data-confidence].selected')?.dataset.confidence,
  calculatedPriority: document.getElementById('result')?.dataset.priority
}));
```

---

## Phase 2: User Makes Selections

### Setup
User clicks through options:
1. Clicks "High" impact
2. Clicks "Small" effort
3. Clicks "High" confidence
4. Result updates to "P1 (Do First)"

### Expected AI Behavior
- Live commands update visual selection immediately
- Result panel updates automatically based on logic
- No deploy yet - user still exploring

### Success Criteria
- [ ] Options visually selected (highlighted)
- [ ] Result panel calculates correctly
- [ ] State collectors capture all choices
- [ ] User can change mind freely

---

## Phase 3: User Saves Decision

### User Input
```
This looks right - High impact, Small effort, High confidence = P1. Save this as my decision.
```

### Expected AI Behavior
- **Critical:** "Save" in decision context = persist as default view
- Invoke `playground-intent` skill if ambiguous
- Confirm: "Save these choices as the default view?"
- Full deploy workflow:
  1. `ui_cooking` signal
  2. Read current state (the choices)
  3. Update shadow HTML with `selected` attributes
  4. `pre-deploy` → `deploy` → `reload`
  5. Page reloads with user's choices pre-selected

### Shadow Update Pattern
```javascript
// From state.json
{
  "prioritization": {
    "impact": "high",
    "effort": "small", 
    "confidence": "high",
    "calculatedPriority": "P1"
  }
}

// Update shadow HTML:
// Before: <button data-impact="high">High</button>
// After:  <button data-impact="high" class="selected">High</button>

// Also pre-calculate and show result
```

### Success Criteria
- [ ] State preserved across reload
- [ ] User's choices pre-selected on load
- [ ] Result panel shows correct calculation
- [ ] "Save" button can be clicked again for updates

---

## Phase 4: User Returns Later

### User Input
```
Actually, let me reconsider the effort. Change it to Medium.
```

### Expected AI Behavior
- User changes "Small" → "Medium"
- Result updates (P1 → P2)
- User might save again

### Success Criteria
- [ ] Previous saved state loads correctly
- [ ] User can modify choices
- [ ] Save workflow works again

---

## Phase 5: Export/Share Decision

### User Input
```
Can you give me a summary of my decision to share with the team?
```

### Expected AI Behavior
- Read state.json
- Generate summary:
  ```
  Feature Prioritization Decision:
  - Impact: High
  - Effort: Small
  - Confidence: High
  - Result: P1 (Do First)
  
  Recommended action: Include in Q3 roadmap immediately.
  ```

### Success Criteria
- [ ] Accurate summary of saved choices
- [ ] Clear recommendation based on logic
- [ ] Easy to copy/share

---

## Other Decision Tool Examples

### Example 1: Architecture Decision
```
Help me decide between monolith vs microservices.

Decision Points:
- Team size: Small/Medium/Large
- Traffic: Low/Medium/High
- Growth rate: Stable/Moderate/Rapid
- Result: Monolith / Microservices / Hybrid
```

### Example 2: Technology Stack
```
Choose our frontend stack.

Decision Points:
- Team expertise: React/Vue/Angular/None
- Project complexity: Simple/Medium/Complex
- Timeline: Tight/Moderate/Flexible
- Result: Recommended stack + rationale
```

### Example 3: Risk Assessment
```
Evaluate project risks.

Decision Points:
- Technical risk: Low/Medium/High
- Timeline risk: Low/Medium/High  
- Resource risk: Low/Medium/High
- Result: Overall risk level + mitigation strategies
```

---

## Success Metrics

| Metric | Target |
|--------|--------|
| State accuracy | 100% - no lost choices |
| Persistence | Choices survive reload |
| Clarity | User understands the decision framework |
| Flexibility | Can change choices, re-save |

---

## Failure Modes to Watch

1. **AI treats as demo** - Doesn't persist state, user loses work
2. **No save mechanism** - User can't preserve decisions
3. **No visual feedback** - Unclear what's selected
4. **No result calculation** - Just buttons, no outcome shown
5. **Shadow not updated** - State saved but not rendered on reload

---

## Key Distinctions

### Demo vs Decision Tool

| | Demo | Decision Tool |
|--|------|---------------|
| **"Save this path"** | Add as reference example | Persist my choices |
| **Value** | The journey | The destination |
| **State** | Disposable | Precious |
| **Reload** | Fresh start | Resume where I left off |
| **User intent** | "Show me how" | "Help me decide" |

### When to Ask Clarification

User says: "Save this"
- **In demo context**: "Add as reference, or save as default view?"
- **In decision context**: Likely means "persist my choices" - proceed

---

## Checklist for AI

Before building:
- [ ] Recognize this is a tool, not a demo
- [ ] Identify all decision points
- [ ] Plan state collectors
- [ ] Include result/outcome display
- [ ] Include save mechanism

During use:
- [ ] Live commands for instant feedback
- [ ] State syncing continuously
- [ ] Clear visual indication of selections

On save:
- [ ] Full deploy workflow
- [ ] Bake state into shadow HTML
- [ ] Verify reload shows saved choices

---

## Summary

**Decision Tool Pattern:**
1. User explores options (live commands)
2. User makes choices (state captured)
3. User sees result (calculated display)
4. User saves decision (deploy with state)
5. User returns to saved state (pre-selected choices)

**Key:** The user's choices are the product. Preserve them.
