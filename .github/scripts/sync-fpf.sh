#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
upstream_dir="$tmp_dir/FPF"

cleanup() {
  rm -rf "$tmp_dir"
}

trap cleanup EXIT

git clone --depth 1 https://github.com/ailev/FPF.git "$upstream_dir" >/dev/null 2>&1
upstream_sha="$(git -C "$upstream_dir" rev-parse HEAD)"

rm -rf "$upstream_dir/.git"
rm -rf "$repo_root/FPF"
mkdir -p "$repo_root/FPF"
cp -a "$upstream_dir/." "$repo_root/FPF/"

printf '%s\n' "$upstream_sha"
