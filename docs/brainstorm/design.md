# Freeflow Architecture

## Components

```
Browser (Chat + Canvas)
    ↕ WebSocket
Bun Server (message router, conversation state)
    ↕ stdin/stdout (spawn)
claudep --freeflow (wrapper)
    ↕ spawns
Claude Code (-p mode, stateless)
```

## Message Flow

1. User types in browser → WebSocket → Bun Server
2. Bun Server maintains conversation history
3. Bun Server spawns: `claudep --freeflow "full conversation + new message"`
4. Claude Code processes and exits with response
5. Bun Server parses response, updates history
6. Bun Server sends reply + canvas commands to browser via WebSocket

```typescript
// Bun server keeps conversation
const conversation = []

ws.on('message', async (userMsg) => {
  conversation.push({ role: 'user', content: userMsg })

  // Spawn fresh process each time (stateless AI)
  const proc = spawn(['claudep', '--freeflow'], {
    stdin: 'pipe',
    stdout: 'pipe'
  })

  // Send conversation as JSON line
  proc.stdin.write(JSON.stringify({
    messages: conversation,
    system: 'You are a helpful assistant. Reply with JSON: {reply: string, canvas: {actions: []}}'
  }) + '\n')

  // Read response
  const response = await new Response(proc.stdout).text()
  const result = JSON.parse(response)

  conversation.push({ role: 'assistant', content: result.reply })

  // Send to browser
  ws.send(JSON.stringify({
    reply: result.reply,
    canvas: result.canvas
  }))
})
```

## claudep --freeflow Mode

Your wrapper reads JSON from stdin, constructs prompt, calls Claude Code:

```bash
#!/bin/bash
# --freeflow mode

read -r input
messages=$(echo "$input" | jq -r '.messages')
system=$(echo "$input" | jq -r '.system')

# Convert JSON messages to Claude Code format
prompt=$(echo "$messages" | jq -r 'map("\(.role): \(.content)") | join("\n")')

# Call Claude Code with conversation
echo "$system" > /tmp/sys.txt
echo "$prompt" | claude -p -f /tmp/sys.txt
```

## Alternative: Persistent Process

Keep Claude Code running (skip -p) and script around it? Messy.

Better: Bun server does history management, AI is stateless.

## Canvas Commands Protocol

AI outputs structured canvas commands:

```json
{
  "reply": "I'll draw a red circle for you!",
  "canvas": {
    "actions": [
      { "cmd": "clear" },
      { "cmd": "draw", "shape": "circle", "x": 400, "y": 300, "r": 50, "color": "red" },
      { "cmd": "text", "text": "Hello!", "x": 400, "y": 300 }
    ]
  }
}
```

Browser interprets commands and renders to Canvas/SVG.
