# FPF MCP Server

Status: Bun 1.3 (stdio/SSE) + TypeScript (server v0.2.0)

What this provides
- A local MCP server exposing FPF artifacts and docs to desktop tools that support MCP (e.g., VS Code Continue).
- Read-only FPF spec access from the repo (yadisk/… file)
- Episteme registry with CRUD operations persisted to JSON (no DB yet)
- Topic extraction from FPF markdown headings (no LLM)

Why MCP here
- Lets tools like editors and assistants fetch your latest FPF spec and structured data without copy/paste.
- Keeps the source of truth in-repo; clients connect on-demand.

Requirements
- Bun 1.3.x

Install deps
- `bun install`

Run
- Stdio MCP server: `bun run scripts/mcp/server.ts`
- SSE MCP server: `PORT=3333 bun run scripts/mcp/server-sse.ts`

Environment overrides
- `FPF_DATA_DIR`: change where JSON stores are written (defaults to `<repo>/data`).
- `FPF_DOCS_DIR`: override the whitelisted FPF document directory (defaults to `<repo>/yadisk`, must stay within the repo root).

Security model and policies
- The stdio server runs over stdio (no TCP port). SSE server listens on configurable port.
- File access is strictly limited to:
  - repo root for JSON store under data/
  - FPF documents under the whitelisted directory: yadisk/
- Any path passed by tools is resolved and validated to stay within those directories.
- Read-only by default. Set FPF_READONLY=0 to enable mutations.
- No external network or LLM calls in this iteration.
- Guards enforce: RSG.NOT_ENACTABLE, WIN.INVALID, ELIG.VIOLATION, SOD.CONFLICT, BRIDGE.CL_TOO_LOW, CG.MIXED_SCALE, Γ.MISTYPED.

Capabilities (v0.2.0)
- Resources
  - fpf:spec — returns the main FPF spec markdown from yadisk (text/markdown)
  - fpf:epistemes — returns the episteme list (application/json)
  - fpf:episteme/{id} — returns one episteme (application/json)
- Tools
  - fpf.version()
  - fpf.ping()
  - fpf.stats()
  - fpf.list_epistemes()
  - fpf.get_episteme({ id })
  - fpf.search_epistemes({ text })
  - fpf.find_episteme_by_symbol({ symbol })
  - fpf.export_epistemes()
  - fpf.list_fpf_docs()
  - fpf.read_fpf_doc({ path })
  - fpf.extract_topics_from_fpf({ path?, maxTopics? })
  - fpf.search_fpf_docs({ text })
  - fpf.list_headings({ path, depthMax? })
  - fpf.search_tags({ text? })
  - fpf.list_tags()
  - fpf.list_doc_refs({ id })
  - fpf.context.upsert({ name, edition, glossary?, invariants?, roles? }) → { ctx }
  - fpf.bridge.upsert({ from:{role|kind|plane,ctx}, to:{…}, CL, lossNotes[] }) → { bridge }
  - fpf.role.upsert({ ctx, role, rcs, rsg, algebra }) → { role }
  - fpf.role.assign({ holder, role, ctx, window }) → { ra }
  - fpf.role.state.assert({ ra, state, checklistEvidence[], at }) → { assertionId }
  - fpf.method.register({ ctx, md, io?, steps[], references[] }) → { md }
  - fpf.work.start({ md, stepId, performedBy:ra, at }) → { work }
  - fpf.work.end({ work, outcome, observations?, resources?, links? }) → { work }
  - fpf.work.link.evidence({ work, episteme, evidenceRole, ctx }) → { linkId }
  - fpf.capability.declare({ holder:'system', ctx, taskFamily, workScope?, measures?, qualWindow?, id? }) → { capabilityId }
  - fpf.capability.check({ holder, step:{md,stepId,jobSlice?,thresholds?}, at }) → { admissible, why[] }
  - fpf.service.define({ ctx, name, providerRole, consumerRole?, claimScope, accessSpec?, acceptanceSpec, unit?, version }) → { svc }
  - fpf.service.evaluate({ svc, window, kpis:[uptime|leadTime|rejectRate|costToServe], gammaTimePolicy? }) → { metrics }
  - fpf.nqd.generate({ ctx, descriptorMapRef, distanceDefRef, objectives:{N,U,C}, archive?, S?, policy }) → { portfolio, illumination, pins }
  - fpf.ee.policy.set({ policyId, explore_share, dominance, scaleProbe? }) → { policy }
  - fpf.parity.run({ candidates, ctx, isoScale?, pins?, metrics?, referencePlane? }) → { report, pareto }
  - fpf.trust.score({ claim, evidence[], bridges?, formalityF, scopeG, reliabilityR? }) → { F,G,R, notes[] }
  - fpf.gamma.aggregate({ ctx, holons[], fold, gammaTimePolicy? }) → { whole, invariants }
  - fpf.uts.publish({ ctx, rows[] }) → { utsId }
  - fpf.drr.record({ change, context, rationale, alternatives?, consequences?, refs? }) → { drrId }
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
- ChatGPT (Desktop) or Context7 client: You can connect via SSE to a local URL.
  - Start the SSE server: `PORT=3333 bun run scripts/mcp/server-sse.ts` (listens on http://127.0.0.1:3333/sse)
    - Read-only mode is default. To enable write tools locally, run: `FPF_READONLY=0 PORT=3333 bun run scripts/mcp/server-sse.ts`
  - In the client, configure the MCP Server URL: http://127.0.0.1:3333/sse
    - Authentication: None
    - Trust: checked
  - Then: list resources, read fpf://spec, run tools like fpf.list_epistemes
- Commet browser app: similar status; pending official MCP/bridge support.

Extensibility
- Metrics/evaluation hooks (F/R/G/CL) are planned but disabled here.
- A future SQLite adapter can replace the JSON store without changing tool contracts.

Troubleshooting
- If the server starts then exits, check for syntax errors or missing imports; ensure you have Bun 1.3.x (`bun --version`).
- If fpf:spec is missing, ensure the main spec file exists at: yadisk/First Principles Framework — Core Conceptual Specification (holonic).md
- If a client cannot connect, verify it supports MCP stdio/SSE and the command path is correct.
