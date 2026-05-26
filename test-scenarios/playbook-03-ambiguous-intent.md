# Playbook 03: Ambiguous Intent Handling

## Scenario
User uses vague language. AI must clarify before acting, not guess incorrectly.

**Test Focus:** AI's ability to recognize ambiguity and use `playground-intent` skill.

---

## Test Case 1: "Save This"

### Context
User just configured a complex form with multiple sections.

### User Input
```
Save this for me.
```

### Expected AI Behavior
- **STOP** - "Save" is ambiguous
- Invoke `playground-intent` skill
- Determine: user likely wants one of:
  1. Save current form values as default
  2. Export to file
  3. Add as example card in UI
  4. Remember configuration for later
- Ask clarifying question

### Success Criteria
- [ ] AI doesn't assume "save" means one thing
- [ ] AI asks which save option they want
- [ ] Options include: persist state, export, add to UI

### Good Response Example
```
When you say "save", do you mean:
1. Save these settings as the default view?
2. Export this configuration as a file?
3. Add this as a reference card in the UI?
4. Just remember this for our conversation?
```

---

## Test Case 2: "Make It Better"

### Context
UI shows a task list with checkboxes.

### User Input
```
Make it better.
```

### Expected AI Behavior
- **STOP** - "Better" is subjective and ambiguous
- Invoke `playground-intent` skill
- Determine what aspect needs improvement

### Good Response Example
```
What would make it better?
- Better design (colors, layout)?
- Better functionality (features, interactions)?
- Better organization (grouping, sorting)?
- Something else?
```

---

## Test Case 3: "Draw"

### Context
No existing UI yet.

### User Input
```
Draw the workflow.
```

### Expected AI Behavior
- **Ambiguous:** Brainstorm sketch? Polished diagram? Interactive flow?
- Invoke `playground-intent` skill or ask directly

### Good Response Example
```
I can draw this as:
- Quick sketch for brainstorming
- Polished diagram for presentation
- Interactive flowchart you can click through

Which works for you?
```

---

## Test Case 4: "Clear Everything"

### Context
UI has content loaded.

### User Input
```
Clear everything.
```

### Expected AI Behavior
- **Clarify scope** - Clear UI content? Clear messages? Reset to blank?
- Invoke `playground-intent` skill

### Good Response Example
```
Clear:
- Just the playground content (keep structure)?
- Reset to initial empty state?
- Clear my terminal messages too?
```

---

## Test Case 5: Context-Dependent "Save"

### Context A: Demo UI
User clicked through ticket routing example, ended at "T3 Team" result.

### User Input A
```
Save this path as an example.
```

### Expected AI Behavior A
- In **demo context**, "save" likely means "add as reference"
- But still clarify: "Add as reference card, or save as default view?"

---

### Context B: Configurator UI
User just finished configuring webhook settings.

### User Input B
```
Save this path as an example.
```

### Expected AI Behavior B
- Doesn't make sense ("path" in webhook?)
- Recognize semantic confusion
- Ask: "Do you mean save this webhook configuration as an example?"

---

## Test Case 6: Mixed Context

### Context
User is in freeform discussion, no active playground topic.

### User Input
```
I had an idea about the login flow. Can you capture it?
```

### Expected AI Behavior
- "Capture" is ambiguous
- Could mean: write it out, visualize it, remember it
- Ask what they want

### Good Response Example
```
I can capture your idea by:
- Writing it out as text here
- Visualizing it in the playground (diagram or flow)
- Saving it to memory for later reference

What would be most useful?
```

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Ambiguity recognition | 100% - stops on vague words |
| Clarification quality | 2-4 clear options provided |
| Guess rate | <10% - rarely assumes |
| User satisfaction | User feels understood |

---

## Failure Modes to Watch

1. **AI ignores ambiguity** - Jumps straight to action with assumed intent
2. **AI over-clarifies** - Asks for clarification on clear requests
3. **AI defaults to memory** - Always saves to memory file
4. **AI defaults to UI** - Always adds to playground
5. **AI circular questioning** - Keeps asking without progress

---

## Key Ambiguous Words

| Word | Context Matters |
|------|-----------------|
| Save | Tool context (persist) vs Demo context (reference) |
| Draw | Brainstorm vs Polish vs Interactive |
| Show | Display data vs Build UI vs Explain concept |
| Clear | UI content vs Messages vs Reset |
| Better | Design vs Function vs Organization |
| Make | Create new vs Modify existing |
| Fix | Bug vs Improvement vs Preference |
