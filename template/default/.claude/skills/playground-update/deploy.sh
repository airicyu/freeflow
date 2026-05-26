#!/bin/bash
# Deploy shadow workspace to stage
# Usage: bash /path/to/deploy.sh [workspace-id]
#        (when run from shadow dir without args, auto-detects workspace)

set -e

# Get workspace ID from first argument or detect from current directory
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

# Find the workspace directory - check various possible locations
CURRENT_DIR="$(pwd)"
WORKSPACE_DIR=""

# If we're in a shadow/stage directory, go up one level
if [[ "$CURRENT_DIR" =~ /shadow$ ]] || [[ "$CURRENT_DIR" =~ /stage$ ]]; then
  WORKSPACE_DIR="$(cd "$(dirname "$CURRENT_DIR")" && pwd 2>/dev/null)" || true
fi

# If that didn't work, try the standard path
if [ -z "$WORKSPACE_DIR" ] || [ ! -d "$WORKSPACE_DIR/shadow" ]; then
  # Check if script is being run from within .claude/skills directory
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd 2>/dev/null)" || ""
  if [ -n "$SCRIPT_DIR" ] && [[ "$SCRIPT_DIR" =~ /\.claude/skills/ ]]; then
    WORKSPACE_DIR="$(cd "$SCRIPT_DIR/../../../" && pwd 2>/dev/null)" || true
  fi
fi

# Final fallback to standard location
if [ -z "$WORKSPACE_DIR" ] || [ ! -d "$WORKSPACE_DIR/shadow" ]; then
  WORKSPACE_DIR="/home/airic/airwave/freeflow/workspaces/$WORKSPACE_ID"
fi

echo "Workspace directory: $WORKSPACE_DIR"

if [ ! -d "$WORKSPACE_DIR/shadow" ]; then
  echo "Error: shadow/ directory not found at $WORKSPACE_DIR/shadow"
  exit 1
fi

if [ ! -d "$WORKSPACE_DIR/stage" ]; then
  mkdir -p "$WORKSPACE_DIR/stage"
fi

echo "Deploying shadow -> stage..."

# Exclude infrastructure files - served from /_shared/
# Also exclude .claude/ directory - skills/config belong at workspace root only
EXCLUDE_PATTERN="--exclude=freeflow-core.js --exclude=freeflow-collectors.js --exclude=.claude/"

if command -v rsync >/dev/null 2>&1; then
  rsync -av --delete $EXCLUDE_PATTERN "$WORKSPACE_DIR/shadow/" "$WORKSPACE_DIR/stage/"
else
  # Manual copy, excluding infrastructure files
  find "$WORKSPACE_DIR/shadow/" -maxdepth 1 -type f ! -name "freeflow-core.js" ! -name "freeflow-collectors.js" -exec cp {} "$WORKSPACE_DIR/stage/" \;
  find "$WORKSPACE_DIR/shadow/" -maxdepth 1 -type d -exec cp -r {} "$WORKSPACE_DIR/stage/" \; 2>/dev/null || true
fi

echo "✓ Deploy complete!"
