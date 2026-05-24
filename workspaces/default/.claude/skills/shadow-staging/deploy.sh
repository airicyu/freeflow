#!/bin/bash
# Deploy shadow workspace to stage
# Usage: bash .claude/skills/shadow-staging/deploy.sh

set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Go up to workspace root: .claude/skills/shadow-staging/ -> ../../.. = workspaces/default/
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

cd "$WORKSPACE_ROOT"

# Check directories exist
if [ ! -d "shadow" ]; then
  echo "Error: shadow/ directory not found in $WORKSPACE_ROOT"
  exit 1
fi

if [ ! -d "stage" ]; then
  echo "Info: Creating stage/ directory"
  mkdir -p stage
fi

echo "Deploying shadow -> stage..."
echo "Source: $(ls -1 shadow/ 2>/dev/null | wc -l | xargs) files in shadow/"

# Use rsync if available, fallback to cp
if command -v rsync >/dev/null 2>&1; then
  rsync -av --delete shadow/ stage/
else
  rm -rf stage/*
  cp -r shadow/* stage/ 2>/dev/null || true
fi

echo "Done! HMR will refresh the UI."
