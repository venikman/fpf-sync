---
name: github-upstream-file-mirror
description: Workflow for implementing or modifying the GitHub-based upstream file mirror in this repository.
---

# Purpose

Use this skill when changing the sync logic, state contract, or GitHub Actions workflow.

# Flow

## Observe

- Parse config once.
- Query `GET /repos/{owner}/{repo}/commits?sha=<ref>&path=<sourcePath>&per_page=1`.
- Read the committed state file.
- Check whether the local target file exists.

## Decide

- If `lastCommitSha` matches the upstream SHA and the target file exists, return a no-op.
- Otherwise plan a sync.
- In dry-run mode, report the planned sync and write nothing.

## Apply

- Fetch the source file content from GitHub.
- Reject empty content.
- Write the target file.
- Update the committed state file with upstream identity, commit metadata, source URLs, and `syncedAt`.

## Verify

- Confirm the target file and state file exist after a real sync.
- Keep stdout concise and machine-friendly.
- Validate with `bun run check && bun test`.

# Guardrails

- No compatibility shims, alternate sync paths, or legacy output locations.
- No extra product features beyond the single-file mirror.
- Keep behavior deterministic, bounded, and easy to audit.
