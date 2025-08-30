# fpf-sync - Yandex Disk to GitHub PR Sync Tool

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

## Working Effectively

### Install and Setup
- Install Bun runtime: `curl -fsSL https://bun.sh/install | bash && source ~/.bashrc`
- Verify Bun version: `bun --version` (requires 1.2+ - tested with 1.2.21)
- Install dependencies: `bun install` -- takes 1-2 seconds
- ALWAYS run setup commands in this exact order before any other work

### Build and Test Commands
- Type checking: `bun run typecheck` -- takes <1 second using tsc --noEmit
- Linting: `bun run lint` -- takes ~2ms using oxlint, extremely fast
- Fix linting issues: `bun run lint:fix` -- auto-fixes code style issues
- Run tests: `bun test` -- takes 10ms, runs 10 unit tests covering helper functions
- NEVER CANCEL any of these commands - they are all very fast (under 5 seconds)

### Running the Application
- Basic entry point: `bun run start` -- runs index.ts, outputs "Hello via Bun!"
- Main sync functionality: `bun scripts/yadisk-sync.mjs --public-url [URL]`
  - Requires --public-url parameter or PUBLIC_URL environment variable
  - Use --verbose true for detailed logging during development
  - Downloads files to yadisk/ directory by default
  - Set timeout to 5+ minutes for network operations

## Validation

### CRITICAL: Manual Testing Requirements
- ALWAYS test the sync script after making changes to scripts/yadisk-sync.mjs or scripts/yadisk-lib.ts
- Test command: `bun scripts/yadisk-sync.mjs --public-url [valid_yandex_url] --verbose true`
- Verify downloaded files appear in yadisk/ directory with correct names and content
- ALWAYS run `bun test` to ensure all unit tests pass (10 tests in <10ms)
- NEVER CANCEL the test suite - it completes almost instantly

### Validation Scenarios After Changes
- Test filename sanitization by downloading files with special characters
- Test size cap enforcement with --max-bytes parameter
- Test both file and folder share URLs if modifying URL handling logic
- Verify error handling for invalid URLs or network failures
- Always validate that CLI argument parsing works with both flags and environment variables

### Pre-commit Requirements
- ALWAYS run `bun run lint` before committing - CI will fail if linting errors exist
- ALWAYS run `bun test` and ensure all 10 tests pass
- ALWAYS run `bun run typecheck` to catch TypeScript errors
- Check for focused/skipped tests: `grep -RInE "^\s*(it|describe|test)\.(only|skip)\s*\(" tests/` (should return nothing)

## Code Structure and Navigation

### Key Files
- `scripts/yadisk-sync.mjs` — Main CLI script, uses Bun runtime for file downloads
- `scripts/yadisk-lib.ts` — Helper functions:
  - `sanitizeFilename()` — Cleans filenames, strips paths, replaces illegal chars
  - `envArg()` — Reads CLI flags (--flag) or environment variables (UNDERSCORE_FORMAT)
  - `enforceSizeCap()` — Throws error if file size exceeds limit
  - `fetchJson<T>()` — Generic JSON fetch with detailed error reporting
- `tests/yadisk-lib.test.ts` — Unit tests for all helper functions (10 tests)
- `.github/workflows/yadisk-sync.yml` — Scheduled sync workflow (every 30 min)
- `.github/workflows/ci-tests.yml` — CI testing on push/PR

### Key Directories
- `scripts/` — Core application logic
- `tests/` — Unit test suite using Bun's built-in test runner  
- `yadisk/` — Downloaded files are stored here (committed via PRs only)
- `.github/workflows/` — GitHub Actions automation

### Dependencies and Configuration
- `package.json` — Project config, uses Bun package manager
- `tsconfig.json` — TypeScript config with strict settings, excludes yadisk/
- `bun.lock` — Dependency lockfile for reproducible builds
- No external runtime dependencies - only dev dependencies (oxlint, typescript, bun-types)

## Environment Variables and Configuration

### GitHub Actions Variables (Repository Settings → Variables → Actions)
- `YANDEX_PUBLIC_URL` (required) — Public share URL from Yandex Disk
- `YANDEX_PUBLIC_PATH` (optional) — Path within share if link points to folder
- `YANDEX_TARGET_NAME` (optional) — Filename to select from folder share
- `YANDEX_DEST_FILENAME` (optional) — Override saved filename
- `YANDEX_MAX_BYTES` (optional) — Max file size in bytes (default 10MB)

### Local Development Environment Variables
- Map to CLI flags: --public-url, --public-path, --target-name, --dest-filename, --max-bytes
- Environment variables use UNDERSCORE_FORMAT: PUBLIC_URL, PUBLIC_PATH, TARGET_NAME, etc.

## Common Tasks and Expected Timing

### Repository Root Contents
```
.github/         — GitHub Actions workflows and configurations
.vscode/         — VS Code workspace settings
scripts/         — Main application code (yadisk-sync.mjs, yadisk-lib.ts)
tests/           — Unit test suite (yadisk-lib.test.ts)
yadisk/          — Downloaded files directory (git-tracked)
DEVELOPERS.md    — Detailed developer documentation
README.md        — User-focused setup and usage guide
package.json     — Project configuration and npm scripts
tsconfig.json    — TypeScript compiler configuration
bun.lock         — Dependency lockfile
index.ts         — Basic entry point (outputs "Hello via Bun!")
```

### Frequently Used Commands with Timing
- `bun install` — 1-2 seconds
- `bun run typecheck` — <1 second
- `bun run lint` — 2-10ms (extremely fast)
- `bun test` — 10ms for full suite (10 tests)
- `bun scripts/yadisk-sync.mjs --public-url [URL]` — 5-30 seconds depending on file size

### Troubleshooting Common Issues
- "bun: command not found" — Run `source ~/.bashrc` or restart terminal after install
- Sync script fails — Check network connectivity and URL validity
- Tests fail — Ensure no .only/.skip markers in test files
- TypeScript errors — Run `bun run typecheck` for detailed error messages
- Linting failures — Run `bun run lint:fix` to auto-fix style issues

### GitHub Actions Workflow Timing
- CI Tests workflow — Completes in ~1-2 minutes (setup + fast tests)
- Sync workflow — Runs every 30 minutes, takes 2-5 minutes depending on file size
- NEVER CANCEL GitHub Actions - they complete quickly and canceling disrupts automation

## Security and Best Practices

### Implemented Security Features
- Filename sanitization prevents directory traversal attacks
- Size caps prevent large file/zip bomb downloads  
- Actions pinned to commit SHAs for supply-chain security
- Checkout with persist-credentials: false limits token exposure
- Concurrency groups prevent multiple sync jobs running simultaneously

### Development Best Practices
- Use branch naming: ci/, feat/, fix/ prefixes
- Keep PRs small and focused with clear rationale
- Always test both success and error scenarios
- Validate all CLI flags and environment variable combinations
- Test with both file and folder Yandex Disk shares

### When Making Changes
- ALWAYS validate changes work with real Yandex Disk URLs before committing
- Run full test suite and verify no tests are focused/skipped
- Ensure linting passes without warnings
- Test error conditions (invalid URLs, size limits, network failures)
- Verify GitHub Actions workflows still function correctly