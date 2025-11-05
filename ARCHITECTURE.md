# Architecture Overview

This document provides a high-level overview of how `fpf-sync` works. It's designed for newcomers who want to understand the system without diving into code.

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         fpf-sync                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌────────────────────┐        ┌────────────────────┐      │
│  │  Yandex Disk Sync  │        │    MCP Server      │      │
│  │                    │        │                    │      │
│  │  • Daily schedule  │        │  • stdio/HTTP      │      │
│  │  • Downloads files │        │  • FPF resources   │      │
│  │  • Creates PRs     │        │  • 60+ tools       │      │
│  └────────────────────┘        └────────────────────┘      │
│           │                              │                  │
│           ↓                              ↓                  │
│     yadisk/ folder                  data/ folder           │
│     (FPF spec .md)                  (epistemes.json)        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Component 1: Yandex Disk Sync

### Purpose
Keep files from Yandex Disk synchronized with this GitHub repository through automated Pull Requests.

### How it Works

```
1. Trigger (daily schedule or manual)
   ↓
2. GitHub Actions runs workflow
   ↓
3. Fetch file metadata from Yandex API
   ↓
4. Validate file (size, name)
   ↓
5. Download file to yadisk/ folder
   ↓
6. Git detects changes?
   ├─ Yes → Create/update PR
   └─ No  → Done
```

### Key Files
- `scripts/yadisk-sync.mjs` - Main sync script (CLI entry point)
- `scripts/yadisk-lib.ts` - Helper functions (sanitization, validation, API calls)
- `.github/workflows/yadisk-sync.yml` - GitHub Actions workflow

### Security Features
1. **Filename sanitization** - Prevents directory traversal attacks
2. **Size limits** - Default 10MB cap (configurable)
3. **Path validation** - Only writes to `yadisk/` folder
4. **Pre/post-download checks** - Validates file size before and after download

### Configuration
Set in GitHub repository variables:
- `YANDEX_PUBLIC_URL` - Yandex Disk share link
- `YANDEX_MAX_BYTES` - File size limit
- Additional options in [DEVELOPERS.md](DEVELOPERS.md)

## Component 2: MCP Server

### Purpose
Expose First Principles Framework (FPF) documents and epistemic data to AI tools and editors via the Model Context Protocol.

### How it Works

```
AI Tool (VS Code, Claude Desktop)
   │
   ↓ MCP Protocol
   │
MCP Server (scripts/mcp/server.ts)
   │
   ├─→ Resources (fpf://spec, fpf://epistemes/*)
   │
   └─→ Tools (fpf.list_epistemes, fpf.get_episteme, etc.)
        │
        ↓
   Data Layer (data/epistemes.json)
```

### Transport Options
1. **stdio** - For local editors (VS Code Continue)
   ```bash
   bun run mcp:fpf
   ```

2. **HTTP/SSE** - For remote clients (ChatGPT Desktop)
   ```bash
   bun run mcp:fpf:sse
   ```

### Key Files
- `scripts/mcp/server.ts` - Main MCP server (stdio transport)
- `scripts/mcp/server-sse.ts` - HTTP/SSE transport version
- `scripts/mcp/store.ts` - JSON data persistence
- `scripts/mcp/util.ts` - Path validation and file access
- `scripts/mcp/domain/` - FPF domain models and business logic
- `scripts/mcp/services/` - Service layer (trust scoring, capabilities, etc.)
- `scripts/mcp/storage/` - Storage adapters for different data types

### Available Resources
- `fpf://spec` - Main FPF specification document (markdown)
- `fpf://epistemes` - Complete registry of epistemic objects (JSON)
- `fpf://episteme/{id}` - Individual episteme by ID (JSON)

### Tool Categories (60+ tools total)
- **Core**: Version, ping, stats
- **Episteme Management**: List, get, search, create
- **Document Access**: List docs, read docs, extract topics
- **Domain Operations**: Trust scoring, service evaluation, capability checks
- **Advanced**: Gamma aggregation, Pareto frontiers, design rationale

## Data Flow

### Sync Flow
```
Yandex Disk (public share)
     ↓
  Yandex API
     ↓
yadisk-sync script
     ↓
yadisk/ folder (git working tree)
     ↓
Git commit + PR
     ↓
Main branch (after merge)
```

