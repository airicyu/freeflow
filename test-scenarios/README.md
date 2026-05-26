# Freeflow Test Playbooks

Collection of workflow playbooks for testing AI behavior in Freeflow.

## Playbooks

| # | Playbook | Focus | Complexity |
|---|----------|-------|------------|
| 01 | [Brainstorm Exploration](playbook-01-brainstorm-exploration.md) | Demo/exploration mode, rapid iteration | Medium |
| 02 | [Configurator Tool](playbook-02-configurator-tool.md) | Working tool mode, state persistence | High |
| 03 | [Ambiguous Intent](playbook-03-ambiguous-intent.md) | Handling vague user requests | Medium |
| 04 | [Live Commands Flow](playbook-04-live-commands-flow.md) | Smooth deploy workflow, state sync | High |
| 05 | [Conversation Flow](playbook-05-conversation-flow.md) | Multi-turn, interruptions, edge cases | Medium |

## Quick Start

1. **Pick a playbook** based on what you want to test
2. **Follow the phases** in order
3. **Check success criteria** after each phase
4. **Note failures** for improvement

## Key Concepts

### Demo vs Tool Pattern

| | Demo (Brainstorm) | Tool (Configurator) |
|--|-------------------|---------------------|
| Purpose | Explore ideas | Get work done |
| "Save" means | Keep this version | Persist my settings |
| State matters | No | YES |
| Polish | Sketch | Production |
| Goal | The journey | The result |

### Mode Selection

| Mode | Use When | Live Commands? |
|------|----------|----------------|
| Mode 1 | Quick tweaks, instant feedback | Yes |
| Mode 2 | Complex build, from scratch | No |

### Skills

| Skill | Purpose | When to Invoke |
|-------|---------|----------------|
| `playground-intent` | Clarify ambiguous requests | "save", "draw", "clear", "make it better" |
| `playground-update` | UI update mechanics | Intent is clear, need to deploy |

## Running Tests

### Solo Testing
1. Open Freeflow
2. Start at Phase 1 of chosen playbook
3. Follow user inputs
4. Compare AI behavior to expected
5. Mark success/failure

### Structured Testing
1. Create test session
2. Run through multiple playbooks
3. Log failures
4. Review patterns

## Failure Categories

| Category | Description | Example |
|----------|-------------|---------|
| Intent | Misunderstood user | Saved to memory instead of UI |
| Mode | Wrong workflow mode | Used Mode 2 for quick toggle |
| State | Lost user input | Form reset on reload |
| Timing | Blocked at wrong time | Froze during cooking phase |
| Honesty | False capabilities | Claimed undo feature exists |

## Notes

- Playbooks are **guideposts**, not rigid scripts
- AI can deviate if situation changes
- Success = user achieves goal, not rigid adherence
- Update playbooks as system evolves
