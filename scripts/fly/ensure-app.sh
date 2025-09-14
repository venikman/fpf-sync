#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

if fly apps show "$APP" >/dev/null 2>&1; then
  echo "App exists: $APP"
else
  echo "Creating app: $APP"
  fly apps create "$APP"
fi