### MCP Flow
```
AI Editor/Tool
     ↓
MCP Protocol Request
     ↓
MCP Server (tool/resource handler)
     ↓
Validation (Zod schemas)
     ↓
Business Logic (services/)
     ↓
Data Access (storage/)
     ↓
JSON files (data/)
     ↓
MCP Protocol Response
     ↓
AI Editor/Tool
```

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Runtime** | Bun 1.3+ | Fast TypeScript runtime (replaces Node.js) |
| **Language** | TypeScript 5.6+ | Type safety and developer experience |
| **Protocol** | MCP SDK | Standardized AI tool communication |
| **Validation** | Zod | Runtime type checking for inputs |
| **Storage** | JSON files | Simple, version-controllable data |
| **CI/CD** | GitHub Actions | Automation and deployment |
| **Hosting** | Fly.io | MCP server hosting (optional) |

## Project Structure

```
fpf-sync/
├── scripts/
│   ├── yadisk-sync.mjs           # Sync CLI entry point
│   ├── yadisk-lib.ts             # Sync helper functions
│   ├── mcp/
│   │   ├── server.ts             # MCP server (stdio)
│   │   ├── server-sse.ts         # MCP server (HTTP/SSE)
│   │   ├── store.ts              # Data persistence layer
│   │   ├── util.ts               # Path validation & utilities
│   │   ├── domain/               # FPF domain models
│   │   │   ├── types.ts          # Core types (Service, Episteme, etc.)
│   │   │   ├── guards.ts         # Validation rules
│   │   │   └── ids.ts            # ID generation
│   │   ├── services/             # Business logic
│   │   │   ├── service.ts        # Service operations
│   │   │   ├── trust.ts          # Trust score computation
│   │   │   ├── capability.ts     # Capability management
│   │   │   ├── parity.ts         # Pareto analysis
│   │   │   └── gamma.ts          # Holon aggregation
│   │   └── storage/              # JSON storage adapters
│   │       ├── services.ts
│   │       ├── work.ts
│   │       └── ...
│   └── lib/
│       └── markdown-helpers.ts   # Markdown parsing utilities
├── .github/workflows/
│   ├── yadisk-sync.yml           # Daily sync workflow
│   ├── fpf-pattern-research.yml  # Pattern extraction
│   └── fly-deploy.yml            # Deployment automation
├── yadisk/                       # Synced files from Yandex
│   └── First Principles Framework....md
├── data/                         # MCP server data storage
│   └── epistemes.json
└── docs/
    ├── MCP.md                    # MCP setup guide
    └── research/
        └── fpf-pattern-journal.md
```

## Design Principles

### 1. Security First
- All filesystem access is validated against whitelisted directories
- Filenames are sanitized to prevent attacks
- Size limits prevent resource exhaustion
- Read-only mode by default for MCP server

### 2. Separation of Concerns
- **Domain layer** - Pure business logic and models
- **Service layer** - Business operations and workflows
- **Storage layer** - Data persistence (currently JSON files)
- **Transport layer** - MCP protocol implementation

### 3. Type Safety
- TypeScript strict mode enabled
- Zod validation at protocol boundaries
- Explicit type definitions for all data structures

### 4. Simplicity
- JSON file storage (no database setup required)
- Minimal dependencies (only MCP SDK and Zod)
- Clear file organization by function

### 5. Extensibility
- Storage layer can be swapped (JSON → SQL → Supabase)
- Services are modular and independent
- MCP tools can be added without changing infrastructure

## Common Workflows

### For Users
1. **Automatic sync** - Happens daily, creates PR automatically
2. **Review PR** - Check what changed in "Files changed" tab
3. **Merge PR** - Apply changes to main branch

### For Developers
1. **Local sync testing** - Run `yadisk-sync.mjs` with test parameters
2. **MCP server development** - Start server locally, connect with MCP client
3. **Add new tools** - Implement in `server.ts`, add business logic in `services/`
4. **Deploy changes** - Push to GitHub, automatic deployment via Actions

## Monitoring & Debugging

### GitHub Actions Logs
- Go to **Actions** tab
- Select workflow run
- View step-by-step logs

### MCP Server Logs
- Logs written to stderr (visible in terminal)
- JSON-formatted error messages
- Zod validation errors include detailed context

### Common Issues
- **PR not created** - Check Actions logs, verify permissions
- **File too large** - Check size limits in configuration
- **MCP connection failed** - Verify transport type matches client configuration

## Next Steps

- **For users**: See [README.md](README.md) for setup instructions
- **For developers**: See [DEVELOPERS.md](DEVELOPERS.md) for technical details
- **For contributors**: See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines
- **For MCP setup**: See [docs/MCP.md](docs/MCP.md) for client configuration
