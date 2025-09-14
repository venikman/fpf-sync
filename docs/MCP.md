# FPF MCP Server

Status: MVP (stdio) under Bun + TypeScript

What this provides
- A local MCP server exposing FPF artifacts and docs to desktop tools that support MCP (e.g., VS Code Continue).
- Read-only FPF spec access from the repo (yadisk/… file)
- Episteme registry with CRUD operations persisted to JSON (no DB yet)
- Topic extraction from FPF markdown headings (no LLM)

Why MCP here
- Lets tools like editors and assistants fetch your latest FPF spec and structured data without copy/paste.
- Keeps the source of truth in-repo; clients connect on-demand.

Requirements
- Bun >= 1.2.3
- Node-style ESM (already configured in this repo)

Install deps
- bun install

Run
- bun run scripts/mcp/server.ts
  - Or via npm script: bun run mcp:fpf

Security model
- This server runs over stdio (no TCP port).
- File access is strictly limited to:
  - repo root for JSON store under data/
  - FPF documents under the whitelisted directory: yadisk/
- Any path passed by tools is resolved and validated to stay within those directories.
- No external network or LLM calls in this MVP.

Capabilities (MVP)
- Resources
  - fpf:spec — returns the main FPF spec markdown from yadisk (text/markdown)
  - fpf:epistemes — returns the episteme list (application/json)
  - fpf:episteme/{id} — returns one episteme (application/json)
- Tools
  - fpf.list_epistemes()
  - fpf.get_episteme({ id })
  - fpf.list_fpf_docs()
  - fpf.read_fpf_doc({ path })
  - fpf.extract_topics_from_fpf({ path?, maxTopics? })
  - fpf.search_epistemes({ text })
  - fpf.find_episteme_by_symbol({ symbol })
  - fpf.export_epistemes()
  - fpf.stats()
  - fpf.search_fpf_docs({ text })
  - fpf.list_headings({ path, depthMax? })
  - fpf.version()
  - fpf.ping()
  - fpf.search_tags({ text? })
  - fpf.list_tags()
  - fpf.list_doc_refs({ id })
- Prompts (optional; may not show in all clients)
  - fpf/episteme-template
  - fpf/adi-cycle

Data persistence
- data/epistemes.json (created on first run, atomic writes)
- Schema (Episteme):
  - id: string
  - object: string
  - concept: string
  - symbol: string
  - targets?: { F?: number; R?: number; G?: number; CL?: number }
  - createdAt: ISO string
  - updatedAt: ISO string

VS Code (Continue) wiring
- Example User settings.json:
  {
    "continue.mcpServers": [
      {
        "id": "fpf",
        "name": "FPF MCP",
        "command": "bun",
        "args": ["run", "scripts/mcp/server.ts"],
        "cwd": "${workspaceFolder}"
      }
    ]
  }
- Then in Continue, ensure the server appears; try tools like fpf.list_epistemes or resources like fpf:spec.

Other clients
- ChatGPT (Desktop): You can connect via SSE to a local URL.
  - Start the SSE server: `bun run mcp:fpf:sse` (listens on http://127.0.0.1:3333/sse)
    - Read-only mode is default. To enable write tools locally, run: `FPF_READONLY=0 bun run mcp:fpf:sse`
  - In ChatGPT → Settings → Developer → New Connector:
    - Name: FPF MCP
    - MCP Server URL: http://127.0.0.1:3333/sse
    - Authentication: None
    - Trust: checked
  - Then: list resources, read fpf://spec, run tools like fpf.list_epistemes
- Commet browser app: similar status; pending official MCP/bridge support.
- Warp: document steps if/when Warp exposes an MCP bridge; currently this doc focuses on Continue.

Extensibility
- Metrics/evaluation hooks (F/R/G/CL) are planned but disabled here.
- A future SQLite adapter can replace the JSON store without changing tool contracts.

Troubleshooting
- If the server starts then exits, check for syntax errors or missing deps (bun install).
- If fpf:spec is missing, ensure the main spec file exists at: yadisk/First Principles Framework — Core Conceptual Specification (holonic).md
- If a client cannot connect, verify it supports MCP stdio and the command path is correct.
