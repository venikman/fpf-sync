import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type ReportSection = {
  title: string;
  body: string;
};

type SourceSection = {
  file?: string;
  version?: string;
  change_type?: string;
  heading_path?: string[];
  excerpt?: string;
};

type Report = {
  slug: string;
  published_at: string;
  upstream_base_sha: string;
  upstream_head_sha: string;
  sync_commit: string;
  headline: string;
  summary: string;
  highlights: string[];
  sections: ReportSection[];
  source_sections: SourceSection[];
};

type ManifestEntry = {
  slug: string;
  published_at: string;
  headline: string;
  summary: string;
  upstream_base_sha: string;
  upstream_head_sha: string;
  sync_commit: string;
  path: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const REPORTS_DIR = path.join(REPO_ROOT, 'reports');
const DOCS_DIR = path.join(REPO_ROOT, 'docs');
const STYLE_SOURCE_PATH = path.join(REPO_ROOT, 'theme', 'styles.css');
const SITE_URL = 'https://venikman.github.io/fpf-sync/';
const REPO_URL = 'https://github.com/venikman/fpf-sync';

const REQUIRED_FIELDS = [
  'slug',
  'published_at',
  'upstream_base_sha',
  'upstream_head_sha',
  'sync_commit',
  'headline',
  'summary',
  'highlights',
  'sections',
  'source_sections'
] as const;

function parseIso(value: string): Date {
  return new Date(value);
}

function displayDate(value: string): string {
  const date = parseIso(value);
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(date);
}

function textBlocks(text: string): string[] {
  return text
    .trim()
    .split(/\n\s*\n/u)
    .map((block) => block.trim())
    .filter(Boolean);
}

function firstBlock(text: string): string {
  return textBlocks(text)[0] ?? '';
}

function summaryDescription(text: string, limit = 160): string {
  const description = textBlocks(text)
    .join(' ')
    .replace(/\s+/gu, ' ')
    .trim();

  if (description.length <= limit) {
    return description;
  }

  const rawTruncated = description.slice(0, Math.max(0, limit - 3));
  const snapped = rawTruncated.includes(' ')
    ? rawTruncated.slice(0, rawTruncated.lastIndexOf(' '))
    : rawTruncated;
  return `${snapped.trimEnd()}...`;
}

function escapeText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('{', '&#123;')
    .replaceAll('}', '&#125;');
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function slugifyFragment(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '') || 'section';
}

function cleanHeading(value: string): string {
  return value.replace(/\*+/gu, '').trim();
}

function paragraphHtml(text: string, className?: string): string {
  const classAttribute = className ? ` class="${className}"` : '';
  return textBlocks(text)
    .map((block) => `            <p${classAttribute}>${escapeText(block)}</p>`)
    .join('\n');
}

function siteHeader(homeHref: string, archiveHref: string): string {
  return [
    '    <header class="site-header">',
    '      <div class="site-header__inner">',
    `        <a class="site-brand" href="${escapeAttribute(homeHref)}">FPF Reports</a>`,
    '        <nav class="site-nav" aria-label="Primary">',
    `          <a href="${escapeAttribute(archiveHref)}">Archive</a>`,
    `          <a href="${escapeAttribute(REPO_URL)}">GitHub</a>`,
    '        </nav>',
    '      </div>',
    '    </header>'
  ].join('\n');
}

function footer(): string {
  return [
    '    <footer class="page-footer">',
    '      <div class="page-footer__inner">',
    '        <p class="footer-note">Plain-language reporting for the mirrored FPF repository.</p>',
    `        <p class="footer-note">Source repo: <a href="${escapeAttribute(REPO_URL)}">venikman/fpf-sync</a></p>`,
    '      </div>',
    '    </footer>'
  ].join('\n');
}

function metaPills(items: Array<{ label: string; value: string; monospace?: boolean }>): string {
  return items
    .map(
      ({ label, value, monospace }) => [
        '          <div class="meta-pill">',
        `            <span class="meta-pill__label">${escapeText(label)}</span>`,
        `            <span class="${monospace ? 'meta-pill__value meta-pill__value--mono' : 'meta-pill__value'}">${escapeText(value)}</span>`,
        '          </div>'
      ].join('\n')
    )
    .join('\n');
}

