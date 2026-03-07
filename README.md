# fpf-sync

This repository mirrors one upstream file into the repo root: `ailev/FPF` -> `FPF-Spec.md`.

## Upstream contract

- Owner: `ailev`
- Repo: `FPF`
- Ref: `main`
- Source path: `FPF-Spec.md`
- Local target path: `FPF-Spec.md`
- Local state path: `.fpf-sync.json`

The sync checks the latest upstream commit that touched `FPF-Spec.md`. If the recorded commit SHA
matches local state and the mirrored file exists, the run exits as a no-op. Otherwise it fetches
the file, writes `FPF-Spec.md`, and updates `.fpf-sync.json`.

## Commands

- `bun install`
- `bun run sync`
- `bun run sync:dry-run`
- `bun run lint`
- `bun run format`
- `bun run typecheck`
- `bun run check`
- `bun test`

## Overrides

The CLI accepts `--owner`, `--repo`, `--ref`, `--source-path`, `--target-path`, and
`--state-path`. The matching environment variables are:

- `FPF_SYNC_OWNER`
- `FPF_SYNC_REPO`
- `FPF_SYNC_REF`
- `FPF_SYNC_SOURCE_PATH`
- `FPF_SYNC_TARGET_PATH`
- `FPF_SYNC_STATE_PATH`

`--dry-run` plans the update and prints the same summary shape without writing files.

## Workflow behavior

`.github/workflows/fpf-sync.yml` runs once per day and on `workflow_dispatch`.

When the sync changes the repo, the workflow:

1. Commits with `chore(sync): mirror ailev/FPF@<sha>`.
2. Pushes directly to the current branch when that branch accepts writes.
3. Falls back to a small pull request flow only when the direct push is blocked.

## State file

`.fpf-sync.json` records the upstream identity and the last mirrored commit:

- `owner`, `repo`, `ref`, `sourcePath`, `targetPath`
- `lastCommitSha`, `lastCommitDate`
- `sourceHtmlUrl`, `sourceRawUrl`
- `syncedAt`
