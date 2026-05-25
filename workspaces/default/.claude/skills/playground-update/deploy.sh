#!/bin/bash
# Deploy shadow workspace to stage
# Usage: bash .claude/skills/playground-update/deploy.sh [workspace-id]

set -e

# Get workspace ID from first argument or detect from path
WORKSPACE_ID="${1:-}"

if [ -z "$WORKSPACE_ID" ]; then
  CURRENT_DIR="$(pwd)"
  if [[ "$CURRENT_DIR" =~ workspaces/([^/]+)/(stage|shadow) ]]; then
    WORKSPACE_ID="${BASH_REMATCH[1]}"
    echo "Detected workspace: $WORKSPACE_ID"
  else
    WORKSPACE_ID="default"
    echo "Using default workspace"
  fi
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/../../../" && pwd)/workspaces/$WORKSPACE_ID"

cd "$WORKSPACE_ROOT"

if [ ! -d "shadow" ]; then
  echo "Error: shadow/ directory not found at $WORKSPACE_ROOT/shadow"
  exit 1
fi

if [ ! -d "stage" ]; then
  mkdir -p stage
fi

echo "Deploying shadow -> stage..."

if command -v rsync >/dev/null 2>&1; then
  rsync -av --delete shadow/ stage/
else
  rm -rf stage/*
  cp -r shadow/* stage/ 2>/dev/null || true
fi

echo "✓ Deploy complete! HMR will refresh the UI."