function highlightsBlock(highlights: string[]): string {
  const items =
    highlights.length > 0
      ? highlights.map((item) => `          <li>${escapeText(item)}</li>`).join('\n')
      : '          <li>No highlights recorded.</li>';

  return [
    '      <section class="highlights-block">',
    '        <p class="section-label">In This Update</p>',
    '        <h2>What to expect before you keep reading</h2>',
    '        <ul class="highlight-list">',
    items,
    '        </ul>',
    '      </section>'
  ].join('\n');
}

function storyMap(sections: ReportSection[], prefix: string): string {
  if (sections.length === 0) {
    return '';
  }

  const links = sections
    .map((section, index) => {
      const anchor = `${prefix}-${index + 1}-${slugifyFragment(section.title)}`;
      return `          <a href="#${escapeAttribute(anchor)}">${escapeText(section.title)}</a>`;
    })
    .join('\n');

  return [
    '      <nav class="story-map" aria-label="Section navigation">',
    '        <p class="section-label">Story Map</p>',
    '        <h2 class="story-map__title">Jump to a section</h2>',
    '        <div class="story-map__links">',
    links,
    '        </div>',
    '      </nav>'
  ].join('\n');
}

function storySections(sections: ReportSection[], prefix: string): string {
  if (sections.length === 0) {
    return [
      '      <section class="story-section">',
      '        <span class="section-index">00</span>',
      '        <div class="story-section__content">',
      '          <p class="section-label">Section</p>',
      '          <h2>No sections recorded</h2>',
      '          <div class="story-copy">',
      '            <p>The canonical report JSON does not include article sections yet.</p>',
      '          </div>',
      '        </div>',
      '      </section>'
    ].join('\n');
  }

  return sections
    .map((section, index) => {
      const number = String(index + 1).padStart(2, '0');
      const anchor = `${prefix}-${index + 1}-${slugifyFragment(section.title)}`;
      return [
        `      <section class="story-section" id="${escapeAttribute(anchor)}">`,
        `        <span class="section-index">${number}</span>`,
        '        <div class="story-section__content">',
        `          <p class="section-label">Section ${number}</p>`,
        `          <h2>${escapeText(section.title)}</h2>`,
        '          <div class="story-copy">',
        paragraphHtml(section.body, 'story-copy__paragraph'),
        '          </div>',
        '        </div>',
        '      </section>'
      ].join('\n');
    })
    .join('\n');
}

function traceBlock(report: Report): string {
  return [
    '      <section class="trace-block">',
    '        <details>',
    '          <summary>Source commit details</summary>',
    '          <dl class="trace-list">',
    '            <div>',
    '              <dt>Upstream base</dt>',
    `              <dd>${escapeText(report.upstream_base_sha)}</dd>`,
    '            </div>',
    '            <div>',
    '              <dt>Upstream head</dt>',
    `              <dd>${escapeText(report.upstream_head_sha)}</dd>`,
    '            </div>',
    '            <div>',
    '              <dt>Sync commit</dt>',
    `              <dd>${escapeText(report.sync_commit)}</dd>`,
    '            </div>',
    '          </dl>',
    '        </details>',
    '      </section>'
  ].join('\n');
}

function sourceAppendix(items: SourceSection[]): string {
  const entries =
    items.length > 0
      ? items
          .map((item) => {
            const heading = (item.heading_path ?? []).map((part) => cleanHeading(part)).join(' / ') || 'Document root';
            const excerpt = item.excerpt?.trim()
              ? paragraphHtml(item.excerpt, 'appendix-copy__paragraph')
              : '            <p class="appendix-copy__paragraph">No excerpt captured.</p>';
            return [
              '          <article class="appendix-entry">',
              `            <p class="appendix-file">${escapeText(item.file ?? 'Unknown file')}</p>`,
              `            <p class="appendix-meta">${escapeText((item.change_type ?? 'unknown').replaceAll('_', ' '))} | ${escapeText(item.version ?? 'head')}</p>`,
              `            <h3>${escapeText(heading)}</h3>`,
              '            <div class="appendix-copy">',
              excerpt,
              '            </div>',
              '          </article>'
            ].join('\n');
          })
          .join('\n')
      : [
          '          <article class="appendix-entry">',
          '            <h3>No source sections captured</h3>',
          '            <div class="appendix-copy">',
          '              <p class="appendix-copy__paragraph">The report does not include excerpted source sections.</p>',
          '            </div>',
          '          </article>'
        ].join('\n');

  return [
    '      <section class="appendix" aria-labelledby="evidence-heading">',
    '        <p class="section-label">Evidence Appendix</p>',
    '        <h2 id="evidence-heading">Source sections behind this report</h2>',
    '        <p class="appendix-intro">These excerpts stay after the narrative so the story reads straight through before the supporting evidence appears.</p>',
    '        <div class="appendix-list">',
    entries,
    '        </div>',
    '      </section>'
  ].join('\n');
}

