# Developer Guide

This document is for contributors working on the code. For setup and usage aimed at systems/ops engineers, see the README.

## Overview

- Sync script: `scripts/yadisk-sync.mjs` (Bun runtime)
- Shared helpers: `scripts/yadisk-lib.ts`
- Workflows:
  - Sync: `.github/workflows/yadisk-sync.yml`
  - Tests: `.github/workflows/tests.yml`
- Downloaded artifacts live under `yadisk/` (committed via PRs only).

## Prerequisites

- Bun 1.2+ (`bun --version`)
- GitHub CLI (optional, for creating/rerunning PRs locally): `gh --version`

## Install & Test

No runtime deps are required; tests use Bun’s built-in test runner.

- Install (noop for now): `bun install`
- Run tests: `bun test`
  - CI also runs tests on every push/PR, and fails if any tests are focused or skipped (`.only`/`.skip`).

## Running the sync locally

Example (single file share):

```
bun scripts/yadisk-sync.mjs \
  --public-url "https://disk.yandex.ru/d/EXAMPLE" \
  --dest-path "yadisk" \
  --max-bytes 10485760 \
  --verbose true
```

Folder share options:

- `--public-path "/Folder/file.ext"` to point to a specific file path in the share
- or `--target-name "file.ext"` to pick a filename from the folder

Output control:

- `--dest-filename "desired-name.ext"` to override the saved filename

Safety:

- Filenames are sanitized to prevent traversal and invalid characters
- `--max-bytes` caps the file size (default 10MB) pre- and post-download

## GitHub Actions: configuration

Workflow: `.github/workflows/yadisk-sync.yml` (scheduled and manual dispatch).

- Repo settings → Actions → General → Workflow permissions:
  - “Read and write permissions”: enabled
  - “Allow GitHub Actions to create and approve pull requests”: enabled
- Repository Variables (Settings → Variables → Actions):
  - `YANDEX_PUBLIC_URL` (required): public share URL
  - `YANDEX_PUBLIC_PATH` (optional): path inside share if link points to a folder
  - `YANDEX_TARGET_NAME` (optional): filename to select from a folder share
  - `YANDEX_DEST_FILENAME` (optional): override saved filename
  - `YANDEX_MAX_BYTES` (optional): max size in bytes (default 10MB)

These map to env vars read by the script: `PUBLIC_URL`, `PUBLIC_PATH`, `TARGET_NAME`, `DEST_PATH`, `DEST_FILENAME`, `MAX_BYTES`.

## Security hardening (implemented)

- Filename sanitization and basename-only writes under `yadisk/`
- Size cap pre-/post-download to avoid large/zip-bomb files
- Actions pinned to commit SHAs (supply‑chain hardening)
- Concurrency group + timeout for the sync workflow
- `actions/checkout` with `persist-credentials: false` (token only used by PR step)

Potential future enhancements:

- Extension/content-type allowlist (e.g., only `.md`, `.txt`)
- Git LFS for `yadisk/**` if files are large/update frequently
- Add structured types for Yandex API responses in the library

## Code structure

- `scripts/yadisk-lib.ts` — helpers:
  - `sanitizeFilename()`: safe basename, strips invalid chars
  - `envArg()`: reads `--flag` or underscores env var fallback
  - `enforceSizeCap()`: throws if size exceeds cap
  - `fetchJson<T>()`: generic JSON fetch with error detail
- `scripts/yadisk-sync.mjs` — CLI wrapper around the helpers

## Contributing workflow

- Branch naming: `ci/...`, `feat/...`, `fix/...`
- Ensure `bun test` passes and no tests are focused/skipped
- Small, focused PRs preferred; include rationale in the description

## Troubleshooting

Operational issues (moved from README):

- No PR created:
  - Check Actions logs: Repo → Actions → last run of “Sync Yandex Disk to PR”.
  - Ensure workflow permissions are set to Read and write, and PR creation is allowed.
  - Validate variables: `YANDEX_PUBLIC_URL` must be a valid public link; if the link is to a folder, set `YANDEX_PUBLIC_PATH` or `YANDEX_TARGET_NAME`.
  - Re-run workflow: open the latest run → Re-run jobs.
- Wrong file in PR:
  - For folder links, set `YANDEX_PUBLIC_PATH` to the exact file path within the share, or set `YANDEX_TARGET_NAME` to pick by name.
  - Optionally set `YANDEX_DEST_FILENAME` to normalize the saved name.
- File too large error:
  - Increase `YANDEX_MAX_BYTES` in repo Variables, or reduce the source file’s size.
  - Default is 10 MB; both reported size and downloaded size are enforced.

Developer environment:

- IDE can’t find Bun: ensure Bun is on PATH; we avoid committing user‑specific paths. VS Code tasks are provided.
- Action schedule timing: GitHub schedules are best‑effort, not real‑time.

## Yandex API references (public share)

- Resource meta: `GET https://cloud-api.yandex.net/v1/disk/public/resources?public_key=...&path=...`
- Download link: `GET https://cloud-api.yandex.net/v1/disk/public/resources/download?public_key=...&path=...`
