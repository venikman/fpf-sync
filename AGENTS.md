# Repository Contract

## Purpose

This repo has two responsibilities:

1. mirror the upstream `ailev/FPF` repository into `./FPF` via `.github/`
2. provide an OpenRouter-backed, FPF-specific, PageIndex-style reasoning RAG tool over `FPF/FPF-Spec.md`

## Key boundaries

- `.github/` owns upstream sync.
- `src/` owns indexing and retrieval logic.
- `FPF/` is the mirrored upstream source.
- `.memory/` is committed derived state from `FPF/FPF-Spec.md`.

## Commands

Use Bun only for local work:

- `bun install`
- `bun run memory index`
- `bun run memory tree`
- `bun run memory retrieve "..."`
- `bun run memory answer "..."`
- `bun run check`
- `bun test`

## Required validation

Before finishing any code change, run:

- `bun run check && bun test`

## Read first for non-trivial changes

- `README.md`
- `MEMORY-SPEC.md`

## Guardrails

- Do not add app, UI, server, or framework features.
- Keep runtime deterministic apart from the explicitly remote OpenRouter model call.
- Keep sync logic in `.github/`, not in `src/`.
- Keep `.memory/` committed and rebuildable from `FPF/FPF-Spec.md`.
- Keep `.memory/` scoped to FPF knowledge derived from `FPF/FPF-Spec.md` only.
- Keep the implementation specialized for FPF rather than drifting back toward a generic memory framework.
- Do not reintroduce forbidden legacy sync code, root-path mirror assumptions, or stale docs.