function storyEndLinks(links: Array<{ href: string; label: string }>): string {
  const items = links
    .map(
      ({ href, label }) =>
        `          <a href="${escapeAttribute(href)}">${escapeText(label)}</a>`
    )
    .join('\n');

  return [
    '      <section class="story-end">',
    '        <p class="section-label">Continue Reading</p>',
    '        <div class="story-end-links">',
    items,
    '        </div>',
    '      </section>'
  ].join('\n');
}

function archiveCards(reports: Report[], hrefPrefix: string): string {
  if (reports.length === 0) {
    return [
      '        <article class="archive-card">',
      '          <div class="empty-state">',
      '            <p>No other reports are published yet.</p>',
      '          </div>',
      '        </article>'
    ].join('\n');
  }

  return reports
    .map((report) => {
      const summary = firstBlock(report.summary) || report.summary;
      return [
        '        <article class="archive-card">',
        '          <div class="archive-card__top">',
        `            <p class="archive-card__date">${escapeText(displayDate(report.published_at))}</p>`,
        `            <a class="archive-card__link" href="${escapeAttribute(`${hrefPrefix}${report.slug}/`)}">Open report</a>`,
        '          </div>',
        `          <h3 class="archive-card__title">${escapeText(report.headline)}</h3>`,
        '          <div class="archive-card__summary">',
        paragraphHtml(summary),
        '          </div>',
        '        </article>'
      ].join('\n');
    })
    .join('\n');
}

function storyShell({
  report,
  includeStoryMap,
  archiveHref,
  sectionPrefix,
  latestHref,
  newerHref,
  olderHref
}: {
  report: Report;
  includeStoryMap: boolean;
  archiveHref: string;
  sectionPrefix: string;
  latestHref?: string;
  newerHref?: string;
  olderHref?: string;
}): string {
  const links: Array<{ href: string; label: string }> = [];
  if (latestHref) {
    links.push({ href: latestHref, label: 'Latest story' });
  }
  if (newerHref) {
    links.push({ href: newerHref, label: 'Newer report' });
  }
  if (olderHref) {
    links.push({ href: olderHref, label: 'Older report' });
  }
  links.push({ href: archiveHref, label: 'Browse the archive' });

  return [
    '    <article class="story-shell story-column">',
    includeStoryMap ? storyMap(report.sections, sectionPrefix) : '',
    highlightsBlock(report.highlights),
    '      <div class="story-body">',
    storySections(report.sections, sectionPrefix),
    '      </div>',
    traceBlock(report),
    sourceAppendix(report.source_sections),
    storyEndLinks(links),
    '    </article>'
  ]
    .filter(Boolean)
    .join('\n');
}

function htmlDocument(options: {
  title: string;
  description: string;
  canonical: string;
  cssPath: string;
  body: string;
}): string {
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '  <head>',
    '    <meta charset="utf-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1" />',
    '    <meta name="color-scheme" content="light" />',
    `    <title>${escapeText(options.title)}</title>`,
    `    <meta name="description" content="${escapeAttribute(options.description)}" />`,
    '    <meta property="og:type" content="website" />',
    `    <meta property="og:title" content="${escapeAttribute(options.title)}" />`,
    `    <meta property="og:description" content="${escapeAttribute(options.description)}" />`,
    `    <meta property="og:url" content="${escapeAttribute(options.canonical)}" />`,
    `    <link rel="canonical" href="${escapeAttribute(options.canonical)}" />`,
    `    <link rel="stylesheet" href="${escapeAttribute(options.cssPath)}" />`,
    '  </head>',
    '  <body>',
    options.body,
    '  </body>',
    '</html>',
    ''
  ].join('\n');
}

