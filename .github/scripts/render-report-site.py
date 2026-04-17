#!/usr/bin/env python3
"""Render a static GitHub Pages site from canonical report JSON files."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import unicodedata
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Any


SCRIPT_PATH = Path(__file__).resolve()
REPO_ROOT = SCRIPT_PATH.parents[2]
REPORTS_DIR = REPO_ROOT / "reports"
DOCS_DIR = REPO_ROOT / "docs"
SITE_URL = "https://venikman.github.io/fpf-sync/"
REPO_URL = "https://github.com/venikman/fpf-sync"

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
  --bg: #f4f0e6;
  --bg-soft: #faf7f1;
  --paper: rgba(255, 252, 247, 0.96);
  --paper-muted: #efe8d8;
  --ink: #18211b;
  --ink-soft: #445149;
  --charcoal: #1f2822;
  --charcoal-soft: #29342d;
  --accent: #3d8a54;
  --accent-strong: #2c6b41;
  --line: rgba(24, 33, 27, 0.12);
  --line-strong: rgba(24, 33, 27, 0.2);
  --shadow: 0 18px 50px rgba(18, 27, 21, 0.08);
  --radius-lg: 28px;
  --radius-md: 18px;
  --radius-sm: 12px;
  --page-width: 72rem;
  --story-width: 46rem;
  --ui: "Avenir Next", "Helvetica Neue", "Segoe UI", sans-serif;
  --serif: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
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
  min-height: 100vh;
  color: var(--ink);
  font-family: var(--serif);
  background:
    radial-gradient(circle at top, rgba(61, 138, 84, 0.12), transparent 30rem),
    linear-gradient(180deg, #faf7f1 0%, #f4f0e6 48%, #ede5d4 100%);
}

a {
  color: inherit;
}

img {
  max-width: 100%;
}

.site-header {
  position: sticky;
  top: 0;
  z-index: 10;
  background: rgba(31, 40, 34, 0.96);
  border-bottom: 1px solid rgba(250, 247, 241, 0.12);
  backdrop-filter: blur(14px);
}

.site-header__inner,
.hero-band__inner,
.wide-column {
  width: min(100% - 1.5rem, var(--page-width));
  margin: 0 auto;
}

.story-column {
  width: min(100% - 1.5rem, var(--story-width));
  margin: 0 auto;
}

.site-header__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.9rem 0 1rem;
  font-family: var(--ui);
}

.site-brand {
  text-decoration: none;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 0.78rem;
  font-weight: 700;
  color: #f8f4eb;
}

.site-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.site-nav a,
.site-nav span {
  text-decoration: none;
  border: 1px solid rgba(250, 247, 241, 0.16);
  border-radius: 999px;
  padding: 0.48rem 0.8rem;
  font-size: 0.82rem;
  color: rgba(248, 244, 235, 0.88);
}

.site-nav a:hover,
.site-nav a:focus-visible {
  border-color: rgba(61, 138, 84, 0.75);
  color: #ffffff;
}

.hero-band {
  padding: 3.4rem 0 5.6rem;
  background:
    radial-gradient(circle at top right, rgba(61, 138, 84, 0.3), transparent 20rem),
    linear-gradient(135deg, var(--charcoal) 0%, var(--charcoal-soft) 100%);
  color: #f9f6ef;
}

.hero-band__inner {
  display: grid;
  gap: 1.35rem;
}

.hero-card {
  width: min(100%, 60rem);
}

.kicker,
.section-label,
.meta-pill__label,
.archive-card__date,
.appendix-meta,
.trace-list dt,
.footer-note {
  font-family: var(--ui);
}

.kicker {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-size: 0.74rem;
  font-weight: 700;
  color: #91c39d;
}

h1,
h2,
h3 {
  margin: 0;
  font-weight: 700;
  line-height: 1.04;
}

h1 {
  font-size: clamp(2.6rem, 5.4vw, 4.95rem);
  max-width: 12ch;
}

h2 {
  font-size: clamp(1.7rem, 3.3vw, 2.55rem);
}

h3 {
  font-size: 1.08rem;
}

.hero-copy,
.story-copy,
.appendix-copy,
.archive-card__summary,
.empty-state {
  color: var(--ink-soft);
  line-height: 1.72;
  font-size: 1.04rem;
}

.hero-copy {
  color: rgba(249, 246, 239, 0.88);
  max-width: 48rem;
}

.hero-copy p,
.story-copy p,
.appendix-copy p,
.archive-card__summary p,
.empty-state p {
  margin: 0;
}

.hero-copy p + p,
.story-copy p + p,
.appendix-copy p + p,
.archive-card__summary p + p,
.empty-state p + p {
  margin-top: 1rem;
}

.meta-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
}

.meta-pill {
  min-width: 10rem;
  padding: 0.95rem 1rem;
  border-radius: var(--radius-sm);
  border: 1px solid rgba(250, 247, 241, 0.12);
  background: rgba(255, 255, 255, 0.08);
}

.meta-pill--light {
  border-color: var(--line);
  background: rgba(61, 138, 84, 0.08);
}

.meta-pill__label {
  display: block;
  font-size: 0.74rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(249, 246, 239, 0.68);
}

.meta-pill--light .meta-pill__label {
  color: var(--ink-soft);
}

.meta-pill__value {
  display: block;
  margin-top: 0.35rem;
  font-family: var(--serif);
  font-size: 1.16rem;
  color: inherit;
}

.meta-pill__value--mono {
  font-family: var(--mono);
  font-size: 0.96rem;
}

.hero-actions,
.story-end-links,
.archive-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.button-link,
.text-link,
.story-end-links a,
.archive-card__link {
  text-decoration: none;
  font-family: var(--ui);
}

.button-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 0.82rem 1.15rem;
  background: var(--accent);
  color: #f9f6ef;
  font-size: 0.92rem;
  font-weight: 700;
}

.button-link:hover,
.button-link:focus-visible {
  background: var(--accent-strong);
}

.text-link,
.story-end-links a,
.archive-card__link {
  color: var(--accent-strong);
  font-size: 0.92rem;
  font-weight: 700;
}

.story-shell {
  position: relative;
  margin: -3.35rem auto 0;
  padding: 2rem 0 0;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
}

.story-shell + .story-shell {
  margin-top: 1.5rem;
}

.story-header {
  display: grid;
  gap: 1.15rem;
  padding: 0 0 2rem;
}

.story-header__title {
  max-width: 16ch;
}

.story-map,
.highlights-block,
.appendix,
.archive-band,
.archive-card,
.empty-block {
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
}

.story-map,
.highlights-block,
.empty-block {
  padding: 1.2rem 1.25rem;
  background: rgba(61, 138, 84, 0.06);
}

.story-map {
  margin-bottom: 1.9rem;
}

.story-map__title,
.highlights-block h2,
.appendix h2,
.archive-heading h2 {
  font-size: 1.3rem;
}

.story-map__links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin-top: 0.85rem;
}

.story-map__links a {
  text-decoration: none;
  font-family: var(--ui);
  font-size: 0.9rem;
  color: var(--accent-strong);
}

.highlights-block {
  margin-bottom: 2rem;
}

.highlight-list {
  margin: 0.9rem 0 0;
  padding-left: 1.15rem;
}

.highlight-list li + li {
  margin-top: 0.55rem;
}

.story-body {
  display: grid;
  gap: 0;
}

.story-section {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 1rem;
  padding: 1.75rem 0;
  border-top: 1px solid var(--line);
}

.story-section:first-child {
  border-top: 0;
  padding-top: 0;
}

.section-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2.5rem;
  height: 2.5rem;
  margin-top: 0.18rem;
  border-radius: 999px;
  background: var(--charcoal);
  color: #f9f6ef;
  font-family: var(--ui);
  font-size: 0.8rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.section-label {
  margin: 0 0 0.55rem;
  color: var(--accent-strong);
  font-size: 0.76rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.story-section h2 {
  max-width: 24ch;
}

.story-section__content {
  display: grid;
  gap: 0.85rem;
}

.trace-block {
  margin-top: 2rem;
  border-top: 1px solid var(--line);
  padding-top: 1.4rem;
}

.trace-block details {
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.58);
  overflow: hidden;
}

.trace-block summary {
  cursor: pointer;
  list-style: none;
  padding: 1rem 1.1rem;
  font-family: var(--ui);
  font-size: 0.92rem;
  font-weight: 700;
}

.trace-block summary::-webkit-details-marker {
  display: none;
}

.trace-list {
  margin: 0;
  padding: 0 1.1rem 1.1rem;
  display: grid;
  gap: 0.9rem;
}

.trace-list div {
  display: grid;
  gap: 0.22rem;
}

.trace-list dt {
  margin: 0;
  font-size: 0.74rem;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  color: var(--ink-soft);
}

.trace-list dd {
  margin: 0;
  font-family: var(--mono);
  font-size: 0.92rem;
  color: var(--ink);
  word-break: break-all;
}

.appendix {
  margin-top: 2.2rem;
  padding: 1.35rem;
  background: rgba(239, 232, 216, 0.64);
}

.appendix-intro {
  margin-top: 0.75rem;
  color: var(--ink-soft);
}

.appendix-list {
  display: grid;
  gap: 1rem;
  margin-top: 1.2rem;
}

.appendix-entry {
  padding-top: 1rem;
  border-top: 1px solid rgba(24, 33, 27, 0.1);
}

.appendix-entry:first-child {
  padding-top: 0;
  border-top: 0;
}

.appendix-file {
  margin: 0;
  font-family: var(--mono);
  font-size: 0.83rem;
  color: var(--accent-strong);
}

.appendix-meta {
  margin: 0.35rem 0 0;
  color: var(--ink-soft);
  font-size: 0.76rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.appendix-copy {
  margin-top: 0.65rem;
}

.story-end {
  margin-top: 2rem;
  padding: 1.3rem 0 0.2rem;
  border-top: 1px solid var(--line);
}

.archive-band {
  margin: 2rem auto 0;
  padding: 1.4rem;
  background: rgba(255, 252, 247, 0.74);
}

.archive-heading {
  display: grid;
  gap: 0.55rem;
  margin-bottom: 1.2rem;
}

.archive-list {
  display: grid;
  gap: 1rem;
}

.archive-card {
  padding: 1.1rem 1.15rem;
  background: rgba(255, 255, 255, 0.72);
}

.archive-card__top {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}

.archive-card__date {
  color: var(--ink-soft);
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.archive-card__title {
  font-size: 1.28rem;
  max-width: 28ch;
}

.archive-card__summary {
  margin-top: 0.75rem;
}

.archive-card__link {
  display: inline-flex;
  margin-top: 0.9rem;
}

.page-footer {
  margin-top: 2.8rem;
  padding: 1.5rem 0 2.5rem;
  background: var(--charcoal);
  color: rgba(249, 246, 239, 0.84);
}

.page-footer__inner {
  display: grid;
  gap: 0.45rem;
  width: min(100% - 1.5rem, var(--page-width));
  margin: 0 auto;
}

.page-footer a {
  color: #9bd0a8;
}

.empty-block {
  margin-top: -2.6rem;
  padding: 1.5rem;
  background: var(--paper);
  box-shadow: var(--shadow);
}

code {
  font-family: var(--mono);
}

@media (max-width: 780px) {
  .hero-band {
    padding-top: 2.4rem;
    padding-bottom: 4.8rem;
  }

  .story-shell {
    margin-top: -2.7rem;
    padding-top: 1.5rem;
  }

  .story-section {
    grid-template-columns: 1fr;
    gap: 0.85rem;
  }

  .section-index {
    width: fit-content;
  }

  .site-header__inner {
    align-items: flex-start;
    flex-direction: column;
  }

  h1 {
    max-width: 14ch;
  }
}
""".strip()


