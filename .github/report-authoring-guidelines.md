# FPF Report Authoring Guidelines

Use these rules whenever you create or update a report in `reports/*.json`.

## Audience

- Write for an intelligent outsider who has not studied FPF.
- Prefer plain English over framework vocabulary.
- Explain why the change matters in practice.

## Writing Rules

- Do not use pattern IDs or unexplained abbreviations in the report body unless they are part of a source citation.
- Distinguish clearly between choosing among existing options, keeping multiple options alive, publishing a shortlist or handoff result, and planning tool-based execution.
- Focus on the mirrored FPF content itself, not on repository plumbing.
- Keep the tone factual and compact.
- Write for straight-through reading: the body should still make sense if someone starts at the top and never jumps around.
- Let each section title advance the story, not just label a topic bucket.

## Required JSON Shape

Each report must include:

- `slug`
- `published_at`
- `upstream_base_sha`
- `upstream_head_sha`
- `sync_commit`
- `headline`
- `summary`
- `highlights[]`
- `sections[]`
- `source_sections[]`

## Section Expectations

- `headline`: one sentence, non-jargony, readable on a homepage card.
- `summary`: 1-3 short paragraphs that work as the lead and explain the main change in practical terms.
- `highlights`: 3-6 flat bullet strings that prepare the reader for what comes next.
- `sections`: usually 3-5 objects with `title` and `body`; keep them in the order a reader should encounter them, and let later sections build on earlier ones.
- `source_sections`: cite the README/spec headings the report is based on and include a short excerpt; these act as a trailing appendix, not a competing parallel narrative.

## Citation Style

- Cite by file and heading path.
- It is acceptable for source citations to include FPF terminology or pattern IDs.
- The narrative sections should translate that terminology into ordinary language.
- Save dense source language for `source_sections` and brief inline citations only; keep the main article readable without specialist vocabulary.

## Publishing Rules

- Never edit `FPF/`.
- After adding or updating reports, run `.github/scripts/render-report-site.py`.
- Commit only `reports/` and `docs/` when publishing generated output.