function renderHomePage(reports: Report[]): string {
  if (reports.length === 0) {
    const body = [
      siteHeader('./', 'archive/'),
      '    <main>',
      '      <section class="hero-band">',
      '        <div class="hero-band__inner">',
      '          <div class="hero-card">',
      '            <p class="kicker">Latest plain-language report</p>',
      '            <h1>No reports published yet</h1>',
      '            <div class="hero-copy">',
      '              <p>The reporting pipeline is configured, but there is no canonical JSON report in <code>reports/</code> yet.</p>',
      '            </div>',
      '          </div>',
      '        </div>',
      '      </section>',
      '      <section class="empty-block story-column">',
      '        <div class="empty-state">',
      '          <p>Add a report under <code>reports/</code>, then rerun <code>bun run build</code> to publish the first story page.</p>',
      '        </div>',
      '      </section>',
      '    </main>',
      footer()
    ].join('\n');

    return htmlDocument({
      title: 'FPF Reports',
      description: 'No plain-language reports have been published yet.',
      canonical: SITE_URL,
      cssPath: 'assets/site.css',
      body
    });
  }

  const latest = reports[0];
  const body = [
    siteHeader('./', 'archive/'),
    '    <main>',
    '      <section class="hero-band">',
    '        <div class="hero-band__inner">',
    '          <div class="hero-card">',
    '            <p class="kicker">Latest plain-language report</p>',
    `            <h1>${escapeText(latest.headline)}</h1>`,
    '            <div class="hero-copy">',
    paragraphHtml(latest.summary),
    '            </div>',
    '            <div class="meta-strip">',
    metaPills([
      { label: 'Published', value: displayDate(latest.published_at) },
      { label: 'Upstream head', value: latest.upstream_head_sha.slice(0, 8), monospace: true },
      { label: 'Reports online', value: String(reports.length) }
    ]),
    '            </div>',
    '            <div class="hero-actions">',
    '              <a class="button-link" href="#latest-story">Read from the top</a>',
    `              <a class="text-link" href="reports/${escapeAttribute(latest.slug)}/">Open the standalone report</a>`,
    '            </div>',
    '          </div>',
    '        </div>',
    '      </section>',
    '      <section id="latest-story" class="story-column">',
    '        <div class="story-header">',
    '          <p class="section-label">Latest Story</p>',
    '          <h2 class="story-header__title">The newest report is published inline on the homepage.</h2>',
    '        </div>',
    '      </section>',
    storyShell({
      report: latest,
      includeStoryMap: false,
      archiveHref: 'archive/',
      sectionPrefix: 'home-section'
    }),
    '      <section class="archive-band wide-column">',
    '        <div class="archive-heading">',
    '          <p class="section-label">Archive</p>',
    '          <h2>Earlier reports stay available below the main story</h2>',
    '        </div>',
    '        <div class="archive-list">',
    archiveCards(reports.slice(1), 'reports/'),
    '        </div>',
    '        <div class="archive-links" style="margin-top: 1rem;">',
    '          <a class="text-link" href="archive/">Browse the full archive</a>',
    '        </div>',
    '      </section>',
    '    </main>',
    footer()
  ].join('\n');

  return htmlDocument({
    title: 'FPF Reports',
    description: summaryDescription(latest.summary),
    canonical: SITE_URL,
    cssPath: 'assets/site.css',
    body
  });
}

function renderArchivePage(reports: Report[]): string {
  const body = [
    siteHeader('../', './'),
    '    <main>',
    '      <section class="hero-band">',
    '        <div class="hero-band__inner">',
    '          <div class="hero-card">',
    '            <p class="kicker">Archive</p>',
    '            <h1>Every published report, newest first.</h1>',
    '            <div class="hero-copy">',
    '              <p>The archive stays secondary to the latest story, but every earlier write-up remains available with the same canonical JSON backing it.</p>',
    '            </div>',
    '          </div>',
    '        </div>',
    '      </section>',
    '      <section class="archive-band wide-column archive-band--raised">',
    '        <div class="archive-list">',
    archiveCards(reports, '../reports/'),
    '        </div>',
    '      </section>',
    '    </main>',
    footer()
  ].join('\n');

  return htmlDocument({
    title: 'FPF Report Archive',
    description: 'Archive of plain-language reports for the mirrored FPF repository.',
    canonical: `${SITE_URL}archive/`,
    cssPath: '../assets/site.css',
    body
  });
}

