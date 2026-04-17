# fpf-sync

This repository mirrors the upstream `ailev/FPF` repo into `./FPF` daily via GitHub Actions and publishes plain-language update reports as a GitHub Pages site.

## What it does

A GitHub Actions workflow runs once per day (and on manual dispatch). It:

1. Clones the latest `ailev/FPF` into a temp directory.
2. Copies the contents into `./FPF`.
3. If anything changed, commits with `chore(sync): mirror ailev/FPF@<sha>` and pushes.

If nothing changed, the run is a no-op.

A separate Codex automation runs after the mirror job. It:

1. Detects new sync commits on `main`.
2. Collects upstream compare metadata and changed section context from the mirrored `FPF` sources.
3. Writes one canonical JSON report per upstream change set into `./reports`.
4. Generates Rspress source files from the reports and builds a static site into `./docs`.
5. Commits and pushes only `reports/` and `docs/` so GitHub Pages can publish the latest report.

## Upstream contract

- Upstream: `ailev/FPF` (branch `main`)
- Local mirror: `FPF/`

## Repo structure

```text
FPF/                        # mirrored upstream content
.github/scripts/sync-fpf.sh # sync script
.github/workflows/fpf-sync.yml # daily sync workflow
.github/scripts/collect-report-context.py # report context collector
.github/scripts/render-report-site.ts     # report-to-MDX generator
theme/styles.css            # shared site styles for Rspress pages
rspress.config.ts           # Rspress configuration
reports/                    # canonical plain-language report JSON
docs/                       # generated GitHub Pages site
```

## Workflow

`.github/workflows/fpf-sync.yml` runs on:

- Schedule: daily at 06:17 UTC
- Manual: `workflow_dispatch`

The sync script lives at `.github/scripts/sync-fpf.sh`.

## Pages publishing

The generated site is intended to publish from the `main` branch `/docs` folder as a project Pages site for:

- `https://venikman.github.io/fpf-sync/`

## Local build

Install dependencies once with `bun install`, then run:

- `bun run build` to regenerate `.site/` and build the Pages output into `docs/`
- `bun run dev` to regenerate `.site/` and start the local Rspress dev server
