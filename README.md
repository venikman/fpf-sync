# fpf-sync

This repository mirrors the upstream `ailev/FPF` repo into `./FPF` daily via GitHub Actions.

## What it does

A GitHub Actions workflow runs once per day (and on manual dispatch). It:

1. Clones the latest `ailev/FPF` into a temp directory.
2. Copies the contents into `./FPF`.
3. If anything changed, commits with `chore(sync): mirror ailev/FPF@<sha>` and pushes.

If nothing changed, the run is a no-op.

## Upstream contract

- Upstream: `ailev/FPF` (branch `main`)
- Local mirror: `FPF/`

## Repo structure

```
FPF/                        # mirrored upstream content
.github/scripts/sync-fpf.sh # sync script
.github/workflows/fpf-sync.yml # daily sync workflow
```

## Workflow

`.github/workflows/fpf-sync.yml` runs on:

- Schedule: daily at 06:17 UTC
- Manual: `workflow_dispatch`

The sync script lives at `.github/scripts/sync-fpf.sh`.
