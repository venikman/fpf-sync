#!/usr/bin/env bash
set -euo pipefail

# Simple Yandex Disk sync script
# Downloads a file from a public Yandex Disk share

env_or() {
  local name="$1" fallback="${2:-}" v="${!name:-}"
  [[ -n "${v//[[:space:]]/}" ]] && printf "%s" "$v" || printf "%s" "$fallback"
}

get_arg() {
  local flag="$1" default="${2:-}"
  for ((i=1; i<$#; i++)); do
    if [[ "${!i}" == "$flag" ]]; then
      local next=$((i+1))
      [[ $next -le $# ]] && printf "%s" "${!next}" && return
    fi
  done
  printf "%s" "$default"
}

PUBLIC_URL="$(env_or PUBLIC_URL "$(env_or YANDEX_PUBLIC_URL)")"
PUBLIC_PATH="$(env_or PUBLIC_PATH "$(env_or YANDEX_PUBLIC_PATH)")"
TARGET_NAME="$(env_or TARGET_NAME "$(env_or YANDEX_TARGET_NAME)")"
DEST_PATH="$(env_or DEST_PATH "yadisk")"
DEST_FILENAME="$(env_or DEST_FILENAME "$(env_or YANDEX_DEST_FILENAME "First Principles Framework — Core Conceptual Specification (holonic).md")")"
MAX_BYTES="${MAX_BYTES:-10485760}"

# Parse CLI args
PUBLIC_URL="${PUBLIC_URL:-$(get_arg --public-url "$@")}"
PUBLIC_PATH="${PUBLIC_PATH:-$(get_arg --public-path "$@")}"
TARGET_NAME="${TARGET_NAME:-$(get_arg --target-name "$@")}"
DEST_PATH="${DEST_PATH:-$(get_arg --dest-path "$@")}"
DEST_FILENAME="${DEST_FILENAME:-$(get_arg --dest-filename "$@")}"
MAX_BYTES="${MAX_BYTES:-$(get_arg --max-bytes "$@")}"

[[ -z "$PUBLIC_URL" ]] && echo "Error: --public-url required" >&2 && exit 1

API_BASE="https://cloud-api.yandex.net/v1/disk/public/resources"

# Fetch metadata
meta_url="$API_BASE?public_key=$(printf '%s' "$PUBLIC_URL" | jq -sRr @uri)"
[[ -n "$PUBLIC_PATH" ]] && meta_url="${meta_url}&path=$(printf '%s' "$PUBLIC_PATH" | jq -sRr @uri)"

meta=$(curl -sS "$meta_url")
resource_type=$(jq -r '.type' <<< "$meta")

if [[ "$resource_type" == "file" ]]; then
  file_meta="$meta"
elif [[ "$resource_type" == "dir" ]]; then
  [[ -z "$TARGET_NAME" ]] && echo "Error: folder share requires --target-name" >&2 && exit 1

  # List folder and find file
  file_path=$(jq -r '.path' <<< "$meta")
  list_url="$API_BASE?public_key=$(printf '%s' "$PUBLIC_URL" | jq -sRr @uri)&path=$(printf '%s' "$file_path" | jq -sRr @uri)&limit=1000"

  dir_meta=$(curl -sS "$list_url")
  file_meta=$(jq --arg name "$TARGET_NAME" '.._embedded.items[] | select(.type == "file" and .name == $name)' <<< "$dir_meta" | head -1)

  [[ -z "$file_meta" ]] && echo "Error: file '$TARGET_NAME' not found" >&2 && exit 1
else
  echo "Error: unknown resource type: $resource_type" >&2 && exit 1
fi

# Get download URL
file_path=$(jq -r '.path' <<< "$file_meta")
download_url="$API_BASE/download?public_key=$(printf '%s' "$PUBLIC_URL" | jq -sRr @uri)&path=$(printf '%s' "$file_path" | jq -sRr @uri)"

download_meta=$(curl -sS "$download_url")
href=$(jq -r '.href' <<< "$download_meta")

[[ "$href" == "null" || -z "$href" ]] && echo "Error: no download URL" >&2 && exit 1

# Download file
mkdir -p "$DEST_PATH"
output_path="$DEST_PATH/$DEST_FILENAME"

curl -sS -o "$output_path" "$href"

file_size=$(stat -c%s "$output_path" 2>/dev/null || stat -f%z "$output_path" 2>/dev/null)
echo "✓ Downloaded: $output_path ($file_size bytes)"
