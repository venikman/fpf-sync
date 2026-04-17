#!/usr/bin/env python3
"""Render a static GitHub Pages site from canonical report JSON files."""

from __future__ import annotations

import argparse
import json
import shutil
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Any


SCRIPT_PATH = Path(__file__).resolve()
REPO_ROOT = SCRIPT_PATH.parents[2]
REPORTS_DIR = REPO_ROOT / "reports"
DOCS_DIR = REPO_ROOT / "docs"
SITE_URL = "https://venikman.github.io/fpf-sync/"

REQUIRED_FIELDS = {
    "slug",
    "published_at",
    "upstream_base_sha",
    "upstream_head_sha",
    "sync_commit",
    "headline",
    "summary",
    "highlights",
    "sections",
    "source_sections",
}

SITE_CSS = """
:root {
  --bg: #f3ebdf;
  --bg-strong: #e6d5bf;
  --paper: rgba(255, 252, 246, 0.9);
  --ink: #201816;
  --muted: #62554f;
  --accent: #8a4322;
  --accent-soft: #c6784c;
  --line: rgba(32, 24, 22, 0.12);
  --shadow: 0 18px 50px rgba(78, 50, 31, 0.12);
  --radius-lg: 26px;
  --radius-md: 18px;
  --content-width: 78rem;
  --serif: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
  --sans: "Avenir Next", "Segoe UI", "Helvetica Neue", sans-serif;
  --mono: "SFMono-Regular", "Berkeley Mono", Consolas, monospace;
}

* {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  color: var(--ink);
  font-family: var(--sans);
  background:
    radial-gradient(circle at top left, rgba(198, 120, 76, 0.22), transparent 28rem),
    radial-gradient(circle at bottom right, rgba(96, 56, 40, 0.12), transparent 24rem),
    linear-gradient(180deg, #f8f2e7 0%, var(--bg) 52%, #efe3d2 100%);
  min-height: 100vh;
}

a {
  color: inherit;
}

.site-shell {
  width: min(100% - 2rem, var(--content-width));
  margin: 0 auto;
  padding: 2rem 0 4rem;
}

.hero,
.panel,
.report-card {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
  backdrop-filter: blur(10px);
}

.hero {
  padding: 2.4rem;
  position: relative;
  overflow: hidden;
}

.hero::after {
  content: "";
  position: absolute;
  inset: auto -6rem -6rem auto;
  width: 18rem;
  height: 18rem;
  background: radial-gradient(circle, rgba(138, 67, 34, 0.18), transparent 70%);
}

.eyebrow {
  margin: 0 0 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.76rem;
  color: var(--accent);
  font-weight: 700;
}

h1,
h2,
h3 {
  margin: 0;
  font-family: var(--serif);
  font-weight: 700;
  line-height: 1.02;
}

h1 {
  font-size: clamp(2.5rem, 5vw, 4.8rem);
  max-width: 14ch;
}

h2 {
  font-size: clamp(1.7rem, 3vw, 2.4rem);
}

h3 {
  font-size: 1.18rem;
}

.lede,
.summary,
.section-body,
.source-excerpt,
.meta-copy {
  color: var(--muted);
  line-height: 1.7;
  font-size: 1.03rem;
}

.lede {
  max-width: 56rem;
  margin-top: 1rem;
}

.hero-actions,
.top-nav,
.chip-row,
.stat-row,
.report-grid,
.section-grid,
.source-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.9rem;
}

.top-nav {
  margin-bottom: 1rem;
  align-items: center;
  justify-content: space-between;
}

.nav-link,
.button-link {
  text-decoration: none;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0.62rem 0.95rem;
  background: rgba(255, 255, 255, 0.72);
}

.button-link {
  background: var(--ink);
  color: #fff9f0;
  border-color: transparent;
}

.layout {
  display: grid;
  gap: 1.2rem;
  margin-top: 1.2rem;
}

.layout.two-up {
  grid-template-columns: 2.2fr 1fr;
}

.panel {
  padding: 1.45rem;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.45rem 0.72rem;
  border-radius: 999px;
  background: rgba(138, 67, 34, 0.08);
  color: var(--accent);
  font-size: 0.88rem;
  font-weight: 700;
}

.stat {
  min-width: 12rem;
  padding: 0.9rem 1rem;
  border-radius: var(--radius-md);
  background: rgba(230, 213, 191, 0.45);
  border: 1px solid rgba(138, 67, 34, 0.08);
}

.stat-label {
  color: var(--muted);
  font-size: 0.84rem;
  margin-bottom: 0.35rem;
}

.stat-value {
  font-family: var(--serif);
  font-size: 1.2rem;
}

.report-card {
  padding: 1.35rem;
  display: grid;
  gap: 0.8rem;
}

.report-card a {
  text-decoration: none;
}

.report-card-head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: baseline;
}

.meta-list {
  display: grid;
  gap: 0.85rem;
}

.meta-row {
  display: grid;
  gap: 0.18rem;
}

.meta-label {
  font-size: 0.82rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
}

.meta-value {
  font-family: var(--mono);
  font-size: 0.94rem;
  word-break: break-all;
}

ul {
  padding-left: 1.2rem;
  margin: 0;
}

li + li {
  margin-top: 0.5rem;
}

.section-grid,
.source-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr));
  gap: 1rem;
}

.section-card,
.source-card {
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  padding: 1rem;
  background: rgba(255, 255, 255, 0.55);
}

.source-path {
  font-family: var(--mono);
  font-size: 0.83rem;
  color: var(--accent);
  word-break: break-word;
}

.source-excerpt {
  margin-top: 0.7rem;
  white-space: pre-wrap;
  font-size: 0.96rem;
}

.footer {
  margin-top: 1.4rem;
  color: var(--muted);
  font-size: 0.92rem;
}

@media (max-width: 860px) {
  .layout.two-up {
    grid-template-columns: 1fr;
  }

  .site-shell {
    width: min(100% - 1rem, var(--content-width));
    padding-top: 1rem;
  }

  .hero,
  .panel,
  .report-card {
    border-radius: 22px;
  }
}
""".strip()


