# Local PageIndex Specification

## Purpose

The repository exists to:

1. mirror `ailev/FPF` daily into `./FPF`
2. provide a local, PageIndex-style reasoning retriever over `FPF/FPF-Spec.md`

The memory system is specialized for FPF, not a generic corpus.

## Required behavior

### Sync

Sync must:
- live in `.github/`
- mirror the upstream repo into `FPF/`
- run daily via GitHub Actions
- keep app/runtime sync-free
- rebuild `.memory/` after mirrored source changes
- verify expected `.memory/` artifacts exist
- log whether `FPF/` changed, `.memory/` changed, or the run was a no-op
- commit both `FPF/` and `.memory/`

### Index

`bun run memory index` must:
- read `FPF/FPF-Spec.md`
- build a hierarchical heading tree through heading depth 6
- preserve canonical FPF ids such as `A.1.1:4.3`, `A.6.B`, `A.19.CHR`, and `G.0`
- write a local node-content mapping
- write `.memory/pageindex-state.json`
- write `.memory/pageindex-tree.json`
- write `.memory/fpf-branches.json`
- derive canonical FPF branches from `PREFACE` and `A`–`K`, without synthetic `ROOT-*` or `SECTION-*` ids
- avoid rewriting `.memory/` when source content is unchanged

### Tree

`bun run memory tree` must:
- read committed `.memory/`
- return the PageIndex tree JSON
- not read `FPF/FPF-Spec.md`

### Retrieve

`bun run memory retrieve <question>` must:
- read committed `.memory/`
- seed exact question-id matches into a bounded frontier before branch search
- ask the local model to choose high-level FPF branches only when the frontier is empty
- ask the local model to choose up to 3 frontier nodes per step
- validate returned ids against the offered candidate set
- iteratively gather evidence from coherent section content
- expand over-budget routing nodes into children instead of treating them as evidence
- follow exact references first, appendix labels second, and fuzzy fallback only last
- return the reasoning steps and gathered evidence

### Answer

`bun run memory answer <question>` must:
- run retrieval first
- ask the local model to synthesize an answer from gathered evidence only
- return citations back to node ids and line spans
- sort citations by source order / line span
- add human-readable citation labels in the final answer surface
- add a `rendered` field with the answer plus a compact source list

## Artifact contract

### `.memory/pageindex-state.json`
Must contain at least:
- `schemaVersion`
- `sourcePath`
- `contentHash`
- `maxHeadingDepth`
- `inspectLineBudget`
- `inspectCharBudget`
- `nodeCount`

### `.memory/pageindex-tree.json`
Must contain the full hierarchical tree used for exact section routing.
Each node must include `canonicalIds`.

### `.memory/fpf-branches.json`
Must contain the reduced FPF branch index used for branch-stage routing.
Each branch record must contain at least:
- `branchId`
- `nodeId`
- `title`
- `lineSpan`
- `summary`
- `patternPrefixes`
- `focusAreas`

### `.memory/pageindex-content.jsonl`
Must contain the coherent content mapping used as retrieval evidence.
Each record must contain at least:
- `nodeId`
- `title`
- `lineSpan`
- `summary`
- `references`
- `canonicalIds`
- `parentNodeId`
- `childNodeIds`
- `content`

## Knowledge scope

Committed `.memory/` must contain only knowledge derived from:
- `FPF/FPF-Spec.md`

It must not contain:
- chat history
- user-local notes
- external corpora
- embeddings
- vector indexes
- derived knowledge from `FPF/Readme.md`

## Local model defaults

These are hard-coded:
- endpoint: `http://localhost:1234/api/v1/chat`
- model: `google/gemma-4-26b-a4b`

## Local model JSON contract

### Retrieval control output
The runtime must accept:

```json
{"action":"inspect","node_list":["0002","0003"],"rationale":"..."}
```

```json
{"action":"inspect","node_id":"0002","rationale":"..."}
```

```json
{"action":"answer","rationale":"...","answer_plan":"..."}
```

### Answer output
The runtime must accept:

```json
{"answer":"...","citations":["0002","0003"]}
```

## FPF-specific routing requirements

- branch routing must prefer canonical FPF part owners over synthetic title fallbacks
- known FPF branch profiles may be used as hints
- pattern-prefix and focus-area hints may bias branch selection
- exact canonical-id matches must outrank fuzzy summary/title matches
- new upstream top-level structure must still produce a usable canonical reduced branch index after reindexing

## Non-goals

- vector databases
- embeddings
- chunk similarity search
- runtime sync logic in `src/`
- remote hosted LLM providers
- chat-history-aware retrieval
- full PageIndex MCTS

## Testing note

Testing is not the current product focus, but the repo should keep lightweight coverage for:
- index determinism
- tree loading
- reduced branch loading
- lawful `node_list` validation
- bounded frontier navigation
- routing-node expansion behavior
- answer synthesis with citations
- eval-pack coverage for canonical FPF ids

## Validation

Before finishing a change:

```bash
bun run check
bun test
```
