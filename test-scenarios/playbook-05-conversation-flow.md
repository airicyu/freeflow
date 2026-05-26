# Playbook 05: Conversation Continuity & Edge Cases

## Scenario
Test multi-turn conversations, interruptions, and edge cases.

---

## Test Case 1: User Changes Mind Mid-Deploy

### Phase A: AI Deploying
- AI sent `pre-deploy` signal
- Blocking overlay showing
- AI reading state, updating shadow

### User Input
```
Actually wait, don't deploy yet. I want to add one more thing.
```

### Expected AI Behavior
- **Problem:** AI already in blocking pre-deploy phase
- Cannot easily cancel
- Acknowledge: "I'm in the middle of deployment. Let me finish this one, then we'll add your change."
- Complete current deploy
- Then: "Ready - what did you want to add?"

### Success Criteria
- [ ] Graceful handling of interruption
- [ ] Current deploy completes (don't break state)
- [ ] User can then add new change

---

## Test Case 2: Rapid Fire Requests

### User Input Sequence
```
Change the title to blue.
[5 seconds later]
No wait, make it red.
[3 seconds later]
Actually green.
```

### Expected AI Behavior
- Don't queue 3 separate deploys
- Respond to latest: "Green it is."
- Cancel or ignore intermediate requests
- Single deploy with final color

### Success Criteria
- [ ] No multiple reloads
- [ ] Final color is green
- [ ] Smooth UX, not jerky

---

## Test Case 3: Context Loss After Reload

### User Input
```
Add a username field to the form.
```

### AI Action
- Deploys new UI with username field
- Page reloads

### User Input (after reload)
```
Now make it required.
```

### Expected AI Behavior
- **Knows** which field is "it"
- Context maintained across reload
- Adds `required` attribute to username field

### Success Criteria
- [ ] AI doesn't ask "which field?"
- [ ] Correctly identifies context
- [ ] Smooth continuation

---

## Test Case 4: User References Previous State

### User Input
```
Can you go back to the version from 10 minutes ago? I liked that one better.
```

### Expected AI Behavior
- System doesn't have auto-versioning
- Honest: "I don't keep previous versions automatically. But if you have git set up, you could check out an earlier commit."
- Or: "I can try to recreate it from memory. What specifically did you like about that version?"

### Success Criteria
- [ ] Honest about limitations
- [ ] Helpful alternatives offered
- [ ] No pretending to have versioning

---

## Test Case 5: Technical User Requests Code

### User Input
```
This looks good. Give me the HTML/CSS so I can use it in my actual project.
```

### Expected AI Behavior
- User wants **export**, not UI update
- Provide clean HTML/CSS code
- Explain any dependencies (freeflow-core.js, etc.)
- Note: "This uses freeflow-collectors.js for state - you may want to remove that if using standalone."

### Success Criteria
- [ ] Clean, usable code provided
- [ ] Dependencies explained
- [ ] User can copy-paste and use

---

## Test Case 6: User Wants to "Fork"

### User Input
```
I want to keep this version but also try a completely different approach. Can we branch this?
```

### Expected AI Behavior
- Multi-workspace concept not implemented yet
- Honest: "Full workspace branching isn't supported yet. I can:
1. Save current state and then make changes
2. Create a new named workspace if that's enabled
3. Export current version before making changes"
- Offer best available option

### Success Criteria
- [ ] Honest about current capabilities
- [ ] Workaround offered
- [ ] User feels supported

---

## Test Case 7: User Asks About State

### User Input
```
What do you know about my current setup?
```

### Expected AI Behavior
- Check state.json
- Summarize what user has configured
- "I can see you've set:
- Webhook URL: https://...
- Method: POST
- Two headers configured
- Payload has event field"

### Success Criteria
- [ ] Accurate state summary
- [ ] No hallucination
- [ ] Useful context

---

## Test Case 8: User Interrupts with Clarification

### Phase A
- AI in `cooking` phase
- Toast showing "AI is cooking..."

### User Input
```
When I said "make it pop", I meant add animation, not change the color.
```

### Expected AI Behavior
- **Problem:** Already in cooking phase
- Check if change is still possible
- If shadow not yet deployed: "Got it, I'll add animation instead of changing the color."
- If already deploying: "I'll add that animation in the next update."

### Success Criteria
- [ ] Graceful clarification handling
- [ ] Adjusts if possible
- [ ] Communicates if too late

---

## Test Case 9: User Tests AI Memory

### User Input
```
What did I tell you my favorite color was at the start of this conversation?
```

### Expected AI Behavior
- Check memory if saved
- If not: "I don't have that in memory. What is it? I'll save it now."
- Honest about what was remembered vs not

### Success Criteria
- [ ] Honest about memory
- [ ] No hallucination
- [ ] Opportunity to save now

---

## Test Case 10: User Wants to "Undo"

### User Input
```
Undo the last change.
```

### Expected AI Behavior
- System has no automatic undo
- Honest: "I don't have an automatic undo feature. I can:
1. Manually revert the last change if you tell me what it was
2. Deploy the previous version from shadow if I haven't overwritten it"
- Ask what specifically to undo

### Success Criteria
- [ ] Honest about no undo
- [ ] Manual alternative offered
- [ ] Helpful not dismissive

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Graceful degradation | Handles interruptions smoothly |
| Honesty | No false capabilities claimed |
| Context retention | Maintains conversation thread |
| User satisfaction | Feels natural, not robotic |

---

## Philosophy

**The AI should:**
- Know its limitations
- Be honest about capabilities
- Offer alternatives
- Maintain conversation context
- Handle interruptions gracefully
- Not over-promise