function renderReportPage(
  report: Report,
  options: { newerReport?: Report; olderReport?: Report }
): string {
  const body = [
    siteHeader('../../', '../../archive/'),
    '    <main>',
    '      <section class="hero-band">',
    '        <div class="hero-band__inner">',
    '          <div class="hero-card">',
    '            <p class="kicker">Plain-language report</p>',
    `            <h1>${escapeText(report.headline)}</h1>`,
    '            <div class="hero-copy">',
    paragraphHtml(report.summary),
    '            </div>',
    '            <div class="meta-strip">',
    metaPills([
      { label: 'Published', value: displayDate(report.published_at) },
      { label: 'Upstream head', value: report.upstream_head_sha.slice(0, 8), monospace: true },
      { label: 'Sync commit', value: report.sync_commit.slice(0, 8), monospace: true }
    ]),
    '            </div>',
    '          </div>',
    '        </div>',
    '      </section>',
    '      <section class="story-column">',
    '        <div class="story-header">',
    '          <p class="section-label"><a class="text-link" href="../../">Latest story</a> / <a class="text-link" href="../../archive/">Archive</a></p>',
    '          <h2 class="story-header__title">Read the report in order, then drop into the source appendix if you need evidence.</h2>',
    '        </div>',
    '      </section>',
    storyShell({
      report,
      includeStoryMap: true,
      archiveHref: '../../archive/',
      sectionPrefix: 'report-section',
      latestHref: '../../',
      newerHref: options.newerReport ? `../${options.newerReport.slug}/` : undefined,
      olderHref: options.olderReport ? `../${options.olderReport.slug}/` : undefined
    }),
    '    </main>',
    footer()
  ].join('\n');

  return htmlDocument({
    title: report.headline,
    description: summaryDescription(report.summary),
    canonical: `${SITE_URL}reports/${report.slug}/`,
    cssPath: '../../assets/site.css',
    body
  });
}

async function writeText(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

async function loadReports(): Promise<Report[]> {
  let entries;
  try {
    entries = await fs.readdir(REPORTS_DIR, { withFileTypes: true });
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return [];
    }
    throw error;
  }

  const reports: Report[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue;
    }

    const reportPath = path.join(REPORTS_DIR, entry.name);
    const parsed = JSON.parse(await fs.readFile(reportPath, 'utf8')) as Partial<Report>;

    for (const field of REQUIRED_FIELDS) {
      if (!(field in parsed)) {
        throw new Error(`${reportPath} is missing required field: ${field}`);
      }
    }
    if (!Array.isArray(parsed.highlights)) {
      throw new Error(`${reportPath}.highlights must be an array`);
    }
    if (!Array.isArray(parsed.sections)) {
      throw new Error(`${reportPath}.sections must be an array`);
    }
    if (!Array.isArray(parsed.source_sections)) {
      throw new Error(`${reportPath}.source_sections must be an array`);
    }

    reports.push(parsed as Report);
  }

  return reports.sort(
    (left, right) =>
      parseIso(right.published_at).getTime() - parseIso(left.published_at).getTime()
  );
}

function buildManifest(reports: Report[]): {
  generated_at: string;
  site_url: string;
  reports: ManifestEntry[];
} {
  return {
    generated_at: new Date().toISOString().replace(/\.\d{3}Z/u, 'Z'),
    site_url: SITE_URL,
    reports: reports.map((report) => ({
      slug: report.slug,
      published_at: report.published_at,
      headline: report.headline,
      summary: report.summary,
      upstream_base_sha: report.upstream_base_sha,
      upstream_head_sha: report.upstream_head_sha,
      sync_commit: report.sync_commit,
      path: `reports/${report.slug}/`
    }))
  };
}

async function renderSite(): Promise<void> {
  const reports = await loadReports();
  await fs.rm(DOCS_DIR, { recursive: true, force: true });
  await fs.mkdir(DOCS_DIR, { recursive: true });

  const siteCss = await fs.readFile(STYLE_SOURCE_PATH, 'utf8');
  await writeText(path.join(DOCS_DIR, 'assets', 'site.css'), siteCss);
  await writeText(path.join(DOCS_DIR, '.nojekyll'), '');
  await writeText(path.join(DOCS_DIR, 'manifest.json'), `${JSON.stringify(buildManifest(reports), null, 2)}\n`);
  await writeText(path.join(DOCS_DIR, 'index.html'), renderHomePage(reports));
  await writeText(path.join(DOCS_DIR, 'archive', 'index.html'), renderArchivePage(reports));

  for (const [index, report] of reports.entries()) {
    await writeText(
      path.join(DOCS_DIR, 'reports', report.slug, 'index.html'),
      renderReportPage(report, {
        newerReport: index > 0 ? reports[index - 1] : undefined,
        olderReport: index + 1 < reports.length ? reports[index + 1] : undefined
      })
    );
  }
}

renderSite().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
