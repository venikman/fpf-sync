# PageIndex Memory Model

This repo implements an OpenRouter-backed, Mastra-mediated, PageIndex-style reasoning retriever over:

- `FPF/FPF-Spec.md`

It is intentionally specialized for FPF rather than a generic document corpus.

## Source and sync boundary

- upstream mirroring happens in `.github/`
- runtime code contains no sync logic
- the mirrored upstream repo lives in `./FPF`
- `.memory/` is committed derived state

## Artifact roles

Indexing writes committed derived artifacts:

- `.memory/pageindex-state.json`
  - `schemaVersion`
  - `sourcePath`
  - `contentHash`
  - `maxHeadingDepth`
  - `inspectLineBudget`
  - `inspectCharBudget`
  - `nodeCount`
- `.memory/pageindex-tree.json`
  - full hierarchical PageIndex tree
  - per-node `canonicalIds`
- `.memory/fpf-branches.json`
  - reduced FPF branch index for branch-stage routing
  - only canonical branch ids: `PREFACE`, `A`–`K`
- `.memory/pageindex-content.jsonl`
  - exact `nodeId -> coherent section content` mapping
  - per-node `canonicalIds` and exact `references`

## Knowledge scope

`.memory/` contains only knowledge derived from:
- `FPF/FPF-Spec.md`

It does not contain:
- chat history
- user annotations
- external documents
- embeddings or vector indexes
- derived knowledge from `FPF/Readme.md`

## Tree node shape

Each tree node carries:
- `nodeId`
- `title`
- `depth`
- `startLine`
- `endLine`
- `summary`
- `references`
- `canonicalIds`
- `subNodes`

## Content mapping shape

Each content record carries:
- `nodeId`
- `title`
- `lineSpan`
- `summary`
- `references`
- `canonicalIds`
- `parentNodeId`
- `childNodeIds`
- `content`

## Reduced FPF branch shape

Each reduced branch record carries:
- `branchId`
- `nodeId`
- `title`
- `lineSpan`
- `summary`
- `patternPrefixes`
- `focusAreas`

The reduced branch index is derived from canonical FPF part owners. Internal cluster headings remain normal tree nodes and do not produce synthetic `ROOT-*` or `SECTION-*` branch ids.

## Commands

```bash
bun run memory index
bun run memory tree
bun run memory retrieve "What does A.10 say?"
bun run memory answer "What is bounded context?"
```

## Runtime boundary

- indexing writes `.memory/`
- retrieval reads `.memory/`
- answering reads `.memory/`
- runtime use is read-only
- retrieval uses a two-stage search: branch selection, then bounded frontier selection
- if branch-stage model routing times out, retrieval falls back to deterministic reduced-branch ranking
- the frontier is seeded by exact question-id matches, branch roots, branch children, exact reference targets, and short-leaf siblings
- over-budget routing nodes expand to children instead of becoming evidence
- the model endpoint and model name are hard-coded in code

## Retrieval workflow

### Stage 1 — branch routing
Use `.memory/fpf-branches.json` to choose one or more plausible FPF branches when no exact question-id frontier exists. If the branch-stage model request times out, fall back to deterministic reduced-branch ranking and continue from the seeded branch sections.

### Stage 2 — frontier selection
Use `.memory/pageindex-tree.json` and the live frontier to choose up to three next nodes to inspect.

### Stage 3 — evidence loading
Use `.memory/pageindex-content.jsonl` to load coherent section content by `nodeId`.

### Stage 4 — frontier reseeding
Seed exact reference targets, routing children, or short-leaf siblings after each inspect step.

### Stage 5 — answer synthesis
Synthesize an answer from gathered evidence only, with citations back to retrieved node ids.
The final answer surface sorts citations by source order and adds human-readable citation labels.

## OpenRouter defaults

Required:
- `OPENROUTER_API_KEY`

Optional:
- `OPENROUTER_ENDPOINT` — defaults to `https://openrouter.ai/api/v1/chat/completions`
- `OPENROUTER_MODEL` — defaults to `minimax/minimax-m2.7`
- `OPENROUTER_TIMEOUT_MS` — defaults to `60000`

## Model JSON contract

### Branch and frontier stages
Accepted control outputs:

```json
{"action":"inspect","node_list":["0002","0003"],"rationale":"..."}
```

```json
{"action":"inspect","node_id":"0002","rationale":"..."}
```

```json
{"action":"answer","rationale":"...","answer_plan":"..."}
```

### Answer synthesis
Accepted answer output:

```json
{"answer":"...","citations":["0002","0003"]}
```

## Eval pack

The repo carries a committed eval pack at `test/fixtures/pageindex-eval.json`. It is keyed by canonical FPF ids and used in tests to verify that the current repo spec still exposes the expected promise / ability / performance targets.
