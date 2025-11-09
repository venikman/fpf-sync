#!/usr/bin/env bash
set -euo pipefail

# Diff-eval using Warp CLI (no TypeScript)
# - Requires warp-cli (or set WARP_AGENT_CLI to binary path)
# - Env:
#   DIFF_TARGET_PATH: file to diff (default: main FPF doc)
#   BASE_REF or GITHUB_BASE_REF: base branch/ref (default: main)
#   AGENT_NAME: Warp agent name (default: diff-evaluator)

env_or() {
  local name="$1"; local fallback="${2:-}"; local v="${!name:-}";
  if [[ -n "${v//[[:space:]]/}" ]]; then printf "%s" "$v"; else printf "%s" "$fallback"; fi
}

TARGET_PATH="$(env_or DIFF_TARGET_PATH "yadisk/First Principles Framework — Core Conceptual Specification (holonic).md")"
BASE_REF="$(env_or GITHUB_BASE_REF "$(env_or BASE_REF main)")"
AGENT_NAME="$(env_or AGENT_NAME diff-evaluator)"

# Pick warp binary
CLI_BIN="$(env_or WARP_AGENT_CLI)"
if [[ -z "$CLI_BIN" ]]; then
  if command -v warp-cli >/dev/null 2>&1; then CLI_BIN="warp-cli";
  elif command -v warp >/dev/null 2>&1; then CLI_BIN="warp";
  else echo "warp CLI not found; install warp-cli or set WARP_AGENT_CLI" >&2; exit 1; fi
fi

# Resolve base ref
candidates=("$BASE_REF" "origin/$BASE_REF" "origin/main" "HEAD~1")
base=""
for c in "${candidates[@]}"; do
  if git rev-parse --verify --quiet "$c" >/dev/null; then base="$c"; break; fi
done
[[ -n "$base" ]] || base="HEAD~1"

# Compute diff
if ! diff_text=$(git --no-pager diff --no-color --unified=5 "$base"...HEAD -- "$TARGET_PATH"); then
  diff_text=""
fi
if [[ -z "${diff_text//[[:space:]]/}" ]]; then
  echo "# Warp Diff Evaluation"
  echo
  echo "No changes detected in $TARGET_PATH."
  exit 0
fi

# Build prompt
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
template="$script_dir/diff-eval.prompt.md"
tmpdir=$(mktemp -d 2>/dev/null || mktemp -d -t warp-diff)
prompt_file="$tmpdir/prompt.txt"

{
  if [[ -f "$template" ]]; then cat "$template"; else
    cat <<'HDR'
You are an expert technical reviewer. Analyze the diff for the updated FPF document and provide actionable insights.
Return a concise report with:
- Summary of meaningful changes (structure, semantics, and terminology)
- Potential risks or regressions
- Recommended follow-ups (tests, validations, doc updates)
- Impact level: none | low | medium | high
HDR
  fi
  echo "File: $TARGET_PATH"
  echo
  echo "--- DIFF START ---"
  printf "%s" "$diff_text" | head -c 120000
  echo
  echo "--- DIFF END ---"
} > "$prompt_file"

# Run agent
if "$CLI_BIN" agents run --help >/dev/null 2>&1; then
  output="$($CLI_BIN agents run --agent "$AGENT_NAME" --input-file "$prompt_file")"
else
  output="$($CLI_BIN --agent "$AGENT_NAME" --input-file "$prompt_file")"
fi

# Report
{
  echo "<!-- warp-diff-eval -->"
  echo "# Warp Diff Evaluation"
  echo
  echo "Target: "
  echo "$TARGET_PATH"
  echo
  if [[ -n "${output//[[:space:]]/}" ]]; then echo "$output"; else echo "(No output produced by agent)"; fi
}
