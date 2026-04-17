#!/usr/bin/env python3
"""Collect context for plain-language reports about mirrored FPF syncs."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any


SYNC_SUBJECT_RE = re.compile(r"^chore\(sync\): mirror ailev/FPF@([0-9a-f]{40})$")
HUNK_RE = re.compile(
    r"^@@ -(?P<old_start>\d+)(?:,(?P<old_count>\d+))? "
    r"\+(?P<new_start>\d+)(?:,(?P<new_count>\d+))? @@"
)
HEADING_RE = re.compile(r"^(#{1,6})\s+(.*\S)\s*$")
REPORT_DOCUMENTS = (
    {
        "label": "README",
        "candidates": ("FPF/Readme.md", "FPF/README.md", "README.md"),
    },
    {
        "label": "FPF Spec",
        "candidates": ("FPF/FPF-Spec.md", "FPF-Spec.md"),
    },
)


SCRIPT_PATH = Path(__file__).resolve()
REPO_ROOT = SCRIPT_PATH.parents[2]
REPORTS_DIR = REPO_ROOT / "reports"


def run_command(args: list[str], *, cwd: Path = REPO_ROOT) -> str:
    result = subprocess.run(
        args,
        cwd=cwd,
        check=True,
        text=True,
        capture_output=True,
    )
    return result.stdout


def git_output(*args: str) -> str:
    return run_command(["git", *args])


def git_path_exists(commit: str, path: str) -> bool:
    try:
        run_command(["git", "cat-file", "-e", f"{commit}:{path}"])
        return True
    except subprocess.CalledProcessError:
        return False


def gh_json(path: str) -> Any:
    output = run_command(
        [
            "gh",
            "api",
            "-H",
            "Accept: application/vnd.github+json",
            path,
        ]
    )
    return json.loads(output)


def short_sha(value: str) -> str:
    return value[:8]


def slugify_heading(text: str) -> str:
    lowered = text.strip().lower()
    lowered = re.sub(r"[^\w\s-]", "", lowered)
    lowered = re.sub(r"\s+", "-", lowered)
    lowered = re.sub(r"-{2,}", "-", lowered)
    return lowered.strip("-")


def resolve_commit(ref: str) -> str:
    return git_output("rev-parse", ref).strip()


def collect_sync_commits(ref: str) -> list[dict[str, str]]:
    raw = git_output(
        "log",
        ref,
        "--grep=^chore(sync): mirror ailev/FPF@",
        "--format=%H%x00%cI%x00%s",
    )
    commits: list[dict[str, str]] = []
    for line in raw.splitlines():
        commit_sha, committed_at, subject = line.split("\x00")
        match = SYNC_SUBJECT_RE.match(subject)
        if not match:
            continue
        commits.append(
            {
                "commit": commit_sha,
                "committed_at": committed_at,
                "subject": subject,
                "upstream_sha": match.group(1),
            }
        )
    commits.reverse()
    return commits


def load_existing_reports(reports_dir: Path) -> list[dict[str, Any]]:
    if not reports_dir.exists():
        return []

    reports: list[dict[str, Any]] = []
    for path in sorted(reports_dir.glob("*.json")):
        data = json.loads(path.read_text())
        try:
            data["_path"] = str(path.relative_to(REPO_ROOT))
        except ValueError:
            data["_path"] = str(path)
        reports.append(data)
    reports.sort(key=lambda item: item.get("published_at", ""))
    return reports


def build_pairs(sync_commits: list[dict[str, str]]) -> list[dict[str, Any]]:
    pairs: list[dict[str, Any]] = []
    for index in range(1, len(sync_commits)):
        base = sync_commits[index - 1]
        head = sync_commits[index]
        slug = f"{head['committed_at'][:10]}-{short_sha(head['upstream_sha'])}"
        pairs.append(
            {
                "slug": slug,
                "base": base,
                "head": head,
            }
        )
    return pairs


def resolve_existing_pair_index(
    pairs: list[dict[str, Any]],
    reports: list[dict[str, Any]],
) -> int:
    if not reports:
        return -1

    pair_by_sync = {pair["head"]["commit"]: index for index, pair in enumerate(pairs)}
    pair_by_upstream = {
        pair["head"]["upstream_sha"]: index for index, pair in enumerate(pairs)
    }

    latest_index = -1
    for report in reports:
        sync_commit = report.get("sync_commit")
        upstream_head = report.get("upstream_head_sha")
        if sync_commit in pair_by_sync:
            latest_index = max(latest_index, pair_by_sync[sync_commit])
        elif upstream_head in pair_by_upstream:
            latest_index = max(latest_index, pair_by_upstream[upstream_head])
    return latest_index


def pending_pairs(ref: str, reports_dir: Path) -> list[dict[str, Any]]:
    sync_commits = collect_sync_commits(ref)
    if len(sync_commits) < 2:
        raise SystemExit("Need at least two sync commits to build a report.")

    pairs = build_pairs(sync_commits)
    reports = load_existing_reports(reports_dir)
    if not reports:
        return pairs[-1:]

    latest_existing_index = resolve_existing_pair_index(pairs, reports)
    return pairs[latest_existing_index + 1 :]


def git_show_lines(commit: str, path: str) -> list[str]:
    return git_output("show", f"{commit}:{path}").splitlines()


def resolve_document_path(commit: str, candidates: tuple[str, ...]) -> str | None:
    for candidate in candidates:
        if git_path_exists(commit, candidate):
            return candidate
    return None


def diff_text_for_lines(base_lines: list[str], head_lines: list[str]) -> str:
    with tempfile.NamedTemporaryFile("w", delete=False) as base_file:
        base_file.write("\n".join(base_lines))
        if base_lines:
            base_file.write("\n")
        base_path = Path(base_file.name)

    with tempfile.NamedTemporaryFile("w", delete=False) as head_file:
        head_file.write("\n".join(head_lines))
        if head_lines:
            head_file.write("\n")
        head_path = Path(head_file.name)

    try:
        result = subprocess.run(
            [
                "git",
                "diff",
                "--no-index",
                "--unified=0",
                "--no-color",
                str(base_path),
                str(head_path),
            ],
            check=False,
            text=True,
            capture_output=True,
        )
    finally:
        base_path.unlink(missing_ok=True)
        head_path.unlink(missing_ok=True)

    if result.returncode not in (0, 1):
        raise subprocess.CalledProcessError(
            result.returncode, result.args, output=result.stdout, stderr=result.stderr
        )
    return result.stdout


def parse_hunks(diff_text: str) -> list[dict[str, int]]:
    hunks: list[dict[str, int]] = []
    for line in diff_text.splitlines():
        match = HUNK_RE.match(line)
        if not match:
            continue
        hunks.append(
            {
                "old_start": int(match.group("old_start")),
                "old_count": int(match.group("old_count") or "1"),
                "new_start": int(match.group("new_start")),
                "new_count": int(match.group("new_count") or "1"),
            }
        )
    return hunks


def document_diff_stats(base_commit: str, head_commit: str) -> tuple[str, list[dict[str, Any]]]:
    stats: list[dict[str, Any]] = []
    total_additions = 0
    total_deletions = 0

    for document in REPORT_DOCUMENTS:
        candidates = tuple(document["candidates"])
        base_path = resolve_document_path(base_commit, candidates)
        head_path = resolve_document_path(head_commit, candidates)
        if base_path is None and head_path is None:
            continue

        base_lines = git_show_lines(base_commit, base_path) if base_path else []
        head_lines = git_show_lines(head_commit, head_path) if head_path else []
        hunks = parse_hunks(diff_text_for_lines(base_lines, head_lines))

        additions = 0
        deletions = 0
        for hunk in hunks:
            additions += hunk["new_count"]
            deletions += hunk["old_count"]

        if additions == 0 and deletions == 0:
            continue

        total_additions += additions
        total_deletions += deletions
        if base_path and head_path and base_path != head_path:
            path_label = f"{base_path} => {head_path}"
        else:
            path_label = head_path or base_path or document["label"]
        stats.append(
            {
                "path": path_label,
                "label": document["label"],
                "additions": additions,
                "deletions": deletions,
            }
        )

    stats.sort(key=lambda item: (-(item["additions"] + item["deletions"]), item["path"]))
    summary = (
        f"{len(stats)} mirrored documents changed, "
        f"{total_additions} insertions(+), {total_deletions} deletions(-)"
        if stats
        else "No mirrored document changes detected."
    )
    return summary, stats


def parse_headings(lines: list[str]) -> list[dict[str, Any]]:
    headings: list[dict[str, Any]] = []
    stack: dict[int, str] = {}
    for line_number, line in enumerate(lines, start=1):
        match = HEADING_RE.match(line)
        if not match:
            continue
        level = len(match.group(1))
        text = match.group(2).strip()
        stack[level] = text
        for key in list(stack):
            if key > level:
                del stack[key]
        headings.append(
            {
                "line": line_number,
                "level": level,
                "text": text,
                "path": [stack[index] for index in sorted(stack)],
            }
        )
    return headings


def section_for_line(
    lines: list[str],
    headings: list[dict[str, Any]],
    target_line: int,
) -> dict[str, Any]:
    current_heading: dict[str, Any] | None = None
    next_heading_line: int | None = None
    for heading in headings:
        if heading["line"] <= target_line:
            current_heading = heading
            continue
        if current_heading is not None:
            next_heading_line = heading["line"]
            break

    if current_heading is None:
        start_line = max(1, target_line - 3)
        end_line = min(len(lines), target_line + 3)
        path = []
        anchor = ""
    else:
        start_line = current_heading["line"]
        end_line = (next_heading_line - 1) if next_heading_line else len(lines)
        path = current_heading["path"]
        anchor = slugify_heading(current_heading["text"])

    excerpt_start = max(start_line, target_line - 2)
    excerpt_end = min(end_line, target_line + 4)
    excerpt_lines = [line.rstrip() for line in lines[excerpt_start - 1 : excerpt_end]]
    excerpt = "\n".join(line for line in excerpt_lines if line.strip())

    return {
        "heading_path": path,
        "anchor": anchor,
        "section_start_line": start_line,
        "section_end_line": end_line,
        "excerpt_start_line": excerpt_start,
        "excerpt_end_line": excerpt_end,
        "excerpt": excerpt,
    }


def collect_document_sections(
    base_commit: str,
    head_commit: str,
    document: dict[str, Any],
) -> list[dict[str, Any]]:
    candidates = tuple(document["candidates"])
    base_path = resolve_document_path(base_commit, candidates)
    head_path = resolve_document_path(head_commit, candidates)
    if base_path is None and head_path is None:
        return []

    base_lines = git_show_lines(base_commit, base_path) if base_path else []
    head_lines = git_show_lines(head_commit, head_path) if head_path else []
    base_headings = parse_headings(base_lines)
    head_headings = parse_headings(head_lines)
    hunks = parse_hunks(diff_text_for_lines(base_lines, head_lines))
    if not hunks:
        return []

    sections: dict[tuple[str, str, str, str], dict[str, Any]] = {}
    for hunk in hunks:
        old_start = hunk["old_start"]
        old_count = hunk["old_count"]
        new_start = hunk["new_start"]
        new_count = hunk["new_count"]

        if new_count > 0:
            version = "head"
            focus_line = max(new_start, 1)
            focus_lines = head_lines
            focus_headings = head_headings
            if old_count == 0:
                change_type = "added"
                range_end = max(new_start + new_count - 1, focus_line)
            elif old_count > 0:
                change_type = "modified"
                range_end = max(new_start + new_count - 1, focus_line)
            else:
                change_type = "modified"
                range_end = max(new_start + new_count - 1, focus_line)
        else:
            version = "base"
            focus_line = max(old_start, 1)
            focus_lines = base_lines
            focus_headings = base_headings
            change_type = "removed"
            range_end = max(old_start + old_count - 1, focus_line)

        section = section_for_line(focus_lines, focus_headings, focus_line)
        key = (
            head_path or base_path or document["label"],
            version,
            section["anchor"],
            " / ".join(section["heading_path"]) or "__root__",
        )
        entry = sections.get(key)
        line_range = {
            "start": focus_line,
            "end": range_end,
            "change_type": change_type,
        }
        if entry is None:
            sections[key] = {
                "file": head_path or base_path or document["label"],
                "version": version,
                "change_type": change_type,
                "heading_path": section["heading_path"],
                "anchor": section["anchor"],
                "excerpt": section["excerpt"],
                "line_ranges": [line_range],
            }
        else:
            if change_type not in entry["change_type"].split("+"):
                entry["change_type"] = f"{entry['change_type']}+{change_type}"
            entry["line_ranges"].append(line_range)

    return sorted(
        sections.values(),
        key=lambda item: (item["file"], item["heading_path"], item["line_ranges"][0]["start"]),
    )


def score_section(section: dict[str, Any]) -> tuple[int, int, int, str]:
    line_span = sum((row["end"] - row["start"]) + 1 for row in section["line_ranges"])
    return (
        1 if section["version"] == "head" else 0,
        line_span,
        -len(section["heading_path"]),
        section["file"],
    )


def collect_source_sections(base_commit: str, head_commit: str) -> list[dict[str, Any]]:
    sections: list[dict[str, Any]] = []
    for document in REPORT_DOCUMENTS:
        sections.extend(collect_document_sections(base_commit, head_commit, document))
    sections.sort(key=score_section, reverse=True)
    return sections[:12]


def compare_summary(base_upstream: str, head_upstream: str) -> dict[str, Any]:
    payload = gh_json(f"repos/ailev/FPF/compare/{base_upstream}...{head_upstream}")
    commits = []
    for commit in payload.get("commits", []):
        message = commit["commit"]["message"]
        title, _, body = message.partition("\n")
        commits.append(
            {
                "sha": commit["sha"],
                "short_sha": short_sha(commit["sha"]),
                "title": title.strip(),
                "body": body.strip(),
                "author_date": commit["commit"]["author"]["date"],
            }
        )

    files = []
    for file_info in payload.get("files", []):
        files.append(
            {
                "filename": file_info["filename"],
                "status": file_info["status"],
                "additions": file_info["additions"],
                "deletions": file_info["deletions"],
                "changes": file_info["changes"],
            }
        )

    return {
        "status": payload.get("status"),
        "ahead_by": payload.get("ahead_by"),
        "total_commits": len(commits),
        "commits": commits,
        "files": files,
    }


def pair_for_head(ref: str, head_sync: str) -> dict[str, Any]:
    resolved = resolve_commit(head_sync)
    for pair in build_pairs(collect_sync_commits(ref)):
        if pair["head"]["commit"] == resolved:
            return pair
    raise SystemExit(f"No sync pair found for {head_sync}")


def build_context(ref: str, head_sync: str) -> dict[str, Any]:
    pair = pair_for_head(ref, head_sync)
    base_commit = pair["base"]["commit"]
    head_commit = pair["head"]["commit"]

    shortstat, file_stats = document_diff_stats(base_commit, head_commit)
    source_sections = collect_source_sections(base_commit, head_commit)
    upstream_compare = compare_summary(
        pair["base"]["upstream_sha"], pair["head"]["upstream_sha"]
    )

    return {
        "slug": pair["slug"],
        "base_sync_commit": base_commit,
        "head_sync_commit": head_commit,
        "sync_commit": head_commit,
        "sync_committed_at": pair["head"]["committed_at"],
        "upstream_base_sha": pair["base"]["upstream_sha"],
        "upstream_head_sha": pair["head"]["upstream_sha"],
        "upstream_compare": upstream_compare,
        "diff_stats": {
            "summary": shortstat,
            "files": file_stats,
        },
        "source_sections": source_sections,
    }


def command_pending(args: argparse.Namespace) -> None:
    rows = []
    for pair in pending_pairs(args.ref, args.reports_dir):
        rows.append(
            {
                "slug": pair["slug"],
                "base_sync_commit": pair["base"]["commit"],
                "head_sync_commit": pair["head"]["commit"],
                "sync_committed_at": pair["head"]["committed_at"],
                "upstream_base_sha": pair["base"]["upstream_sha"],
                "upstream_head_sha": pair["head"]["upstream_sha"],
            }
        )
    json.dump(rows, sys.stdout, indent=2)
    sys.stdout.write("\n")


def command_context(args: argparse.Namespace) -> None:
    payload = build_context(args.ref, args.head_sync)
    json.dump(payload, sys.stdout, indent=2)
    sys.stdout.write("\n")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ref", default="origin/main", help="Git ref to inspect")
    parser.add_argument(
        "--reports-dir",
        default=REPORTS_DIR,
        type=Path,
        help="Directory containing canonical report JSON files",
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    pending_parser = subparsers.add_parser("pending", help="List pending report pairs")
    pending_parser.set_defaults(func=command_pending)

    context_parser = subparsers.add_parser("context", help="Collect one report context")
    context_parser.add_argument(
        "--head-sync",
        required=True,
        help="Sync commit SHA (or ref) for the report head commit",
    )
    context_parser.set_defaults(func=command_context)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
