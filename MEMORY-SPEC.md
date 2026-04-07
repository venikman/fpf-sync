# Local PageIndex Specification

## Purpose

The repository exists to:

1. mirror `ailev/FPF` daily into `./FPF`
2. provide a local, PageIndex-style reasoning RAG tool over `FPF/FPF-Spec.md`

The memory system is specialized for **FPF**, not a generic corpus.

## Required behavior

### Sync

Sync must:
- live in `.github/`
- mirror the upstream repo into `FPF/`
- run daily via GitHub Actions
- keep app/runtime sync-free
- rebuild `.memory/` after mirrored source changes
- commit both `FPF/` and `.memory/`

### Index

`bun run memory index` must:
- read `FPF/FPF-Spec.md`
- build a hierarchical heading tree
- write a local node-content mapping
- write `.memory/pageindex-state.json`
- write `.memory/pageindex-tree.json`
- write `.memory/fpf-branches.json`
- derive the reduced FPF branch index from the actual mirrored top-level structure so new upstream structure can still be indexed
- avoid rewriting `.memory/` when source content is unchanged

### Tree

`bun run memory tree` must:
- read committed `.memory/`
- return the PageIndex tree JSON
- not read `FPF/FPF-Spec.md`

### Retrieve

`bun run memory retrieve <question>` must:
- read committed `.memory/`
- ask the local model to choose the most plausible high-level FPF branch first from a reduced branch index
- ask the local model to choose the most plausible exact section inside that branch
- iteratively gather evidence from coherent section content
- auto-expand to child, sibling, or referenced nodes when an inspected section looks incomplete
- return the reasoning steps and gathered evidence

### Answer

`bun run memory answer <question>` must:
- run retrieval first
- ask the local model to synthesize an answer from gathered evidence only
- return citations back to node ids and line spans

## Artifact contract

### `.memory/pageindex-state.json`
Must contain at least:
- source path
- content hash
- heading depth
- node count

### `.memory/pageindex-tree.json`
Must contain the full hierarchical tree used for exact section routing.

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
{"action":"inspect","node_id":"0002","rationale":"..."}
```

```json
{"action":"answer","rationale":"...","answer_plan":"..."}
```

For exact section selection, the runtime must also accept:

```json
{"node_id":"0002","rationale":"..."}
```

### Answer output
The runtime must accept:

```json
{"answer":"...","citations":["0002","0003"]}
```

## FPF-specific routing requirements

- branch routing must prefer actual mirrored top-level structure over hard-coded historical assumptions
- known FPF branch profiles may be used as hints
- pattern-prefix and focus-area hints may be used to bias branch selection
- new upstream top-level structure must still produce a usable reduced branch index after reindexing

## Non-goals

- vector databases
- embeddings
- chunk similarity search
- runtime sync logic in `src/`
- remote hosted LLM providers

## Testing note

Testing is not the current focus, but the repo should keep a plan and lightweight coverage for:
- index determinism
- tree loading
- reduced branch loading
- branch → section navigation
- auto-expansion behavior
- answer synthesis with citations

## Validation

Before finishing a change:

```bash
bun run check
bun test
```
