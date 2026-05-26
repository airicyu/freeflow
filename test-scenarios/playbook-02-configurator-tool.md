# Playbook 02: Configurator Tool Mode

## Scenario
User is configuring something specific. They expect the tool to remember their settings. This is **not** a demo - it's a working tool.

**Context:** Developer configuring a webhook endpoint with method, headers, payload.

---

## Phase 1: Build the Configurator

### User Input
```
Create a webhook configurator for me. I need to set up a few different webhook endpoints for our service.
```

### Expected AI Behavior
- Recognize as **tool build** (not brainstorm)
- Invoke `playground-update` skill
- **Mode 2** (full build) - create form with inputs for:
  - Endpoint URL
  - HTTP Method (GET/POST/PUT/DELETE)
  - Headers (key-value pairs)
  - Payload body
  - Test button

### Success Criteria
- [ ] Clean form UI, not sketch
- [ ] Proper input fields with labels
- [ ] State collectors registered for all inputs
- [ ] AI knows this needs state persistence

---

## Phase 2: User Configures First Endpoint

### Setup
User fills in form:
- URL: `https://api.example.com/webhook`
- Method: POST
- Header: `Authorization: Bearer <your-token-here>`
- Payload: `{"event": "user.created"}`

### User Input
```
Can you save this configuration? I want to test a few variations but come back to this one.
```

### Expected AI Behavior
- **Critical:** "Save" in **tool context** = persist current values
- Invoke `playground-intent` skill - clarify what "save" means
- Options to present:
  1. "Save as default view" (load with these values next time)
  2. "Save as named config" (add dropdown of saved configs)
  3. "Export as JSON file" (download)
- Let user choose

### Success Criteria
- [ ] AI recognizes this is working tool, not demo
- [ ] Asks which save option they want
- [ ] Implements chosen option correctly

---

## Phase 3: User Chooses "Save as Default"

### User Input
```
Save as default view please.
```

### Expected AI Behavior
- Pre-deploy phase → read state → update shadow → deploy
- Store current values as default in state.json
- Next time UI loads, it pre-fills these values

### Success Criteria
- [ ] State preserved across reload
- [ ] Values populate on refresh
- [ ] User sees their saved config

---

## Phase 4: User Creates Variation

### User Input
```
Now let me try a different endpoint. Change the URL to webhook2 and method to PUT.
```

### Expected AI Behavior
- Live commands to update URL and method dropdown
- User is testing variations, state will change

### Success Criteria
- [ ] Quick live updates
- [ ] State collector captures new values

---

## Phase 5: Load Previous Configuration

### User Input
```
Can I see my original config again? I want to compare.
```

### Expected AI Behavior
- Load default values back into form
- Live commands to restore URL, method, headers, payload
- Or reload page with default state

### Success Criteria
- [ ] Original config loads correctly
- [ ] User can compare configs easily

---

## Phase 6: Export Final Config

### User Input
```
This first config looks good. Can you give me the JSON to use in my actual code?
```

### Expected AI Behavior
- Generate JSON from current form state
- Provide formatted JSON for user to copy
- Optional: Create download button for .json file

### Success Criteria
- [ ] Valid JSON output
- [ ] Matches form state exactly
- [ ] User can use it directly

---

## Success Metrics

| Metric | Target |
|--------|--------|
| State accuracy | 100% - no lost user input |
| Persistence | Config survives reload |
| Export | Valid, usable JSON |
| UX | User trusts the tool |

---

## Contrast with Brainstorm Mode

| | Brainstorm (Playbook 01) | Configurator (Playbook 02) |
|--|--------------------------|---------------------------|
| **"Save" means** | Keep this version | Persist my settings |
| **State matters** | No | YES |
| **Polish level** | Sketch | Production-ready |
| **Iterations** | Rapid, throwaway | Careful, preserved |
| **Goal** | Explore ideas | Get work done |

## Failure Modes to Watch

1. **AI treats as brainstorm** - Deploys rapidly, doesn't preserve state
2. **AI ignores state** - Form resets on reload
3. **AI misinterprets "save"** - Asks too many questions or saves wrong thing
4. **State sync fails** - User input not captured correctly