def parse_iso(value: str) -> datetime:
    normalized = value.replace("Z", "+00:00")
    return datetime.fromisoformat(normalized)


def load_reports(reports_dir: Path) -> list[dict[str, Any]]:
    if not reports_dir.exists():
        return []

    reports: list[dict[str, Any]] = []
    for path in sorted(reports_dir.glob("*.json")):
        data = json.loads(path.read_text())
        missing = REQUIRED_FIELDS - data.keys()
        if missing:
            missing_fields = ", ".join(sorted(missing))
            raise SystemExit(f"{path} is missing required fields: {missing_fields}")
        data["_path"] = path
        reports.append(data)

    reports.sort(key=lambda item: parse_iso(item["published_at"]), reverse=True)
    return reports


def ensure_clean_output(docs_dir: Path) -> None:
    docs_dir.mkdir(parents=True, exist_ok=True)
    for relative in ("archive", "reports", "assets"):
        shutil.rmtree(docs_dir / relative, ignore_errors=True)


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


def html_document(title: str, css_path: str, body: str, canonical: str | None = None) -> str:
    canonical_tag = (
        f'    <link rel="canonical" href="{escape(canonical)}" />\n' if canonical else ""
    )
    return f"""<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{escape(title)}</title>
{canonical_tag}    <link rel="stylesheet" href="{escape(css_path)}" />
  </head>
  <body>
{body}
  </body>
</html>
"""


def paragraphs(text: str) -> str:
    blocks = [block.strip() for block in text.strip().split("\n\n") if block.strip()]
    return "\n".join(f'          <p>{escape(block)}</p>' for block in blocks)


def render_report_card(report: dict[str, Any], href: str) -> str:
    return f"""        <article class="report-card">
          <div class="report-card-head">
            <div>
              <p class="eyebrow">Report</p>
              <h3><a href="{escape(href)}">{escape(report['headline'])}</a></h3>
            </div>
            <span class="chip">{escape(report['published_at'][:10])}</span>
          </div>
          <div class="summary">
{paragraphs(report['summary'])}
          </div>
        </article>"""


