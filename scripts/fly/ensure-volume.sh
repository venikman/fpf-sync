#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

if fly volumes list -a "$APP" | awk '{print $1}' | grep -qx "$VOLUME"; then
  echo "Volume exists: $VOLUME"
else
  echo "Creating volume: $VOLUME in $REGION size=${VOLUME_SIZE}Gi"
  fly volumes create "$VOLUME" --size "$VOLUME_SIZE" --region "$REGION" -a "$APP"
fi