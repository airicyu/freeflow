#!/bin/bash
# Start both server and web client, terminate together on Ctrl+C

set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors for output
SERVER_COLOR="\033[36m"  # Cyan
CLIENT_COLOR="\033[35m"  # Magenta
NC="\033[0m"             # No Color

echo "Starting Freeflow..."
echo ""

# Function to cleanup processes on exit
cleanup() {
  echo ""
  echo "Shutting down Freeflow..."
  if [ -n "$SERVER_PID" ]; then
    kill $SERVER_PID 2>/dev/null || true
    wait $SERVER_PID 2>/dev/null || true
  fi
  if [ -n "$CLIENT_PID" ]; then
    kill $CLIENT_PID 2>/dev/null || true
    wait $CLIENT_PID 2>/dev/null || true
  fi
  echo "Stopped."
  exit 0
}

# Trap signals to cleanup
trap cleanup SIGINT SIGTERM EXIT

# Start the Bun server (port 3000)
echo -e "${SERVER_COLOR}[Server]${NC} Starting on port 3000..."
cd "$SCRIPT_DIR/freeflow-app" && bun --env-file=../.env start &
SERVER_PID=$!

# Wait a moment for server to start
sleep 2

# Start the Vite client
echo -e "${CLIENT_COLOR}[Client]${NC} Starting web client..."
cd "$SCRIPT_DIR/freeflow-web" && bun run dev &
CLIENT_PID=$!

echo ""
echo "✓ Freeflow is running!"
echo "  - Server: http://localhost:3000"
echo "  - Web UI: http://localhost:3002"
echo ""
echo "Press Ctrl+C to stop both server and client."
echo ""

# Wait for both processes
wait
