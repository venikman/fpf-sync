#!/usr/bin/env bash
set -euo pipefail

# Common env for Fly.io scripts
APP="${FLY_APP:-fpf-mcp}"
REGION="${FLY_REGION:-iad}"
VOLUME="${FLY_VOLUME:-fpf_data}"
VOLUME_SIZE="${FLY_VOLUME_SIZE:-1}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

export FLY_APP="$APP" FLY_REGION="$REGION" FLY_VOLUME="$VOLUME" FLY_VOLUME_SIZE="$VOLUME_SIZE"

if ! command -v fly >/dev/null 2>&1; then
  echo "flyctl is not installed. Install with: brew install flyctl" >&2
  exit 1
fi

echo "Fly: app=$APP region=$REGION volume=$VOLUME size=${VOLUME_SIZE}Gi" >&2