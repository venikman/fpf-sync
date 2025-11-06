# Developer Guide

Complete guide for developers and contributors.

## Quick Commands

```bash
bun install                                      # Install
bun run typecheck                                # Type check
bun run yadisk:sync --public-url "URL" --verbose true  # Test sync
bun run mcp:fpf                                  # MCP stdio
bun run mcp:fpf:sse                              # MCP HTTP/SSE
```

**Prerequisites:** Bun 1.3+, Git, GitHub CLI (optional)

## Architecture Overview

**System:**
```text
fpf-sync
├── Yandex Disk Sync → downloads files → creates PR
└── MCP Server → exposes FPF to AI tools (60+ tools)
```

**Data flow:**
- Sync: Yandex Disk → API → script → yadisk/ → Git PR → main
- MCP: AI Tool → Protocol → Server → Validation → Storage → JSON

**Tech:** Bun (runtime), TypeScript (language), MCP SDK (protocol), Zod (validation), JSON (storage)

**Design:** Security first, separation of concerns, type safety, simplicity, extensibility

## CLI Options

### Sync Script
```bash
bun run yadisk:sync --public-url "URL" [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--public-url` | Yandex share URL (required) | - |
| `--public-path` | Path in folder share | - |
| `--target-name` | Pick file by name | - |
| `--dest-path` | Output directory | `yadisk` |
| `--max-bytes` | Size limit (bytes) | `10485760` |
| `--verbose` | Detailed logs | `false` |

### MCP Server
```bash
bun run mcp:fpf          # stdio (VS Code, Claude Desktop)
bun run mcp:fpf:sse      # HTTP/SSE (web clients)
```

**Env vars:** `PORT` (3333), `FPF_READONLY` (1), `FPF_DATA_DIR` (./data), `FPF_DOCS_DIR` (./yadisk)

**Security env vars:**
- `FPF_MAX_LOG_SIZE` - Max log file size before rotation (default: 100MB)
- `FPF_MAX_LOG_ROTATIONS` - Number of rotated logs to keep (default: 5)
- `FPF_RATE_LIMIT` - Max requests per minute per IP (default: 100)
- `FPF_MAX_BODY_SIZE` - Max request body size in bytes (default: 1MB)
- `FPF_ALLOWED_HOSTS` - Comma-separated list of allowed hosts (default: localhost,127.0.0.1)

## Database Management

### Backup Database

Create timestamped backups of the SQLite database:

```bash
# Basic backup
bun run scripts/backup-sqlite.ts

# Export to JSON and keep 5 most recent backups
bun run scripts/backup-sqlite.ts --json --keep=5

# Custom output directory
bun run scripts/backup-sqlite.ts --output=/mnt/backups
```

**Features:**
- Automatic backup rotation (keeps last N backups)
- SHA256 checksum verification
- Optional JSON export for human-readable format
- Database integrity validation

**Output:**
- `data/backups/fpf-backup-YYYY-MM-DDTHH-MM-SS.db` - Backup file
- `data/backups/fpf-backup-YYYY-MM-DDTHH-MM-SS.db.sha256` - Checksum
- `data/backups/fpf-backup-YYYY-MM-DDTHH-MM-SS/` - JSON exports (if `--json`)

## Continuous Integration

The project uses GitHub Actions for CI/CD with automated checks on all pull requests and pushes to main.

**Workflows:**
- `.github/workflows/ci.yml` - Type checking, build verification, security checks
- `.github/workflows/yadisk-sync.yml` - Automated Yandex Disk sync (daily)
- `.github/workflows/fpf-pattern-research.yml` - FPF pattern analysis
- `.github/workflows/fly-deploy.yml` - Deployment to Fly.io

**CI Checks:**
1. **Type Check** - Verifies TypeScript types with `bun run typecheck`
2. **Build Verification** - Ensures all scripts load without errors
3. **Lint & Format** - Code quality checks (currently stubbed, will fail gracefully)
4. **Security** - Scans for hardcoded secrets and suspicious patterns

