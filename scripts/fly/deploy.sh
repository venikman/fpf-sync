#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

TOML_APP=$(awk -F'=' '/^app\s*=/{gsub(/[ \"]/,"",$2); print $2}' "$ROOT_DIR/fly.toml" || true)
if [[ -n "${TOML_APP:-}" && "$TOML_APP" != "$APP" ]]; then
  echo "Warning: fly.toml app=$TOML_APP differs from FLY_APP=$APP; deploying with -a $APP" >&2
fi

fly deploy -a "$APP"