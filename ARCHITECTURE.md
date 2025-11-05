# Architecture Overview

High-level view of how fpf-sync works.

## System Components

```
fpf-sync
├── Yandex Disk Sync    (daily schedule → downloads → creates PR)
└── MCP Server          (stdio/HTTP → FPF resources → 60+ tools)
         │                       │
         ↓                       ↓
    yadisk/ folder          data/ folder
```

## Component 1: Yandex Disk Sync

**Purpose:** Auto-sync files from Yandex Disk to GitHub via PRs

**Flow:**
1. Trigger (daily/manual) → GitHub Actions
2. Fetch metadata from Yandex API
3. Validate (size, filename)
4. Download to `yadisk/`
5. Create PR if changes detected

**Security:** Filename sanitization, size limits (10MB default), path validation, pre/post-download checks

**Config:** GitHub repo variables (`YANDEX_PUBLIC_URL`, `YANDEX_MAX_BYTES`, etc.)

## Component 2: MCP Server

**Purpose:** Expose FPF docs and epistemic data to AI tools via MCP

**Flow:**
```
AI Tool → MCP Protocol → MCP Server → Resources/Tools → Data Layer
```

**Transports:**
- stdio: `bun run mcp:fpf` (VS Code, Claude Desktop)
- HTTP/SSE: `bun run mcp:fpf:sse` (web clients)

**Resources:** `fpf://spec`, `fpf://epistemes`, `fpf://episteme/{id}`

**Tools (60+):** Core, episteme management, document access, domain operations, advanced analysis

## Data Flow

**Sync:** Yandex Disk → Yandex API → sync script → yadisk/ → Git PR → main branch

**MCP:** AI Tool → MCP Request → Server → Validation → Business Logic → Storage → JSON → Response

## Tech Stack

| Layer | Tech | Purpose |
|-------|------|---------|
| Runtime | Bun 1.3+ | Fast TypeScript runtime |
| Language | TypeScript 5.6+ | Type safety |
| Protocol | MCP SDK | AI tool communication |
| Validation | Zod | Runtime type checking |
| Storage | JSON files | Version-controllable data |
| CI/CD | GitHub Actions | Automation |

## Project Structure

```
scripts/
├── yadisk-sync.mjs         # Sync CLI
├── yadisk-lib.ts           # Helpers
├── mcp/
│   ├── server.ts           # MCP stdio
│   ├── server-sse.ts       # MCP HTTP/SSE
│   ├── domain/             # Business logic
│   ├── services/           # Service layer
│   └── storage/            # JSON adapters
└── lib/
    └── markdown-helpers.ts # Markdown utils

.github/workflows/          # CI/CD automation
yadisk/                     # Synced files
data/                       # MCP data (epistemes.json)
```

## Design Principles

1. **Security First** - Whitelist paths, sanitize filenames, size limits, read-only default
2. **Separation of Concerns** - Domain → Service → Storage → Transport layers
3. **Type Safety** - TypeScript strict mode, Zod validation at boundaries
4. **Simplicity** - JSON storage, minimal deps (MCP SDK + Zod)
5. **Extensibility** - Modular services, swappable storage layer

## Debugging

**Actions logs:** Actions tab → Select workflow → View logs
**MCP logs:** stderr output, JSON errors, Zod validation details
**Common issues:** See [DEVELOPERS.md](DEVELOPERS.md#troubleshooting)

---

**Next:** [README](README.md) (setup) • [DEVELOPERS](DEVELOPERS.md) (technical) • [CONTRIBUTING](CONTRIBUTING.md) (workflow) • [MCP docs](docs/MCP.md) (MCP setup)