**Running CI locally:**
```bash
# Type check (must pass)
bun run typecheck

# Verify scripts load
bun run --dry-run scripts/mcp/server.ts
bun run --dry-run scripts/backup-sqlite.ts

# Check individual file
bun run tsc --noEmit --skipLibCheck scripts/mcp/server.ts
```

**CI will fail if:**
- TypeScript type errors exist
- Scripts fail to load/parse
- Hardcoded secrets detected
- Any test job fails

## GitHub Actions Configuration

**Permissions:** Settings → Actions → Workflow permissions
- ✓ "Read and write permissions"
- ✓ "Allow GitHub Actions to create and approve pull requests"

**Variables:** Settings → Actions → Variables

| Variable | Required | Example |
|----------|----------|---------|
| `YANDEX_PUBLIC_URL` | Yes | `https://disk.yandex.ru/d/abc` |
| `YANDEX_PUBLIC_PATH` | No | `/Documents/file.md` |
| `YANDEX_TARGET_NAME` | No | `spec.md` |
| `YANDEX_MAX_BYTES` | No | `10485760` (10MB) |

## Key Files

**Sync:**
- `scripts/yadisk-sync.mjs` - Main CLI
- `scripts/yadisk-lib.ts` - Helpers (sanitization, validation, API)
- `.github/workflows/yadisk-sync.yml` - GitHub Actions

**MCP:**
- `scripts/mcp/server.ts` - Main server (stdio)
- `scripts/mcp/server-sse.ts` - HTTP/SSE transport
- `scripts/mcp/domain/` - Business logic
- `scripts/mcp/services/` - Service layer

## Troubleshooting

**No PR created?**
- Check Actions logs (Actions tab → latest "Sync Yandex Disk to PR" run)
- Verify workflow permissions enabled
- Validate `YANDEX_PUBLIC_URL` variable

**Wrong file?**
- Set `YANDEX_PUBLIC_PATH` (e.g., `/Documents/spec.md`)
- Or `YANDEX_TARGET_NAME` (e.g., `spec.md`)

**File too large?**
- Increase `YANDEX_MAX_BYTES` (default 10MB)

**MCP issues?**
- Check transport type matches client (stdio vs HTTP/SSE)
- Review server logs (stderr)

## API References

**Yandex Disk API:** https://cloud-api.yandex.net/v1/disk/public/resources
- Get metadata: `GET /resources?public_key={URL}`
- Get download: `GET /resources/download?public_key={URL}`

**MCP Docs:** https://modelcontextprotocol.io
- See [docs/MCP.md](docs/MCP.md) for fpf-sync specifics

## Contributing

### Setup
```bash
git clone https://github.com/YOUR_USERNAME/fpf-sync.git
cd fpf-sync
bun install
bun run typecheck
```

### Workflow
1. **Branch:** `git checkout -b feat/feature-name`
2. **Code:** Write clear code, add JSDoc, extract constants, follow patterns
3. **Test:** `bun run typecheck` + test locally
4. **Commit:** `git commit -m "feat: description"` (types: feat/fix/docs/refactor/test/ci)
5. **PR:** Push branch, open PR with description + testing details

### Guidelines
- **Small PRs:** One feature/fix per PR
- **Code style:** TypeScript strict, JSDoc for exports, named constants
- **Testing:** Type check + manual testing before PR
- **Be respectful:** Constructive feedback, assume good intentions

### Common Tasks
- **Add MCP tool:** Edit `scripts/mcp/server.ts`, use `mcp.tool()` pattern
- **Modify sync:** Edit `scripts/yadisk-lib.ts` (validation) or `scripts/yadisk-sync.mjs` (workflow)
- **Update docs:** README (users), DEVELOPERS (developers), docs/MCP.md (MCP details)

### Need Help?
- Unclear docs? → Open issue
- Stuck? → Open draft PR
- Feature idea? → Discuss in issue first
