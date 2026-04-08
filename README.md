# fpf-sync

This repo has two responsibilities:

1. mirror the upstream `ailev/FPF` repo daily into `./FPF`
2. provide an OpenRouter-backed, FPF-specific, PageIndex-style reasoning retriever over `FPF/FPF-Spec.md`

It is not a generic memory framework. It is built for one source document family: FPF.

## Quickstart

```bash
cp .env.example .env
# then put your OpenRouter key into .env
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
4. You use `retrieve` / `answer` locally through OpenRouter.
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
- runtime/app code contains no sync logic

## OpenRouter model

The reasoning model is OpenRouter-backed, with Mastra handling runtime LLM interactions.

Bun loads `.env` automatically.

Required environment variable:

- `OPENROUTER_API_KEY`

Optional environment variables:

- `OPENROUTER_MODEL` — defaults to `minimax/minimax-m2.7`
- `OPENROUTER_ENDPOINT` — defaults to `https://openrouter.ai/api/v1/chat/completions`
- `OPENROUTER_TIMEOUT_MS` — defaults to `60000`

Example request shape:

```bash
curl https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "minimax/minimax-m2.7",
    "messages": [
      {"role": "system", "content": "You answer only in rhymes."},
      {"role": "user", "content": "What is your favorite color?"}
    ],
    "temperature": 0
  }'
```

There are intentionally no CLI flags for model or endpoint right now.

## Commands

```bash
bun run memory index
bun run memory tree
bun run memory retrieve "What does A.10 say?"
bun run memory answer "What is bounded context?"
bun run mcp
bun run check
bun test
```

If you want lower cost and more visibility into retrieval, prefer `retrieve` first. The CLI trace now logs per-call OpenRouter usage metadata when the provider returns it.

## Local runtime surfaces

The runtime is exposed in two local forms without shelling out to the CLI:

- a typed in-process TypeScript API via `src/agentApi.ts`
- a local stdio MCP server via `bun run mcp`

Read-only MCP / API tools:

- `fpf_list_branches`
- `fpf_get_node`
- `fpf_retrieve`
- `fpf_state`

## Artifact map

Indexing reads:
- `FPF/FPF-Spec.md`

Indexing writes committed derived artifacts under `.memory/`:

- `.memory/pageindex-state.json`
  - schema version
  - source path and content hash
  - heading depth used for indexing
  - inspect budgets used by retrieval
  - node count
- `.memory/pageindex-tree.json`
  - full hierarchical PageIndex tree
  - canonical FPF ids per node
- `.memory/fpf-branches.json`
  - reduced canonical FPF branch index
  - branch-stage routing surface
- `.memory/pageindex-content.jsonl`
  - `nodeId -> coherent section content`
  - canonical FPF ids and exact references per node

## Runtime loop

The runtime follows a PageIndex-style loop specialized for FPF:

1. read the reduced FPF branch index and the full tree
2. if the question names exact FPF ids, seed those nodes into a bounded frontier immediately
3. otherwise ask the OpenRouter model to choose one or more high-level FPF branches
4. if branch routing times out, fall back to deterministic reduced-branch ranking
5. seed a frontier with exact-id matches, branch roots, branch children, reference targets, and short-leaf siblings
6. ask the OpenRouter model to choose up to three frontier nodes per step
7. inspect under-budget nodes as evidence; expand routing nodes into children instead of treating them as evidence
8. repeat until the model says the evidence is sufficient, then synthesize the final answer from evidence only

This is:
- vectorless
- reasoning-based
- section-coherent
- OpenRouter-backed at inference time
- multi-node within each bounded search step

This is not:
- embeddings-based retrieval
- vector similarity search
- fixed chunk retrieval
- chat-history-aware retrieval
- full PageIndex MCTS

## Model JSON contract

The reasoning model must return JSON-only control outputs.

### Branch selection

Preferred shape:

```json
{"action":"inspect","node_list":["0021","1860"],"rationale":"..."}
```

Legacy single-node shape still works:

```json
{"action":"inspect","node_id":"0021","rationale":"..."}
```

If evidence is already sufficient:

```json
{"action":"answer","rationale":"...","answer_plan":"..."}
```

### Frontier selection

Preferred shape:

```json
{"action":"inspect","node_list":["1864","1871"],"rationale":"..."}
```

Legacy single-node shape still works:

```json
{"action":"inspect","node_id":"1864","rationale":"..."}
```

The controller validates returned ids against the offered candidate set, dedupes them in model order, and caps each inspect batch at 3.

### Final answer stage

The answer synthesizer expects:

```json
{"answer":"...","citations":["0002","0003"]}
```

Citations must point to node ids that were actually retrieved as evidence.

The runtime then enriches the final output by:
- sorting citations by source order / line span
- adding human-readable citation labels
- adding a `rendered` field with the answer plus a compact source list

## Why this is FPF-specific, not generic

The reduced branch index is built specifically around FPF structure.

It uses:
- canonical FPF part owners `PREFACE` and `A` through `K`
- exact FPF ids such as `A.1.1:4.3`, `A.6.B`, `A.19.CHR`, and `G.0`
- branch profile hints such as pattern prefixes and focus areas
- exact appendix-label following before fuzzy fallback

Important invariants:
- branch routing is derived from the mirrored FPF structure, not hard-coded `ROOT-*` fallbacks
- `.memory/` contains only knowledge derived from `FPF/FPF-Spec.md`
- retrieval is lawful: model-selected ids must be members of the offered candidate set

## What `.memory/` contains

Committed `.memory/` contains only:
- structure derived from `FPF/FPF-Spec.md`
- canonical ids and exact references derived from `FPF/FPF-Spec.md`
- summaries derived from `FPF/FPF-Spec.md`
- branch metadata specialized for FPF routing
- coherent section content copied from `FPF/FPF-Spec.md`

It does not contain:
- chat history
- user-specific notes
- external corpora
- embeddings
- vector data
- knowledge from `FPF/Readme.md`

## Sync and reindex lifecycle

Keep this distinction clear:

### GitHub daily sync
- updates `FPF/`
- rebuilds `.memory/`
- verifies expected `.memory/` artifacts exist
- logs whether `FPF/` changed, `.memory/` changed, or the run was a no-op
- commits both `FPF/` and `.memory/`

### Local reindex
- reads `FPF/FPF-Spec.md`
- rebuilds `.memory/`
- is useful after local source changes or before local inspection of derived state

## Eval pack

The repo includes a committed eval pack at `test/fixtures/pageindex-eval.json`.

It is keyed by canonical FPF ids and currently covers:
- `A.2.2`
- `A.2.3`
- `A.10`
- `A.15.1`
- `A.6.B`
- `F.9`
- `G.0`
- `A.1.1:4.3`

The current tests use it to verify that the indexed corpus still contains the expected canonical targets for promise / ability / performance-style questions.
