# fpf-pageindex-local

This repo has two responsibilities:

1. **mirror the upstream `ailev/FPF` repo daily into `./FPF`**
2. provide a **local-only, FPF-specific, PageIndex-style reasoning RAG tool** over `FPF/FPF-Spec.md`

It is not a generic memory framework. It is built for **one source document family**: FPF.

## Quickstart

```bash
bun install
bun run memory index
bun run memory tree
bun run memory retrieve "What does A.10 say?"
bun run memory answer "What is bounded context?"
```

Typical lifecycle:

1. GitHub Actions syncs upstream `ailev/FPF` into `FPF/` daily.
2. The same workflow rebuilds and commits `.memory/` from `FPF/FPF-Spec.md`.
3. You pull the latest repo changes locally.
4. You use `retrieve` / `answer` locally against LM Studio.
5. If you want to refresh derived memory locally after local edits, run `bun run memory index`.

`./FPF` is committed. `.memory/` is also committed as derived repository state.

## Upstream sync

The upstream repo is mirrored into:

- `FPF/FPF-Spec.md`
- `FPF/Readme.md`

Daily sync is handled entirely from `.github/`:

- workflow: `.github/workflows/fpf-sync.yml`
- sync script: `.github/scripts/sync-fpf.sh`

Important boundary:
- `.github/` owns sync
- `src/` owns indexing and local retrieval
- runtime/app code contains **no sync logic**

## Local model

The local reasoning model is hard-coded to LM Studio defaults:

- endpoint: `http://localhost:1234/api/v1/chat`
- model: `google/gemma-4-26b-a4b`

Example LM Studio request shape:

```bash
curl http://localhost:1234/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{
    "model": "google/gemma-4-26b-a4b",
    "system_prompt": "You answer only in rhymes.",
    "input": "What is your favorite color?"
  }'
```

There are intentionally **no CLI flags** for model or endpoint right now.

## Commands

```bash
bun run memory index
bun run memory tree
bun run memory retrieve "What does A.10 say?"
bun run memory answer "What is bounded context?"
bun run check
bun test
```

## Artifact map

Indexing reads:
- `FPF/FPF-Spec.md`

Indexing writes committed derived artifacts under `.memory/`:

- `.memory/pageindex-state.json`
  - source path
  - source content hash
  - node count
  - heading depth used for indexing
- `.memory/pageindex-tree.json`
  - full hierarchical PageIndex tree
  - used for exact subtree navigation
- `.memory/fpf-branches.json`
  - reduced **FPF branch index**
  - used for branch-stage navigation
- `.memory/pageindex-content.jsonl`
  - `nodeId -> coherent section content`
  - used as the raw evidence surface

## Runtime loop

The runtime follows a PageIndex-style loop, specialized for FPF:

1. read the reduced FPF branch index and the full tree
2. ask the local LLM to choose the most plausible **high-level FPF branch**
3. ask the local LLM to choose the most plausible **exact section** inside that branch
4. load coherent section content for that section
5. automatically expand to child, sibling, or referenced nodes when the section looks incomplete
6. decide whether evidence is sufficient
7. inspect another branch/section or synthesize an answer

This is:
- vectorless
- reasoning-based
- section-coherent
- local-only at inference time

This is not:
- embeddings-based retrieval
- vector similarity search
- fixed chunk retrieval
- remote hosted inference

## Local model JSON contract

The local model must return **JSON-only** control outputs.

### Branch/section retrieval stages

The retriever expects JSON like:

```json
{"action":"inspect","node_id":"0002","rationale":"..."}
```

or:

```json
{"action":"answer","rationale":"...","answer_plan":"..."}
```

For the section-selection stage, it also accepts:

```json
{"node_id":"0002","rationale":"..."}
```

### Final answer stage

The answer synthesizer expects:

```json
{"answer":"...","citations":["0002","0003"]}
```

Citations must point to node ids that were actually retrieved as evidence.

## Why this is FPF-specific, not generic

The reduced branch index is built specifically around FPF structure.

It uses:
- actual mirrored top-level FPF roots as the source of truth
- current known FPF branch profiles such as `A`–`K` and `PREFACE` as hints
- pattern-prefix hints like `A.`, `E.`, `F.`
- FPF branch focus areas such as kernel, reasoning, constitution, bridge across contexts, glossary, annexes, and so on

Important invariant:
- if upstream FPF changes structure, reindexing derives a new reduced branch index from the **actual mirrored structure**
- the system is not frozen to one historical FPF layout

## What `.memory/` contains

Yes: the committed `.memory/` contains **only FPF-derived knowledge**.

More precisely, it contains:
- structure derived from `FPF/FPF-Spec.md`
- summaries derived from `FPF/FPF-Spec.md`
- branch metadata specialized for FPF routing
- coherent section content copied from `FPF/FPF-Spec.md`

It does **not** contain:
- chat history
- user-specific notes
- external corpora
- embeddings
- vector data
- knowledge from `FPF/Readme.md`

Current source of truth for `.memory/` is only:
- `FPF/FPF-Spec.md`

## Sync and reindex lifecycle

Keep this distinction clear:

### GitHub daily sync
- updates `FPF/`
- rebuilds `.memory/`
- commits both `FPF/` and `.memory/`

### Local reindex
- reads `FPF/FPF-Spec.md`
- rebuilds `.memory/`
- is useful after local source changes or before local inspection of derived state

## Testing status

Testing is **not the current focus**, but we still want a plan and some safety.

Current priority is:
- keep `FPF/` up to date automatically
- keep committed `.memory/` aligned with `FPF/FPF-Spec.md`
- keep local retrieval local-only

Planned longer-term coverage should keep focusing on:
- index determinism
- tree and branch loading
- branch → section navigation
- auto-expansion behavior
- answer synthesis with citations
