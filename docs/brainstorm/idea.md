I want to make a freeflow AI interactive tools.

My idea is something like, there is a html/web running.
On the web, there is a chat view on left. And there is a free stage screen on right.

When I chat view chatting, it is actually using websocket to connecting to a local server.
So that it is proxying chatting with a local claude code AI.
user and the AI will work interactively freely so that we can play/draw anything manipulating everything on the right hand side main view.

Meanwhile, the whole thing will also has a local bunjs server running.
It has web socketing communication ability so that the web UI side is proxying talking to this js running server.
and the js running server is proxying to claude code conversation.
The claude code side AI will be the brain, so when user and AI talking about how to play the main view, claude code will understand the whole context and do the change.