# Developer Guide

Technical documentation for contributors working on fpf-sync code.

**For general contribution guidelines, see [CONTRIBUTING.md](CONTRIBUTING.md)**
**For architecture overview, see [ARCHITECTURE.md](ARCHITECTURE.md)**

## Quick Reference

| Task | Command |
|------|---------|
| Install dependencies | `bun install` |
| Type check | `bun run typecheck` |
| Run sync locally | `bun run yadisk:sync --public-url "URL" --verbose true` |
| Start MCP server (stdio) | `bun run mcp:fpf` |
| Start MCP server (HTTP/SSE) | `bun run mcp:fpf:sse` |

## Prerequisites

- **Bun 1.3+** - [Install Bun](https://bun.sh) (`bun --version` to check)
- **Git** - Version control
- **GitHub CLI** (optional) - For PR operations (`gh --version`)

## Project Components

### 1. Yandex Disk Sync
**Files:**
- `scripts/yadisk-sync.mjs` - Main sync CLI
- `scripts/yadisk-lib.ts` - Helper functions (sanitization, validation, API)
- `.github/workflows/yadisk-sync.yml` - GitHub Actions workflow

**Output:**
- Downloaded files → `yadisk/` folder (committed via PRs only)

### 2. MCP Server
**Files:**
- `scripts/mcp/server.ts` - Main server (stdio transport)
- `scripts/mcp/server-sse.ts` - HTTP/SSE transport
- `scripts/mcp/store.ts` - Data persistence
- `scripts/mcp/domain/` - Business logic and models
- `scripts/mcp/services/` - Service layer
- `scripts/mcp/storage/` - Storage adapters

**Data:**
- `data/epistemes.json` - Episteme registry

## Local Development

### Running Sync Locally

**Single file share:**
```bash
bun run yadisk:sync \
  --public-url "https://disk.yandex.ru/d/EXAMPLE" \
  --dest-path "yadisk" \
  --max-bytes 10485760 \
  --verbose true
```

**Folder share (specify file):**
```bash
# Option 1: By path within the share
bun run yadisk:sync \
  --public-url "https://disk.yandex.ru/d/FOLDER" \
  --public-path "/Folder/file.ext"

# Option 2: By filename
bun run yadisk:sync \
  --public-url "https://disk.yandex.ru/d/FOLDER" \
  --target-name "file.ext"
```

**CLI Options:**
| Option | Description | Default |
|--------|-------------|---------|
| `--public-url` | Yandex Disk public share URL (required) | - |
| `--public-path` | Path within folder share | - |
| `--target-name` | Filename to select from folder | - |
| `--dest-path` | Output directory | `yadisk` |
| `--dest-filename` | Override saved filename | Original name |
| `--max-bytes` | File size limit in bytes | `10485760` (10MB) |
| `--verbose` | Detailed logging | `false` |

### Running MCP Server

**Stdio transport (for VS Code, Claude Desktop):**
```bash
bun run mcp:fpf
```

**HTTP/SSE transport (for web clients):**
```bash
PORT=3333 bun run mcp:fpf:sse
```

**Environment variables:**
- `PORT` - HTTP server port (default: 3333)
- `FPF_READONLY` - Disable write operations (default: 1)
- `FPF_DATA_DIR` - Data directory (default: `./data`)
- `FPF_DOCS_DIR` - Documents directory (default: `./yadisk`)

## GitHub Actions Configuration

### Workflows
1. **yadisk-sync.yml** - Daily sync at 20:00 MSK + manual dispatch
2. **fpf-pattern-research.yml** - Pattern extraction from FPF spec
3. **fly-deploy.yml** - Deployment to Fly.io

### Required Permissions
**Settings → Actions → General → Workflow permissions:**
- ✓ "Read and write permissions"
- ✓ "Allow GitHub Actions to create and approve pull requests"

### Repository Variables
**Settings → Secrets and variables → Actions → Variables:**

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `YANDEX_PUBLIC_URL` | Yes | Public share URL | `https://disk.yandex.ru/d/abc123` |
| `YANDEX_PUBLIC_PATH` | No | Path within folder share | `/Documents/file.md` |
| `YANDEX_TARGET_NAME` | No | Filename to pick from folder | `spec.md` |
| `YANDEX_DEST_FILENAME` | No | Override saved filename | `custom-name.md` |
| `YANDEX_MAX_BYTES` | No | Max file size in bytes | `10485760` (default) |

**Variable to environment mapping:**
- `YANDEX_PUBLIC_URL` → `PUBLIC_URL`
- `YANDEX_PUBLIC_PATH` → `PUBLIC_PATH`
- `YANDEX_TARGET_NAME` → `TARGET_NAME`
- `YANDEX_MAX_BYTES` → `MAX_BYTES`

## Security Features

### Implemented
- ✅ Filename sanitization (prevents directory traversal)
- ✅ Basename-only writes (restricted to `yadisk/` folder)
- ✅ Size limits pre/post-download (prevents zip bombs)
- ✅ GitHub Actions pinned to commit SHAs
- ✅ Concurrency control for workflows
- ✅ `persist-credentials: false` in checkout
- ✅ Path validation for MCP file access
- ✅ Read-only mode by default for MCP server

### Future Enhancements
- File extension/content-type allowlist (`.md`, `.txt` only)
- Git LFS for large files in `yadisk/`
- Structured TypeScript types for Yandex API responses
- Rate limiting for MCP tools

## Code Organization

### Markdown Utilities
**File:** `scripts/lib/markdown-helpers.ts`

Provides utilities for markdown processing:
- `extractHeadings()` - Parse headings with levels
- `extractTopics()` - Smart topic extraction with stop words
- `extractSection()` - Get content between headings
- `MarkdownBuilder` - Programmatic markdown generation

**Example:**
```typescript
import { extractHeadings, MarkdownBuilder } from './lib/markdown-helpers.ts';

const headings = extractHeadings(markdown);
// [{ level: 1, text: "Title", raw: "# Title" }, ...]

const doc = new MarkdownBuilder()
  .heading(1, "Report")
  .paragraph("Introduction")
  .bulletList(["Item 1", "Item 2"])
  .build();
```

**Design Decision:** Uses regex patterns instead of external libraries to keep dependencies minimal and maintain simplicity.

## Key Functions Reference

### yadisk-lib.ts
| Function | Purpose |
|----------|---------|
| `sanitizeFilename(name)` | Strips directory paths and invalid characters |
| `envArg(argv, env, name, default)` | Gets config from CLI args or env vars |
| `enforceSizeCap(args)` | Validates file size limits |
| `fetchJson<T>(url, opts)` | Fetches and parses JSON with error handling |

### markdown-helpers.ts
| Function | Purpose |
|----------|---------|
| `extractHeadings(markdown)` | Parses markdown headings with levels |
| `extractTopics(text, options)` | Extracts key topics with stop word filtering |
| `extractSection(markdown, heading)` | Gets content between headings |
| `MarkdownBuilder` | Programmatic markdown document generation |

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines and workflow.

## Troubleshooting

### No PR Created
**Possible causes:**
1. No changes detected (file unchanged)
2. Workflow permissions not enabled
3. Invalid Yandex URL or configuration

**Steps to debug:**
1. Check **Actions** → Select latest "Sync Yandex Disk to PR" run
2. Review logs for errors
3. Verify workflow permissions (see GitHub Actions Configuration above)
4. Validate repository variables
5. Try **Re-run jobs** from the Actions tab

### Wrong File Downloaded
**Solution:**
- For folder shares, specify the file:
  - Set `YANDEX_PUBLIC_PATH` to exact path (e.g., `/Documents/spec.md`)
  - OR set `YANDEX_TARGET_NAME` to filename (e.g., `spec.md`)
- Use `YANDEX_DEST_FILENAME` to override saved filename

### File Too Large Error
**Solution:**
- Increase `YANDEX_MAX_BYTES` in repository variables
- Or reduce source file size
- Default limit: 10MB (enforced pre and post-download)

### MCP Connection Issues
**Check:**
1. Correct transport type (stdio vs HTTP/SSE)
2. Server logs for errors (stderr output)
3. Client configuration matches server transport
4. Firewall/port settings (for HTTP/SSE)

### Development Environment
- **Bun not found:** Ensure Bun is in PATH (`which bun`)
- **Type errors:** Run `bun run typecheck` for details
- **Schedule delays:** GitHub Actions schedules are best-effort, may be delayed

## API References

### Yandex Disk Public API
**Base URL:** `https://cloud-api.yandex.net/v1/disk/public/resources`

**Get metadata:**
```
GET /resources?public_key={URL}&path={PATH}
```

**Get download URL:**
```
GET /resources/download?public_key={URL}&path={PATH}
```

**Response:** JSON with `href` field containing download URL

**Documentation:** [Yandex Disk API](https://yandex.com/dev/disk/api/reference/public)

### Model Context Protocol (MCP)
**Documentation:** [MCP Specification](https://modelcontextprotocol.io)

**Transports:**
- stdio - Local editors (VS Code, Claude Desktop)
- HTTP/SSE - Remote clients (web apps)

**See:** [docs/MCP.md](docs/MCP.md) for fpf-sync MCP server details
