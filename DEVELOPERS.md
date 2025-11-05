# Developer Guide

**See also:** [CONTRIBUTING.md](CONTRIBUTING.md) (workflow) • [ARCHITECTURE.md](ARCHITECTURE.md) (system design)

## Quick Commands

```bash
bun install                                      # Install
bun run typecheck                                # Type check
bun run yadisk:sync --public-url "URL" --verbose true  # Test sync
bun run mcp:fpf                                  # MCP stdio
bun run mcp:fpf:sse                              # MCP HTTP/SSE
```

**Prerequisites:** Bun 1.3+, Git, GitHub CLI (optional)

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
