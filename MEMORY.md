# Local PageIndex Memory Model

This repo implements a local, PageIndex-style reasoning RAG over:

- `FPF/FPF-Spec.md`

It is intentionally specialized for **FPF** rather than a generic document corpus.

## Source and sync boundary

- upstream mirroring happens in `.github/`
- runtime code contains no sync logic
- the mirrored upstream repo lives in `./FPF`
- `.memory/` is committed derived state

## Artifact roles

Indexing writes committed derived artifacts:

- `.memory/pageindex-state.json`
  - source path, source hash, heading depth, node count
- `.memory/pageindex-tree.json`
  - full hierarchical PageIndex tree
- `.memory/fpf-branches.json`
  - reduced FPF branch index for high-level branch routing
- `.memory/pageindex-content.jsonl`
  - exact `nodeId -> coherent section content` mapping

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
- `subNodes`

## Content mapping shape

Each content record carries:
- `nodeId`
- `title`
- `lineSpan`
- `summary`
- `references`
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

The reduced branch index is derived from the **actual mirrored top-level FPF structure**. Known
FPF branch profiles are hints, not a rigid schema.

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
- retrieval uses two-stage navigation: reduced FPF branch selection, then exact section selection
- retrieval auto-expands to child, sibling, or referenced nodes when an inspected section looks incomplete
- model endpoint and model name are hard-coded in code

## Retrieval workflow

### Stage 1 — branch routing
Use `.memory/fpf-branches.json` to choose the most plausible FPF branch.

### Stage 2 — exact section routing
Use `.memory/pageindex-tree.json` to choose the most plausible exact section inside the selected branch.

### Stage 3 — evidence loading
Use `.memory/pageindex-content.jsonl` to load coherent section content by `nodeId`.

### Stage 4 — auto-expansion
Expand to nearby child, sibling, or referenced nodes when the chosen section appears incomplete.

### Stage 5 — answer synthesis
Synthesize an answer from gathered evidence only, with citations back to retrieved node ids.

## Local model defaults

- endpoint: `http://localhost:1234/api/v1/chat`
- model: `google/gemma-4-26b-a4b`

## Local model JSON contract

### Retrieval stages
Accepted control outputs:

```json
{"action":"inspect","node_id":"0002","rationale":"..."}
```

```json
{"action":"answer","rationale":"...","answer_plan":"..."}
```

For exact section selection, the runtime also accepts:

```json
{"node_id":"0002","rationale":"..."}
```

### Answer synthesis
Accepted answer output:

```json
{"answer":"...","citations":["0002","0003"]}
```

## Testing note

Testing exists and should keep growing, but it is not the current product focus.