def parse_iso(value: str) -> datetime:
    normalized = value.replace("Z", "+00:00")
    return datetime.fromisoformat(normalized)


def display_date(value: str) -> str:
    dt = parse_iso(value)
    return f"{dt.strftime('%B')} {dt.day}, {dt.year}"


def text_blocks(text: str) -> list[str]:
    return [block.strip() for block in text.strip().split("\n\n") if block.strip()]


def first_block(text: str) -> str:
    blocks = text_blocks(text)
    return blocks[0] if blocks else ""


def slugify_fragment(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii").lower()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_text).strip("-")
    return slug or "section"


def clean_heading(value: str) -> str:
    return re.sub(r"\*+", "", value).strip()


def load_reports(reports_dir: Path) -> list[dict[str, Any]]:
    if not reports_dir.exists():
        return []

    reports: list[dict[str, Any]] = []
    for path in sorted(reports_dir.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
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
    path.write_text(content, encoding="utf-8")


def paragraph_html(text: str, css_class: str | None = None) -> str:
    blocks = text_blocks(text)
    if not blocks:
        return ""
    class_attr = f' class="{css_class}"' if css_class else ""
    return "\n".join(f"<p{class_attr}>{escape(block)}</p>" for block in blocks)


def summary_description(text: str) -> str:
    description = " ".join(block.replace("\n", " ") for block in text_blocks(text))
    return description[:158] + "..." if len(description) > 160 else description


def html_document(
    title: str,
    css_path: str,
    body: str,
    canonical: str | None = None,
    description: str | None = None,
) -> str:
    canonical_tag = (
        f'    <link rel="canonical" href="{escape(canonical)}" />\n' if canonical else ""
    )
    description_tag = (
        f'    <meta name="description" content="{escape(description)}" />\n'
        if description
        else ""
    )
    return f"""<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>{escape(title)}</title>
{description_tag}{canonical_tag}    <link rel="stylesheet" href="{escape(css_path)}" />
  </head>
  <body>
{body}
  </body>
</html>
"""


def render_site_header(home_href: str, archive_href: str) -> str:
    return f"""    <header class="site-header">
      <div class="site-header__inner">
        <a class="site-brand" href="{escape(home_href)}">FPF Reports</a>
        <nav class="site-nav" aria-label="Primary">
          <a href="{escape(archive_href)}">Archive</a>
          <a href="{escape(REPO_URL)}">GitHub</a>
        </nav>
      </div>
    </header>"""


def render_footer() -> str:
    return f"""    <footer class="page-footer">
      <div class="page-footer__inner">
        <p class="footer-note">Plain-language reporting for the mirrored FPF repository.</p>
        <p class="footer-note">Source repo: <a href="{escape(REPO_URL)}">venikman/fpf-sync</a></p>
      </div>
    </footer>"""


def with_section_ids(items: list[dict[str, Any]], prefix: str) -> list[dict[str, Any]]:
    sections: list[dict[str, Any]] = []
    for index, item in enumerate(items, start=1):
        section = dict(item)
        section["_index"] = index
        section["_anchor"] = f"{prefix}-{index}-{slugify_fragment(item['title'])}"
        sections.append(section)
    return sections


def render_meta_pills(items: list[tuple[str, str, bool]], *, light: bool = False) -> str:
    pill_class = "meta-pill meta-pill--light" if light else "meta-pill"
    parts = []
    for label, value, monospace in items:
        value_class = "meta-pill__value meta-pill__value--mono" if monospace else "meta-pill__value"
        parts.append(
            f"""        <div class="{pill_class}">
          <span class="meta-pill__label">{escape(label)}</span>
          <span class="{value_class}">{escape(value)}</span>
        </div>"""
        )
    return "\n".join(parts)


def render_highlights_block(highlights: list[str]) -> str:
    if highlights:
        items = "\n".join(f"          <li>{escape(item)}</li>" for item in highlights)
    else:
        items = "          <li>No highlights recorded.</li>"
    return f"""      <section class="highlights-block">
        <p class="section-label">In this update</p>
        <h2>What to expect before you keep reading</h2>
        <ul class="highlight-list">
{items}
        </ul>
      </section>"""


def render_story_map(sections: list[dict[str, Any]]) -> str:
    if not sections:
        return ""
    links = "\n".join(
        f'          <a href="#{escape(section["_anchor"])}">{escape(section["title"])}</a>'
        for section in sections
    )
    return f"""      <nav class="story-map" aria-label="Section navigation">
        <p class="section-label">Story map</p>
        <h2 class="story-map__title">Jump to a section</h2>
        <div class="story-map__links">
{links}
        </div>
      </nav>"""


def render_story_sections(sections: list[dict[str, Any]]) -> str:
    if not sections:
        return """      <section class="story-section">
        <span class="section-index">00</span>
        <div class="story-section__content">
          <p class="section-label">Section</p>
          <h2>No sections recorded</h2>
          <div class="story-copy">
            <p>The canonical report JSON does not include article sections yet.</p>
          </div>
        </div>
      </section>"""

    parts = []
    for section in sections:
        body = paragraph_html(section["body"], "story-copy__paragraph")
        parts.append(
            f"""      <section class="story-section" id="{escape(section["_anchor"])}">
        <span class="section-index">{section["_index"]:02d}</span>
        <div class="story-section__content">
          <p class="section-label">Section {section["_index"]:02d}</p>
          <h2>{escape(section["title"])}</h2>
          <div class="story-copy">
{body}
          </div>
        </div>
      </section>"""
        )
    return "\n".join(parts)


def render_trace_block(report: dict[str, Any]) -> str:
    return f"""      <section class="trace-block">
        <details>
          <summary>Source commit details</summary>
          <dl class="trace-list">
            <div>
              <dt>Upstream base</dt>
              <dd>{escape(report['upstream_base_sha'])}</dd>
            </div>
            <div>
              <dt>Upstream head</dt>
              <dd>{escape(report['upstream_head_sha'])}</dd>
            </div>
            <div>
              <dt>Sync commit</dt>
              <dd>{escape(report['sync_commit'])}</dd>
            </div>
          </dl>
        </details>
      </section>"""


def render_source_appendix(items: list[dict[str, Any]]) -> str:
    if not items:
        entries = """        <article class="appendix-entry">
          <h3>No source sections captured</h3>
          <div class="appendix-copy">
            <p>The report does not include excerpted source sections.</p>
          </div>
        </article>"""
    else:
        parts = []
        for item in items:
            heading_path = item.get("heading_path") or []
            heading = " / ".join(clean_heading(part) for part in heading_path) or "Document root"
            file_name = item.get("file", "Unknown file")
            change_type = item.get("change_type", "unknown").replace("_", " ")
            version = item.get("version", "head")
            excerpt = paragraph_html(item.get("excerpt", ""), "appendix-copy__paragraph")
            parts.append(
                f"""        <article class="appendix-entry">
          <p class="appendix-file">{escape(file_name)}</p>
          <p class="appendix-meta">{escape(change_type)} | {escape(version)}</p>
          <h3>{escape(heading)}</h3>
          <div class="appendix-copy">
{excerpt}
          </div>
        </article>"""
            )
        entries = "\n".join(parts)
    return f"""      <section class="appendix" aria-labelledby="evidence-heading">
        <p class="section-label">Evidence appendix</p>
        <h2 id="evidence-heading">Source sections behind this report</h2>
        <p class="appendix-intro">These excerpts stay after the narrative so the story reads straight through before the supporting evidence appears.</p>
        <div class="appendix-list">
{entries}
        </div>
      </section>"""


def render_story_end_links(
    *,
    archive_href: str,
    latest_href: str | None = None,
    older_href: str | None = None,
    newer_href: str | None = None,
) -> str:
    links = []
    if latest_href:
        links.append(f'<a href="{escape(latest_href)}">Latest story</a>')
    if newer_href:
        links.append(f'<a href="{escape(newer_href)}">Newer report</a>')
    if older_href:
        links.append(f'<a href="{escape(older_href)}">Older report</a>')
    links.append(f'<a href="{escape(archive_href)}">Browse the archive</a>')
    link_markup = "\n".join(f"          {link}" for link in links)
    return f"""      <section class="story-end">
        <p class="section-label">Continue reading</p>
        <div class="story-end-links">
{link_markup}
        </div>
      </section>"""


def render_archive_cards(reports: list[dict[str, Any]], href_prefix: str) -> str:
    if not reports:
        return """        <article class="archive-card">
          <div class="empty-state">
            <p>No other reports are published yet.</p>
          </div>
        </article>"""

    cards = []
    for report in reports:
        summary = first_block(report["summary"]) or report["summary"]
        cards.append(
            f"""        <article class="archive-card">
          <div class="archive-card__top">
            <p class="archive-card__date">{escape(display_date(report['published_at']))}</p>
            <a class="archive-card__link" href="{escape(href_prefix)}{escape(report['slug'])}/">Open report</a>
          </div>
          <h3 class="archive-card__title">{escape(report['headline'])}</h3>
          <div class="archive-card__summary">
            {paragraph_html(summary)}
          </div>
        </article>"""
        )
    return "\n".join(cards)


def render_story_shell(
    report: dict[str, Any],
    *,
    include_story_map: bool,
    archive_href: str,
    latest_href: str | None = None,
    older_href: str | None = None,
    newer_href: str | None = None,
    section_prefix: str,
) -> str:
    sections = with_section_ids(report.get("sections", []), section_prefix)
    story_map = render_story_map(sections) if include_story_map else ""
    return f"""    <article class="story-shell story-column">
      {story_map}
{render_highlights_block(report.get('highlights', []))}
      <div class="story-body">
{render_story_sections(sections)}
      </div>
{render_trace_block(report)}
{render_source_appendix(report.get('source_sections', []))}
{render_story_end_links(
    archive_href=archive_href,
    latest_href=latest_href,
    older_href=older_href,
    newer_href=newer_href,
)}
    </article>"""


def render_home(reports: list[dict[str, Any]], site_url: str) -> str:
    header = render_site_header("./", "archive/")

    if not reports:
        body = f"""{header}
    <main>
      <section class="hero-band">
        <div class="hero-band__inner">
          <div class="hero-card">
            <p class="kicker">Latest plain-language report</p>
            <h1>No reports published yet</h1>
            <div class="hero-copy">
              <p>The reporting pipeline is configured, but there is no canonical JSON report in <code>reports/</code> yet.</p>
            </div>
          </div>
        </div>
      </section>
      <section class="empty-block story-column">
        <div class="empty-state">
          <p>Add a report under <code>reports/</code>, then rerun <code>.github/scripts/render-report-site.py</code> to publish the first story page.</p>
        </div>
      </section>
    </main>
{render_footer()}"""
        return html_document("FPF Reports", "assets/site.css", body, site_url)

    latest = reports[0]
    older_reports = reports[1:]
    hero_meta = render_meta_pills(
        [
            ("Published", display_date(latest["published_at"]), False),
            ("Upstream head", latest["upstream_head_sha"][:8], True),
            ("Reports online", str(len(reports)), False),
        ]
    )

    archive_band = f"""    <section class="archive-band wide-column">
      <div class="archive-heading">
        <p class="section-label">Archive</p>
        <h2>Earlier reports stay available below the main story</h2>
      </div>
      <div class="archive-list">
{render_archive_cards(older_reports, "reports/")}
      </div>
      <div class="archive-links" style="margin-top: 1rem;">
        <a class="text-link" href="archive/">Browse the full archive</a>
      </div>
    </section>"""

    body = f"""{header}
    <main>
      <section class="hero-band">
        <div class="hero-band__inner">
          <div class="hero-card">
            <p class="kicker">Latest plain-language report</p>
            <h1>{escape(latest['headline'])}</h1>
            <div class="hero-copy">
{paragraph_html(latest['summary'])}
            </div>
            <div class="meta-strip">
{hero_meta}
            </div>
            <div class="hero-actions">
              <a class="button-link" href="#latest-story">Read from the top</a>
              <a class="text-link" href="reports/{escape(latest['slug'])}/">Open the standalone report</a>
            </div>
          </div>
        </div>
      </section>
      <section id="latest-story" class="story-column">
        <div class="story-header">
          <p class="section-label">Latest story</p>
          <h2 class="story-header__title">The newest report is published inline on the homepage.</h2>
        </div>
      </section>
{render_story_shell(
    latest,
    include_story_map=False,
    archive_href="archive/",
    section_prefix="home-section",
)}
{archive_band}
    </main>
{render_footer()}"""
    return html_document(
        "FPF Reports",
        "assets/site.css",
        body,
        site_url,
        summary_description(latest["summary"]),
    )


def render_archive(reports: list[dict[str, Any]], site_url: str) -> str:
    header = render_site_header("../", "./")
    body = f"""{header}
    <main>
      <section class="hero-band">
        <div class="hero-band__inner">
          <div class="hero-card">
            <p class="kicker">Archive</p>
            <h1>Every published report, newest first.</h1>
            <div class="hero-copy">
              <p>The archive stays secondary to the latest story, but every earlier write-up remains available with the same canonical JSON backing it.</p>
            </div>
          </div>
        </div>
      </section>
      <section class="archive-band wide-column" style="margin-top: -3.35rem;">
        <div class="archive-list">
{render_archive_cards(reports, "../reports/")}
        </div>
      </section>
    </main>
{render_footer()}"""
    return html_document(
        "FPF Report Archive",
        "../assets/site.css",
        body,
        f"{site_url}archive/",
        "Archive of plain-language reports for the mirrored FPF repository.",
    )


def render_report_page(
    report: dict[str, Any],
    site_url: str,
    *,
    newer_report: dict[str, Any] | None = None,
    older_report: dict[str, Any] | None = None,
) -> str:
    canonical = f"{site_url}reports/{report['slug']}/"
    header = render_site_header("../../", "../../archive/")
    hero_meta = render_meta_pills(
        [
            ("Published", display_date(report["published_at"]), False),
            ("Upstream head", report["upstream_head_sha"][:8], True),
            ("Sync commit", report["sync_commit"][:8], True),
        ]
    )
    body = f"""{header}
    <main>
      <section class="hero-band">
        <div class="hero-band__inner">
          <div class="hero-card">
            <p class="kicker">Plain-language report</p>
            <h1>{escape(report['headline'])}</h1>
            <div class="hero-copy">
{paragraph_html(report['summary'])}
            </div>
            <div class="meta-strip">
{hero_meta}
            </div>
          </div>
        </div>
      </section>
      <section class="story-column">
        <div class="story-header">
          <p class="section-label"><a class="text-link" href="../../">Latest story</a> / <a class="text-link" href="../../archive/">Archive</a></p>
          <h2 class="story-header__title">Read the report in order, then drop into the source appendix if you need evidence.</h2>
        </div>
      </section>
{render_story_shell(
    report,
    include_story_map=True,
    archive_href="../../archive/",
    latest_href="../../",
    older_href=f"../{older_report['slug']}/" if older_report else None,
    newer_href=f"../{newer_report['slug']}/" if newer_report else None,
    section_prefix="report-section",
)}
    </main>
{render_footer()}"""
    return html_document(
        report["headline"],
        "../../assets/site.css",
        body,
        canonical,
        summary_description(report["summary"]),
    )


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
    for index, report in enumerate(reports):
        newer_report = reports[index - 1] if index > 0 else None
        older_report = reports[index + 1] if index + 1 < len(reports) else None
        write_text(
            reports_root / report["slug"] / "index.html",
            render_report_page(
                report,
                site_url,
                newer_report=newer_report,
                older_report=older_report,
            ),
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