def render_home(reports: list[dict[str, Any]], site_url: str) -> str:
    latest = reports[0] if reports else None
    latest_markup = ""
    archive_markup = ""
    stats_markup = ""

    if latest:
        stats_markup = f"""      <div class="stat-row">
        <div class="stat">
          <div class="stat-label">Published</div>
          <div class="stat-value">{escape(latest['published_at'][:10])}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Upstream head</div>
          <div class="stat-value">{escape(latest['upstream_head_sha'][:8])}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Reports online</div>
          <div class="stat-value">{len(reports)}</div>
        </div>
      </div>"""
        latest_markup = f"""      <section class="panel">
        <p class="eyebrow">Latest report</p>
        <h2>{escape(latest['headline'])}</h2>
        <div class="summary">
{paragraphs(latest['summary'])}
        </div>
        <div class="hero-actions">
          <a class="button-link" href="reports/{escape(latest['slug'])}/">Read the full report</a>
          <a class="nav-link" href="archive/">Browse the archive</a>
        </div>
      </section>"""
        archive_cards = [
            render_report_card(report, f"reports/{report['slug']}/")
            for report in reports[1:4]
        ]
        archive_markup = (
            "\n".join(archive_cards)
            if archive_cards
            else '        <article class="report-card"><p class="summary">No older reports yet.</p></article>'
        )
    else:
        latest_markup = """      <section class="panel">
        <p class="eyebrow">Latest report</p>
        <h2>No reports published yet</h2>
        <p class="summary">The reporting automation is configured, but there is no published report in <code>reports/</code> yet.</p>
      </section>"""
        archive_markup = """        <article class="report-card"><p class="summary">No archive entries yet.</p></article>"""

    body = f"""    <main class="site-shell">
      <section class="hero">
        <p class="eyebrow">FPF watch</p>
        <h1>Plain-language updates for the mirrored FPF repo.</h1>
        <p class="lede">Each report translates the latest upstream FPF changes into practical English, with source references back to the mirrored repository.</p>
{stats_markup}
      </section>
      <div class="layout two-up">
{latest_markup}
        <section class="panel">
          <p class="eyebrow">Recent archive</p>
          <div class="report-grid">
{archive_markup}
          </div>
        </section>
      </div>
      <p class="footer">Source repo: <a href="{escape(site_url.replace('https://venikman.github.io/fpf-sync/', 'https://github.com/venikman/fpf-sync'))}">venikman/fpf-sync</a></p>
    </main>"""
    return html_document("FPF Reports", "assets/site.css", body, site_url)


def render_archive(reports: list[dict[str, Any]], site_url: str) -> str:
    cards = [
        render_report_card(report, f"../reports/{report['slug']}/") for report in reports
    ]
    card_markup = (
        "\n".join(cards)
        if cards
        else '        <article class="report-card"><p class="summary">No reports published yet.</p></article>'
    )
    body = f"""    <main class="site-shell">
      <div class="top-nav">
        <a class="nav-link" href="../">Home</a>
      </div>
      <section class="hero">
        <p class="eyebrow">Archive</p>
        <h1>All published FPF reports.</h1>
        <p class="lede">Newest first. Every entry links to the full write-up and keeps the canonical JSON report in sync.</p>
      </section>
      <section class="panel" style="margin-top: 1.2rem;">
        <div class="report-grid">
{card_markup}
        </div>
      </section>
    </main>"""
    return html_document("FPF Report Archive", "../assets/site.css", body, f"{site_url}archive/")


def render_section_cards(items: list[dict[str, Any]]) -> str:
    if not items:
        return '          <div class="section-card"><p class="summary">No sections recorded.</p></div>'
    parts = []
    for item in items:
        parts.append(
            f"""          <article class="section-card">
            <h3>{escape(item['title'])}</h3>
            <div class="section-body">
{paragraphs(item['body'])}
            </div>
          </article>"""
        )
    return "\n".join(parts)


