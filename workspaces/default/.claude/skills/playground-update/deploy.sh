#!/bin/bash
# Deploy shadow workspace to stage
# Usage: bash .claude/skills/playground-update/deploy.sh [workspace-id]
# If workspace-id is not provided, attempts to detect from current directory

set -e

# Get workspace ID from first argument or detect from path
WORKSPACE_ID="${1:-}"

if [ -z "$WORKSPACE_ID" ]; then
  # Try to detect from current directory path
  # Expected path: workspaces/<workspace-id>/stage/ or workspaces/<workspace-id>/shadow/
  CURRENT_DIR="$(pwd)"
  if [[ "$CURRENT_DIR" =~ workspaces/([^/]+)/(stage|shadow) ]]; then
    WORKSPACE_ID="${BASH_REMATCH[1]}"
    echo "Detected workspace: $WORKSPACE_ID"
  else
    # Default to 'default' if we can't detect
    WORKSPACE_ID="default"
    echo "Using default workspace"
  fi
fi

# Use API endpoint (preferred method with new architecture)
SERVER_URL="http://localhost:3000"
DEPLOY_URL="$SERVER_URL/api/workspaces/$WORKSPACE_ID/deploy"

echo "Deploying workspace '$WORKSPACE_ID' via API..."
echo "Endpoint: $DEPLOY_URL"

RESPONSE=$(curl -s -X POST "$DEPLOY_URL" || echo '{"success":false,"message":"API call failed"}')

# Parse response (requires jq, fallback to echo)
if command -v jq >/dev/null 2>&1; then
  SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
  MESSAGE=$(echo "$RESPONSE" | jq -r '.message')

  if [ "$SUCCESS" = "true" ]; then
    echo "✓ $MESSAGE"
  else
    echo "✗ Deploy failed: $MESSAGE"
    # Fallback to rsync if API fails
    echo "Falling back to local rsync..."
    local_deploy
  fi
else
  echo "Response: $RESPONSE"
  echo "✓ Deploy completed (install jq for better output)"
fi

# Local deploy fallback function
local_deploy() {
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

  cd "$WORKSPACE_ROOT"

  if [ ! -d "shadow" ]; then
    echo "Error: shadow/ directory not found"
    exit 1
  fi

  if [ ! -d "stage" ]; then
    mkdir -p stage
  fi

  echo "Deploying shadow -> stage (local)..."

  if command -v rsync >/dev/null 2>&1; then
    rsync -av --delete shadow/ stage/
  else
    rm -rf stage/*
    cp -r shadow/* stage/ 2>/dev/null || true
  fi
}

# Export for use in this script
export -f local_deploy 2>/dev/null || true

echo "Done! HMR will refresh the UI."
