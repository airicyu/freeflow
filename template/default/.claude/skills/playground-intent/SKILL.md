---
name: playground-intent
description: Interpret ambiguous user intent when user speaks in playground context
version: 1.0.0
tools: [ask_user]
---

# Playground Intent Clarification Skill

**When to use:** User says something ambiguous like "save", "draw", "show", "clear", "make it better" without clear intent.

**Core insight:** Words mean different things depending on context. In playground context, the same word can mean 3-4 different things.

---

## Common Ambiguities

### "Save" can mean:

| User probably means... | When... | Ask to confirm |
|------------------------|---------|----------------|
| Export as standalone HTML | User built something complete | "Export as downloadable HTML?" |
| Persist UI state as default | Interactive tool user configured | "Save current selections as page default?" |
| Add to UI as reference | Brainstorming, examples matter | "Add visual reference card to playground?" |
| Remember in AI memory | User preference, "remember this" | "Remember this for future reference?" |
| Save to file in workspace | Technical user, wants code | "Save as file in workspace?" |

### "Draw" can mean:

| User probably means... | When... |
|------------------------|---------|
| Brainstorm mind flow | Exploring ideas, thinking out loud |
| Build adhoc UI demo | Vibe testing, feel the interaction |
| Create polished diagram | Final presentation ready |
| Sketch wireframe | Early stage, rough ideas |

### "Clear" can mean:

| User probably means... | Action |
|------------------------|--------|
| Clear playground content | Empty body, keep structure |
| Reset to initial state | Re-deploy original |
| Clear specific element | Targeted removal |
| Clear my message history | (Not applicable in playground) |

---

## Key Distinctions to Consider

### Demo vs Tool Pattern

| | Demo | Tool |
|--|------|------|
| **Purpose** | Show how something works | Get work done |
| **Value** | The journey/exploration | The result/output |
| **Example** | Ticket routing workflow (click through) | Configurator (save my config) |
| **Save state?** | Usually NO - defeats exploration | Usually YES - preserve my work |
| **User says** | "Show me how..." | "Let me configure..." |

**Rule:** If UI is a tutorial/demo, "save" rarely means persist state. If it's a workspace tool, "save" usually means preserve configuration.

### Brainstorm Canvas vs Product Prototype

| Brainstorm Canvas | Product Prototype |
|-------------------|-------------------|
| Messy is OK | Polished matters |
| Rapid iteration | Careful refinement |
| Throwaway sketches | Reusable components |
| "What if..." | "Make it so..." |

---

## Clarification Strategy

**Don't guess when uncertain.** Ask the user:

```
When you say "save", do you mean:
1. Export as standalone HTML (downloadable file)?
2. Save current selections as the default view next time?
3. Add this as an example/reference in the UI?
4. Just remember this configuration for our conversation?
```

**Or propose your interpretation:**
```
I think you want to [interpretation] because [reasoning]. 
Should I proceed with that, or did you mean something else?
```

---

## Context Clues

Look for these signals to guide interpretation:

| Signal | Suggests... |
|--------|-------------|
| "Show me..." | Demo/brainstorm mode |
| "Let me..." | Tool/workspace mode |
| "I want to try..." | Exploration |
| "This should..." | Specification |
| Clicked through multiple states | Might want to save final state |
| Just viewing initial state | Probably exploring |
| Mentioned "download", "export", "share" | Export intent |
| Mentioned "remember", "keep", "store" | Persistence intent |

---

## Response Patterns

### When intent is clear:
Proceed with appropriate skill (`playground-update`, memory, etc.)

### When intent is ambiguous:
Ask clarifying question before acting. Don't default to memory.

### When user confirms interpretation:
Acknowledge: "Got it - you want to [confirmed intent]. I'll [action]."

---

## Integration with Other Skills

After clarifying intent:
- If UI update needed → invoke `playground-update` skill
- If memory needed → use memory system
- If export needed → generate standalone HTML
- If state persistence needed → modify state loading logic

---

## Examples

**User:** "Save this path as an example"
→ **Unclear:** Export? Persist state? Add to UI? Remember?
→ **Ask:** "Do you want to (1) export as HTML, (2) save current selections as default view, or (3) add this as a visual reference card?"

**User:** "Draw a workflow"
→ **Unclear:** Brainstorm sketch or polished diagram?
→ **Ask:** "Quick sketch for brainstorming, or polished diagram for presentation?"

**User:** "Make it better"
→ **Unclear:** What aspect? What's the goal?
→ **Ask:** "Better in what way - cleaner design, more features, simpler layout, or something else?"
