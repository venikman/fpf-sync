# Developer Guide

This document is for contributors working on the code. For setup and usage aimed at systems/ops engineers, see the README.

## Overview

- Sync script: `scripts/yadisk-sync.mjs` (Bun runtime)
- Shared helpers: `scripts/yadisk-lib.ts`
- Workflow: `.github/workflows/yadisk-sync.yml`
- Downloaded artifacts live under `yadisk/` (committed via PRs only).

## Prerequisites

- Bun 1.3+ (`bun --version`)
- GitHub CLI (optional, for creating/rerunning PRs locally): `gh --version`

## Install

No runtime dependencies are required for the core sync functionality.

- Install dependencies: `bun install`

Note: previously, additional agentic scripts (research, memetics) existed but have been removed. Any AI research functionality and related dependencies are no longer used in this repo.

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

The project includes these workflows:

1. **Sync workflow**: `.github/workflows/yadisk-sync.yml` (scheduled daily at 20:00 MSK and manual dispatch)
   - Syncs files from Yandex Disk to the repository via Pull Requests

- Repo settings → Actions → General → Workflow permissions:
  - "Read and write permissions": enabled
  - "Allow GitHub Actions to create and approve pull requests": enabled

### Sync Workflow Variables

Repository Variables (Settings → Variables → Actions):

- `YANDEX_PUBLIC_URL` (required): public share URL
- `YANDEX_PUBLIC_PATH` (optional): path inside share if link points to a folder
- `YANDEX_TARGET_NAME` (optional): filename to select from a folder share
- `YANDEX_DEST_FILENAME` (optional): override saved filename
- `YANDEX_MAX_BYTES` (optional): max size in bytes (default 10MB)

These map to env vars read by the script: `PUBLIC_URL`, `PUBLIC_PATH`, `TARGET_NAME`, `DEST_PATH`, `DEST_FILENAME`, `MAX_BYTES`.

### Industry Research Workflow

Removed. Historical references to AI-generated reports have been retired along with the agentic scripts.

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

## Improved markdown handling

The project now includes a dedicated `scripts/lib/markdown-helpers.ts` module with improved regex patterns and utilities for markdown processing.

### Key improvements implemented

1. **Better regex patterns with clear documentation**
   - Each pattern has comments explaining its purpose
   - Handles edge cases like trailing spaces and special characters
   - Patterns are organized in a single `MarkdownPatterns` object

2. **Dedicated helper functions**
   - `extractHeadings()` - Extract headings with level and text
   - `extractTopics()` - Smart topic extraction with stop words
   - `extractSection()` - Get content between headings
   - `validateResearchReport()` - Structured validation for reports
   - `formatDateUTC()` - Date formatting without regex replacement
   - `parseGitRef()` - Parse git references without regex replacement

3. **MarkdownBuilder class**
   - Programmatic markdown generation
   - Type-safe and maintainable
   - Avoids string concatenation errors

### Example usage

```typescript
import {
  extractHeadings,
  extractTopics,
  validateResearchReport,
  MarkdownBuilder,
  formatDateUTC,
} from "../lib/markdown-helpers.ts";

// Extract headings from markdown
const headings = extractHeadings(markdown);
// Returns: [{ level: 1, text: "Title", raw: "# Title" }, ...]

// Extract topics with smart filtering
const topics = extractTopics(text, {
  maxTopics: 8,
  minWordLength: 4,
  includeCompounds: true,
});

// Validate report structure
const validation = validateResearchReport(markdown);
if (!validation.valid) {
  console.error("Validation errors:", validation.errors);
}

// Build markdown programmatically
const builder = new MarkdownBuilder();
const report = builder
  .heading(1, "Report Title")
  .paragraph("Introduction text")
  .bulletList(["Item 1", "Item 2"])
  .build();
```

### Why not external libraries?

After evaluation, we decided to keep the implementation lightweight:

1. **No React dependencies needed** - The project is a CLI tool, not a UI application
2. **Regex patterns work well** - For well-defined patterns like markdown headings
3. **Maintainability over complexity** - Simple, documented patterns are easier to maintain
4. **No unnecessary dependencies** - Keeps the project lean and fast

The improved regex patterns in `markdown-helpers.ts` provide:

- Better edge case handling
- Clear documentation
- Centralized pattern management
- Type-safe interfaces
- Separation of concerns

This approach balances simplicity with functionality, avoiding over-engineering while still improving code quality.

## Code structure

- `scripts/yadisk-lib.ts` — helpers:
  - `sanitizeFilename()`: safe basename, strips invalid chars
  - `envArg()`: reads `--flag` or underscores env var fallback
  - `enforceSizeCap()`: throws if size exceeds cap
  - `fetchJson<T>()`: generic JSON fetch with error detail
- `scripts/yadisk-sync.mjs` — CLI wrapper around the helpers
- `scripts/lib/markdown-helpers.ts` — improved markdown utilities:
  - `MarkdownPatterns`: Well-documented regex patterns for markdown parsing
  - `extractHeadings()`, `extractTopics()`, `extractSection()`: Content extraction
  - `validateResearchReport()`: Structured validation for AI reports
  - `MarkdownBuilder`: Programmatic markdown generation
  - `formatDateUTC()`, `parseGitRef()`: String formatting without regex replacement
// (Agentic scripts removed.)

## Contributing workflow

- Branch naming: `ci/...`, `feat/...`, `fix/...`
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

- IDE can’t find Bun: ensure Bun is on PATH; we avoid committing user‑specific paths.
- Action schedule timing: GitHub schedules are best‑effort, not real‑time.

## Yandex API references (public share)

- Resource meta: `GET https://cloud-api.yandex.net/v1/disk/public/resources?public_key=...&path=...`
- Download link: `GET https://cloud-api.yandex.net/v1/disk/public/resources/download?public_key=...&path=...`
