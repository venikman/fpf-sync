---
name: typescript-resharp-style
description: RE#-inspired TypeScript style rules for the Bun-based single-file mirror.
---

# Purpose

Use this skill when editing TypeScript in this repository.

# Style

- Separate setup, parse, plan, apply, and verify phases.
- Keep the core decision path tiny and deterministic.
- Normalize or precompute once, then act on plain data.
- Use small pure functions unless a boundary must touch IO.
- Bound retries, timeouts, loops, and side effects explicitly.
- Prefer total return shapes over optional ad hoc bags.
- Fail fast with direct invariant messages.
- Avoid speculative branching, backtracking flow, and broad abstractions.
- Keep allocations and wrapper layers to a minimum.

# Review checklist

- Is the decision path obvious in one pass?
- Are config and paths validated before IO?
- Are retries and timeouts explicit and bounded?
- Is dry-run behavior side-effect free?
- Are error messages concrete enough to audit from logs?
- Does the change avoid extra framework or feature surface?
