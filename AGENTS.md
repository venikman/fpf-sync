# Repository Contract

## Purpose

This repo exists to mirror exactly one upstream file into the repository root: `FPF-Spec.md`.

## Commands

Use Bun only:

- `bun install`
- `bun run sync`
- `bun run check`
- `bun test`

## Required validation

Before finishing any change, run:

- `bun run check && bun test`

## Local skills

Use these local skills when editing this repo:

- `.codex/skills/typescript-resharp-style/SKILL.md`
- `.codex/skills/github-upstream-file-mirror/SKILL.md`

## Guardrails

- Do not add app, UI, server, or framework features.
- Use Bun commands only for local work and CI changes.
- Keep logic deterministic, bounded, and auditable.
- Keep the mirror contract to one upstream source file and one committed state file.
- Do not reintroduce forbidden legacy code, paths, or docs.
