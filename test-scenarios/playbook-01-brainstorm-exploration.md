# Playbook 01: Brainstorm & Exploration Mode

## Scenario
User is thinking through a workflow concept. They use the playground as a thinking canvas, not a final product. AI helps visualize ideas as they emerge.

**Context:** Product manager exploring a user onboarding flow.

---

## Phase 1: Initial Whiteboard Request

### User Input
```
I need to think through our onboarding flow. Can you help me visualize it?
```

### Expected AI Behavior
- Recognize this as **brainstorm/exploration** mode
- No need for intent skill - clear request for visualization
- Invoke `playground-update` skill
- Create simple placeholder/sketch-style UI
- Use **Mode 2** (shadow → deploy) since building from scratch

### Success Criteria
- [ ] AI invokes playground-update skill
- [ ] UI appears showing rough onboarding steps
- [ ] Visual style is sketch-like, not polished
- [ ] AI doesn't over-engineer - keeps it exploratory

---

## Phase 2: User Interacts with Draft

### Setup
User clicks through the workflow in the playground.

### User Input
```
The step 2 feels too heavy. Can we see it with just email first, then profile later?
```

### Expected AI Behavior
- Recognize as **brainstorm iteration**
- Invoke `playground-update` skill
- **Live command** to remove heavy form → show simplified email-only step
- Update shadow to match
- Deploy to persist

### Success Criteria
- [ ] AI uses live command for instant feedback
- [ ] Shadow updated to match live change
- [ ] Deploy happens
- [ ] AI keeps conversational tone (not overly formal)

---

## Phase 3: User Explores Alternative

### User Input
```
Actually, what if we skip the profile step entirely? Just show me that path.
```

### Expected AI Behavior
- Brainstorm mode - user exploring "what if"
- No intent skill needed
- Quick mode update: hide profile step with live command
- Ask if they want to persist this alternative or keep exploring

### Success Criteria
- [ ] AI treats as exploration, not final decision
- [ ] Quick visual change (live command if simple)
- [ ] AI asks clarifying question about persistence

---

## Phase 4: User Decides to Keep Exploring

### User Input
```
Let's go back to the 2-step version actually. And can you show me what the email step looks like with validation?
```

### Expected AI Behavior
- Revert to 2-step version
- Add validation visualization
- Continue in quick iteration mode
- No deployment pressure - user is still exploring

### Success Criteria
- [ ] AI doesn't complain about reverting
- [ ] Updates quickly
- [ ] Maintains brainstorm energy

---

## Phase 5: User Saves Decision

### User Input
```
I like this 2-step approach. Save this as our reference going forward.
```

### AI Internal Thought
User said "save" - but in **brainstorm context**, they mean "keep this version" not "persist state" or "export".

### Expected AI Behavior
- Invoke `playground-intent` skill to clarify
- Or determine: user wants clean version preserved
- Deploy current shadow to stage (make it the official version)
- Save to memory: "User prefers 2-step onboarding over 3-step"

### Success Criteria
- [ ] AI recognizes context (brainstorm → decision)
- [ ] Asks clarifying if uncertain: "Save as the working reference? Or export?"
- [ ] Makes shadow version the stage version
- [ ] Optionally remembers preference

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Response time | <3 seconds for live commands |
| Intent accuracy | Recognizes brainstorm vs build mode |
| Iteration fluidity | No complaints about changes |
| Clarification | Asks when "save" is ambiguous |

---

## Failure Modes to Watch

1. **AI over-engineers** - Makes polished UI when user wants quick sketch
2. **AI deploys too eagerly** - Deploys every small change in brainstorm mode
3. **AI misinterprets "save"** - Saves to memory instead of preserving UI version
4. **AI gets stuck** - Can't iterate quickly, asks too many questions
