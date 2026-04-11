## What

<!-- Brief description of what this PR does -->

## Why

<!-- Motivation or link to issue -->

## Type

- [ ] `feat` — new capability
- [ ] `fix` — bug fix
- [ ] `refactor` — code restructuring
- [ ] `docs` — documentation only
- [ ] `chore` — maintenance (deps, CI, sync)

## Changes

<!-- Key changes, one bullet per logical unit -->

## Validation

- [ ] `bun run check && bun test` passes locally
- [ ] No new warnings introduced
- [ ] `.memory/` remains rebuildable from `FPF/FPF-Spec.md` (if touched)
- [ ] Relevant docs updated (README, MEMORY-SPEC, AGENTS if applicable)

## Boundary check

- [ ] Sync logic stays in `.github/`, not in `src/`
- [ ] No app, UI, server, or framework features added
- [ ] `.memory/` scoped to FPF knowledge only

## Agent metadata

<!-- Fill in if this PR was authored or co-authored by an AI agent -->
<!-- Do not include secrets, credentials, tokens, private URLs, or PII in Session/Prompt fields -->

| Field   | Value |
|---------|-------|
| Agent   | <!-- e.g. Devin, Claude Code, Hermes, Codex --> |
| Session | <!-- link or ID --> |
| Prompt  | <!-- original task description --> |
