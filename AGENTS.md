# Repository Contract

## Purpose

This repo mirrors the upstream `ailev/FPF` repository into `./FPF` via `.github/`.

## Key boundaries

- `.github/` owns upstream sync.
- `FPF/` is the mirrored upstream source.

## Guardrails

- Do not add app, UI, server, or framework features.
- Keep sync logic in `.github/`, not in application code.
- Do not add runtime code, indexing, retrieval, or memory systems.