def render_source_cards(items: list[dict[str, Any]]) -> str:
    if not items:
        return '          <div class="source-card"><p class="summary">No source sections captured.</p></div>'
    parts = []
    for item in items:
        heading = " / ".join(item.get("heading_path") or []) or "Document root"
        parts.append(
            f"""          <article class="source-card">
            <p class="source-path">{escape(item['file'])}</p>
            <h3>{escape(heading)}</h3>
            <p class="meta-copy">Captured from the {escape(item.get('version', 'head'))} version; change type: {escape(item.get('change_type', 'unknown'))}.</p>
            <div class="source-excerpt">{escape(item.get('excerpt', ''))}</div>
          </article>"""
        )
    return "\n".join(parts)


def render_report_page(report: dict[str, Any], site_url: str) -> str:
    canonical = f"{site_url}reports/{report['slug']}/"
    highlights = "\n".join(
        f"            <li>{escape(item)}</li>" for item in report.get("highlights", [])
    )
    if not highlights:
        highlights = "            <li>No highlights recorded.</li>"

    body = f"""    <main class="site-shell">
      <div class="top-nav">
        <a class="nav-link" href="../../">Home</a>
        <a class="nav-link" href="../../archive/">Archive</a>
      </div>
      <section class="hero">
        <p class="eyebrow">Plain-language report</p>
        <h1>{escape(report['headline'])}</h1>
        <div class="chip-row" style="margin-top: 1rem;">
          <span class="chip">{escape(report['published_at'][:10])}</span>
          <span class="chip">Upstream {escape(report['upstream_head_sha'][:8])}</span>
          <span class="chip">Sync {escape(report['sync_commit'][:8])}</span>
        </div>
        <div class="summary" style="margin-top: 1rem;">
{paragraphs(report['summary'])}
        </div>
      </section>
      <div class="layout two-up">
        <section class="panel">
          <p class="eyebrow">What changed</p>
          <div class="section-grid">
{render_section_cards(report.get('sections', []))}
          </div>
        </section>
        <aside class="panel">
          <p class="eyebrow">Quick scan</p>
          <ul>
{highlights}
          </ul>
          <div class="meta-list" style="margin-top: 1.1rem;">
            <div class="meta-row">
              <span class="meta-label">Upstream base</span>
              <span class="meta-value">{escape(report['upstream_base_sha'])}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">Upstream head</span>
              <span class="meta-value">{escape(report['upstream_head_sha'])}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">Sync commit</span>
              <span class="meta-value">{escape(report['sync_commit'])}</span>
            </div>
          </div>
        </aside>
      </div>
      <section class="panel" style="margin-top: 1.2rem;">
        <p class="eyebrow">Source sections</p>
        <div class="source-grid">
{render_source_cards(report.get('source_sections', []))}
        </div>
      </section>
    </main>"""
    return html_document(report["headline"], "../../assets/site.css", body, canonical)


def render_manifest(reports: list[dict[str, Any]], site_url: str) -> str:
    payload = {
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "site_url": site_url,
        "reports": [
            {
                "slug": report["slug"],
                "published_at": report["published_at"],
                "headline": report["headline"],
                "summary": report["summary"],
                "upstream_base_sha": report["upstream_base_sha"],
                "upstream_head_sha": report["upstream_head_sha"],
                "sync_commit": report["sync_commit"],
                "path": f"reports/{report['slug']}/",
            }
            for report in reports
        ],
    }
    return json.dumps(payload, indent=2) + "\n"


def render_site(reports_dir: Path, docs_dir: Path, site_url: str) -> None:
    reports = load_reports(reports_dir)
    ensure_clean_output(docs_dir)

    write_text(docs_dir / "assets" / "site.css", SITE_CSS + "\n")
    write_text(docs_dir / ".nojekyll", "")
    write_text(docs_dir / "index.html", render_home(reports, site_url))
    write_text(docs_dir / "archive" / "index.html", render_archive(reports, site_url))
    write_text(docs_dir / "manifest.json", render_manifest(reports, site_url))

    reports_root = docs_dir / "reports"
    for report in reports:
        write_text(
            reports_root / report["slug"] / "index.html",
            render_report_page(report, site_url),
        )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reports-dir", default=str(REPORTS_DIR))
    parser.add_argument("--docs-dir", default=str(DOCS_DIR))
    parser.add_argument("--site-url", default=SITE_URL)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    render_site(Path(args.reports_dir), Path(args.docs_dir), args.site_url)


if __name__ == "__main__":
    main()
