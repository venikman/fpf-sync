# Local Workflow Testing

This repository uses GitHub Actions to (1) download the latest First Principles Framework
document from Yandex Disk and open a pull request when it changes, and (2) run an agentic
diff analysis on any pull request that touches the synced document. You can execute both
workflows locally with [act](https://github.com/nektos/act) so you can iterate without
waiting for CI.

## Prerequisites

- Docker Desktop (or another Docker runtime)
- `act` installed and available on your `PATH` (`brew install act` on macOS)
- [Bun](https://bun.sh) runtime for executing the local shim (install via `curl -fsSL https://bun.sh/install | bash`)
- Local KAT Dev shim (`scripts/kat-dev.ts`) which proxies to either a local LM Studio
  endpoint or OpenAI's `gpt-oss-20b` model
- PAT with repo write access and any other secrets you need (`WARP_TOKEN`, etc.)
- Either (a) OpenAI credentials for `gpt-oss-20b` **or** (b) an LM Studio server running at
  `http://localhost:1234/v1` with a model such as `kat-dev-mlx`

Create a `.secrets` file in the repo root (ignored by git) with the secrets that the
workflows expect. At minimum you need:

```
GITHUB_TOKEN=ghp_yourTokenHere
WARP_TOKEN=warp_yourTokenHere
```

For local analysis choose one of the following:

1. **LM Studio (recommended)** — add:

```
KAT_API_BASE=http://host.docker.internal:1234/v1
KAT_API_KEY=lmstudio
KAT_ENDPOINT=chat/completions
KAT_LOCAL_MODEL=kat-dev-mlx
# Optional tuning
# KAT_REQUEST_TIMEOUT_MS=120000
# KAT_REQUEST_RETRIES=2
# KAT_REQUEST_BACKOFF_MS=2000
```

2. **OpenAI fallback** — add:

```
OPENAI_API_KEY=sk-yourKeyHere
# Optional: bypass OpenAI network calls when testing locally
# KAT_FAKE_OUTPUT=1
```

You can mix-and-match: the shim prefers `KAT_API_BASE`/`KAT_API_KEY` and falls back to
`OPENAI_API_KEY` if those are missing.

Download a container that is compatible with `ubuntu-latest` and supports `sudo`:

```
docker pull ghcr.io/catthehacker/ubuntu:full-22.04
```

To avoid retyping the platform override, add this line to `.actrc` (optional):

```
-P ubuntu-latest=ghcr.io/catthehacker/ubuntu:full-22.04
```

> Note: the Yandex sync workflow automatically skips the PR creation step when `ACT=true`
> so local runs will not push branches even if you provide a valid PAT.

## Run the Yandex sync workflow

This workflow fetches the document from Yandex Disk and stages it in `yadisk/…`. Run it
with either the schedule event (default cron) or manually:

```
ACT=true act schedule \
  -W .github/workflows/yadisk-sync.yml \
  -j sync \
  --secret-file .secrets
```

Use `workflow_dispatch` instead of `schedule` if you want to simulate a manual trigger.
When the remote file differs from the copy in `main`, the workflow will create/update the
local working tree, but it will not open a PR because of the `ACT=true` guard.

## Run the diff evaluator workflow

Check out the PR branch you want to test locally (e.g., `git fetch origin main` and
`git checkout my-feature`). Then run:

```
ACT=true act pull_request \
  -W .github/workflows/diff-eval.yml \
  -j diff-eval \
  --secret-file .secrets
```

When `ACT=true`, the workflow routes the diff analysis through the bundled
`scripts/kat-dev.sh` shim, which calls your configured LM Studio endpoint (defaults to
`http://host.docker.internal:1234/v1`, model `kat-dev-mlx`, API key `lmstudio`). If you
omit those settings it falls back to OpenAI. On GitHub-hosted runners (where `ACT` is
unset) the workflow automatically uses the Warp agent. Either way the prompt comes from
`.github/agents/fpf-diff-evaluator.md`, and the output lives in `analysis.md` for review.

## Troubleshooting

- If `warp-cli` installation fails, rerun `act` with `--container-architecture linux/amd64`.
- The local shim lives at `scripts/kat-dev.ts`; ensure `bun` is installed (or `bun install`
  was run once) so the script can execute.
- To dry-run without calling OpenAI, set `KAT_FAKE_OUTPUT=1` in your `.secrets`; the shim will
  emit placeholder analysis so the workflow can complete end-to-end.
- If you're using LM Studio, verify it is running and exposes `http://localhost:1234/v1`.
  Inside Docker/act containers we reference `http://host.docker.internal:1234/v1` so the
  workflow can reach the host.
- The workflow caches Bun automatically when `ACT=true`, but you still need Bun installed
  locally if you run the shim outside of GitHub Actions.
- To speed up repeated runs, use `act pull_request --reuse` so containers stay warm.
- Add `ACTIONS_STEP_DEBUG=true` to `.secrets` to enable verbose GitHub Actions logs.
