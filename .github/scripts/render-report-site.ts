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
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const REPORTS_DIR = path.join(REPO_ROOT, 'reports');
const SITE_DIR = path.join(REPO_ROOT, '.site');
const PUBLIC_DIR = path.join(SITE_DIR, 'public');
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
  return new Date(value.replace('Z', '+00:00'));
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

function summaryDescription(text: string): string {
  const description = textBlocks(text)
    .join(' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return description.length > 160 ? `${description.slice(0, 157)}...` : description;
}

function escapeText(value: string): string {
  return value
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

function yamlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
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

function frontmatter({
  title,
  description
}: {
  title: string;
  description: string;
}): string {
  return [
    '---',
    `title: ${yamlString(title)}`,
    `description: ${yamlString(description)}`,
    'pageType: blank',
    '---',
    ''
  ].join('\n');
}

function renderHead(title: string, canonical: string): string {
  return [
    "import { Head } from '@rspress/core/runtime';",
    '',
    '<Head>',
    `  <title>${escapeText(title)}</title>`,
    `  <meta property="og:title" content="${escapeAttribute(title)}" />`,
    `  <meta property="og:url" content="${escapeAttribute(canonical)}" />`,
    `  <link rel="canonical" href="${escapeAttribute(canonical)}" />`,
    '</Head>',
    ''
  ].join('\n');
}

function renderParagraphs(text: string, className?: string): string {
  const classAttribute = className ? ` className="${className}"` : '';
  return textBlocks(text)
    .map((block) => `<p${classAttribute}>${escapeText(block)}</p>`)
    .join('\n');
}

function renderSiteHeader(homeHref: string, archiveHref: string): string {
  return [
    '<header className="site-header">',
    '  <div className="site-header__inner">',
    `    <a className="site-brand" href="${escapeAttribute(homeHref)}">FPF Reports</a>`,
    '    <nav className="site-nav" aria-label="Primary">',
    `      <a href="${escapeAttribute(archiveHref)}">Archive</a>`,
    `      <a href="${escapeAttribute(REPO_URL)}">GitHub</a>`,
    '    </nav>',
    '  </div>',
    '</header>'
  ].join('\n');
}

function renderFooter(): string {
  return [
    '<footer className="page-footer">',
    '  <div className="page-footer__inner">',
    '    <p className="footer-note">Plain-language reporting for the mirrored FPF repository.</p>',
    `    <p className="footer-note">Source repo: <a href="${escapeAttribute(REPO_URL)}">venikman/fpf-sync</a></p>`,
    '  </div>',
    '</footer>'
  ].join('\n');
}

function renderMetaPills(
  items: Array<{ label: string; value: string; monospace?: boolean }>
): string {
  return items
    .map(
      ({ label, value, monospace }) => [
        '        <div className="meta-pill">',
        `          <span className="meta-pill__label">${escapeText(label)}</span>`,
        `          <span className="${monospace ? 'meta-pill__value meta-pill__value--mono' : 'meta-pill__value'}">${escapeText(value)}</span>`,
        '        </div>'
      ].join('\n')
    )
    .join('\n');
}

function renderHighlightsBlock(highlights: string[]): string {
  const items =
    highlights.length > 0
      ? highlights
          .map((item) => `          <li>${escapeText(item)}</li>`)
          .join('\n')
      : '          <li>No highlights recorded.</li>';

  return [
    '      <section className="highlights-block">',
    '        <p className="section-label">In this update</p>',
    '        <h2>What to expect before you keep reading</h2>',
    '        <ul className="highlight-list">',
    items,
    '        </ul>',
    '      </section>'
  ].join('\n');
}

function renderStoryMap(sections: ReportSection[], prefix: string): string {
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
    '      <nav className="story-map" aria-label="Section navigation">',
    '        <p className="section-label">Story map</p>',
    '        <h2 className="story-map__title">Jump to a section</h2>',
    '        <div className="story-map__links">',
    links,
    '        </div>',
    '      </nav>'
  ].join('\n');
}

function renderStorySections(sections: ReportSection[], prefix: string): string {
  if (sections.length === 0) {
    return [
      '      <section className="story-section">',
      '        <span className="section-index">00</span>',
      '        <div className="story-section__content">',
      '          <p className="section-label">Section</p>',
      '          <h2>No sections recorded</h2>',
      '          <div className="story-copy">',
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
        `      <section className="story-section" id="${escapeAttribute(anchor)}">`,
        `        <span className="section-index">${number}</span>`,
        '        <div className="story-section__content">',
        `          <p className="section-label">Section ${number}</p>`,
        `          <h2>${escapeText(section.title)}</h2>`,
        '          <div className="story-copy">',
        renderParagraphs(section.body, 'story-copy__paragraph'),
        '          </div>',
        '        </div>',
        '      </section>'
      ].join('\n');
    })
    .join('\n');
}

function renderTraceBlock(report: Report): string {
  return [
    '      <section className="trace-block">',
    '        <details>',
    '          <summary>Source commit details</summary>',
    '          <dl className="trace-list">',
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

function renderSourceAppendix(items: SourceSection[]): string {
  const entries =
    items.length > 0
      ? items
          .map((item) => {
            const heading = (item.heading_path ?? [])
              .map((part) => cleanHeading(part))
              .join(' / ') || 'Document root';
            const excerpt = item.excerpt?.trim()
              ? renderParagraphs(item.excerpt, 'appendix-copy__paragraph')
              : '<p className="appendix-copy__paragraph">No excerpt captured.</p>';
            return [
              '        <article className="appendix-entry">',
              `          <p className="appendix-file">${escapeText(item.file ?? 'Unknown file')}</p>`,
              `          <p className="appendix-meta">${escapeText((item.change_type ?? 'unknown').replaceAll('_', ' '))} | ${escapeText(item.version ?? 'head')}</p>`,
              `          <h3>${escapeText(heading)}</h3>`,
              '          <div className="appendix-copy">',
              excerpt,
              '          </div>',
              '        </article>'
            ].join('\n');
          })
          .join('\n')
      : [
          '        <article className="appendix-entry">',
          '          <h3>No source sections captured</h3>',
          '          <div className="appendix-copy">',
          '            <p className="appendix-copy__paragraph">The report does not include excerpted source sections.</p>',
          '          </div>',
          '        </article>'
        ].join('\n');

  return [
    '      <section className="appendix" aria-labelledby="evidence-heading">',
    '        <p className="section-label">Evidence appendix</p>',
    '        <h2 id="evidence-heading">Source sections behind this report</h2>',
    '        <p className="appendix-intro">These excerpts stay after the narrative so the story reads straight through before the supporting evidence appears.</p>',
    '        <div className="appendix-list">',
    entries,
    '        </div>',
    '      </section>'
  ].join('\n');
}

function renderStoryEndLinks(links: Array<{ href: string; label: string }>): string {
  const linkMarkup = links
    .map(
      ({ href, label }) =>
        `          <a href="${escapeAttribute(href)}">${escapeText(label)}</a>`
    )
    .join('\n');

  return [
    '      <section className="story-end">',
    '        <p className="section-label">Continue reading</p>',
    '        <div className="story-end-links">',
    linkMarkup,
    '        </div>',
    '      </section>'
  ].join('\n');
}

function renderArchiveCards(reports: Report[], hrefPrefix: string): string {
  if (reports.length === 0) {
    return [
      '        <article className="archive-card">',
      '          <div className="empty-state">',
      '            <p>No other reports are published yet.</p>',
      '          </div>',
      '        </article>'
    ].join('\n');
  }

  return reports
    .map((report) => {
      const summary = firstBlock(report.summary) || report.summary;
      return [
        '        <article className="archive-card">',
        '          <div className="archive-card__top">',
        `            <p className="archive-card__date">${escapeText(displayDate(report.published_at))}</p>`,
        `            <a className="archive-card__link" href="${escapeAttribute(`${hrefPrefix}${report.slug}/`)}">Open report</a>`,
        '          </div>',
        `          <h3 className="archive-card__title">${escapeText(report.headline)}</h3>`,
        '          <div className="archive-card__summary">',
        renderParagraphs(summary),
        '          </div>',
        '        </article>'
      ].join('\n');
    })
    .join('\n');
}

function renderStoryShell({
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
    '<article className="story-shell story-column">',
    includeStoryMap ? renderStoryMap(report.sections, sectionPrefix) : '',
    renderHighlightsBlock(report.highlights),
    '      <div className="story-body">',
    renderStorySections(report.sections, sectionPrefix),
    '      </div>',
    renderTraceBlock(report),
    renderSourceAppendix(report.source_sections),
    renderStoryEndLinks(links),
    '</article>'
  ]
    .filter(Boolean)
    .join('\n');
}

function renderHomePage(reports: Report[]): string {
  if (reports.length === 0) {
    return [
      frontmatter({
        title: 'FPF Reports',
        description: 'No plain-language reports have been published yet.'
      }),
      renderHead('FPF Reports', SITE_URL),
      renderSiteHeader('./', 'archive/'),
      '<main>',
      '  <section className="hero-band">',
      '    <div className="hero-band__inner">',
      '      <div className="hero-card">',
      '        <p className="kicker">Latest plain-language report</p>',
      '        <h1>No reports published yet</h1>',
      '        <div className="hero-copy">',
      '          <p>The reporting pipeline is configured, but there is no canonical JSON report in <code>reports/</code> yet.</p>',
      '        </div>',
      '      </div>',
      '    </div>',
      '  </section>',
      '  <section className="empty-block story-column">',
      '    <div className="empty-state">',
      '      <p>Add a report under <code>reports/</code>, then rerun <code>npm run build</code> to publish the first story page.</p>',
      '    </div>',
      '  </section>',
      '</main>',
      renderFooter(),
      ''
    ].join('\n');
  }

  const latest = reports[0];
  const archiveBand = [
    '<section className="archive-band wide-column">',
    '  <div className="archive-heading">',
    '    <p className="section-label">Archive</p>',
    '    <h2>Earlier reports stay available below the main story</h2>',
    '  </div>',
    '  <div className="archive-list">',
    renderArchiveCards(reports.slice(1), 'reports/'),
    '  </div>',
    '  <div className="archive-links" style={{ marginTop: \'1rem\' }}>',
    '    <a className="text-link" href="archive/">Browse the full archive</a>',
    '  </div>',
    '</section>'
  ].join('\n');

  return [
    frontmatter({
      title: 'FPF Reports',
      description: summaryDescription(latest.summary)
    }),
    renderHead('FPF Reports', SITE_URL),
    renderSiteHeader('./', 'archive/'),
    '<main>',
    '  <section className="hero-band">',
    '    <div className="hero-band__inner">',
    '      <div className="hero-card">',
    '        <p className="kicker">Latest plain-language report</p>',
    `        <h1>${escapeText(latest.headline)}</h1>`,
    '        <div className="hero-copy">',
    renderParagraphs(latest.summary),
    '        </div>',
    '        <div className="meta-strip">',
    renderMetaPills([
      { label: 'Published', value: displayDate(latest.published_at) },
      { label: 'Upstream head', value: latest.upstream_head_sha.slice(0, 8), monospace: true },
      { label: 'Reports online', value: String(reports.length) }
    ]),
    '        </div>',
    '        <div className="hero-actions">',
    '          <a className="button-link" href="#latest-story">Read from the top</a>',
    `          <a className="text-link" href="reports/${escapeAttribute(latest.slug)}/">Open the standalone report</a>`,
    '        </div>',
    '      </div>',
    '    </div>',
    '  </section>',
    '  <section id="latest-story" className="story-column">',
    '    <div className="story-header">',
    '      <p className="section-label">Latest story</p>',
    '      <h2 className="story-header__title">The newest report is published inline on the homepage.</h2>',
    '    </div>',
    '  </section>',
    renderStoryShell({
      report: latest,
      includeStoryMap: false,
      archiveHref: 'archive/',
      sectionPrefix: 'home-section'
    }),
    archiveBand,
    '</main>',
    renderFooter(),
    ''
  ].join('\n');
}

function renderArchivePage(reports: Report[]): string {
  return [
    frontmatter({
      title: 'FPF Report Archive',
      description: 'Archive of plain-language reports for the mirrored FPF repository.'
    }),
    renderHead('FPF Report Archive', `${SITE_URL}archive/`),
    renderSiteHeader('../', './'),
    '<main>',
    '  <section className="hero-band">',
    '    <div className="hero-band__inner">',
    '      <div className="hero-card">',
    '        <p className="kicker">Archive</p>',
    '        <h1>Every published report, newest first.</h1>',
    '        <div className="hero-copy">',
    '          <p>The archive stays secondary to the latest story, but every earlier write-up remains available with the same canonical JSON backing it.</p>',
    '        </div>',
    '      </div>',
    '    </div>',
    '  </section>',
    '  <section className="archive-band wide-column archive-band--raised">',
    '    <div className="archive-list">',
    renderArchiveCards(reports, '../reports/'),
    '    </div>',
    '  </section>',
    '</main>',
    renderFooter(),
    ''
  ].join('\n');
}

function renderReportPage(
  report: Report,
  options: {
    newerReport?: Report;
    olderReport?: Report;
  }
): string {
  return [
    frontmatter({
      title: report.headline,
      description: summaryDescription(report.summary)
    }),
    renderHead(report.headline, `${SITE_URL}reports/${report.slug}/`),
    renderSiteHeader('../../', '../../archive/'),
    '<main>',
    '  <section className="hero-band">',
    '    <div className="hero-band__inner">',
    '      <div className="hero-card">',
    '        <p className="kicker">Plain-language report</p>',
    `        <h1>${escapeText(report.headline)}</h1>`,
    '        <div className="hero-copy">',
    renderParagraphs(report.summary),
    '        </div>',
    '        <div className="meta-strip">',
    renderMetaPills([
      { label: 'Published', value: displayDate(report.published_at) },
      { label: 'Upstream head', value: report.upstream_head_sha.slice(0, 8), monospace: true },
      { label: 'Sync commit', value: report.sync_commit.slice(0, 8), monospace: true }
    ]),
    '        </div>',
    '      </div>',
    '    </div>',
    '  </section>',
    '  <section className="story-column">',
    '    <div className="story-header">',
    '      <p className="section-label"><a className="text-link" href="../../">Latest story</a> / <a className="text-link" href="../../archive/">Archive</a></p>',
    '      <h2 className="story-header__title">Read the report in order, then drop into the source appendix if you need evidence.</h2>',
    '    </div>',
    '  </section>',
    renderStoryShell({
      report,
      includeStoryMap: true,
      archiveHref: '../../archive/',
      sectionPrefix: 'report-section',
      latestHref: '../../',
      newerHref: options.newerReport ? `../${options.newerReport.slug}/` : undefined,
      olderHref: options.olderReport ? `../${options.olderReport.slug}/` : undefined
    }),
    '</main>',
    renderFooter(),
    ''
  ].join('\n');
}

async function writeText(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

async function loadReports(): Promise<Report[]> {
  const entries = await fs.readdir(REPORTS_DIR, { withFileTypes: true });
  const reports: Report[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue;
    }

    const reportPath = path.join(REPORTS_DIR, entry.name);
    const raw = await fs.readFile(reportPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<Report>;

    for (const field of REQUIRED_FIELDS) {
      if (!(field in parsed)) {
        throw new Error(`${reportPath} is missing required field: ${field}`);
      }
    }

    reports.push(parsed as Report);
  }

  return reports.sort(
    (left, right) =>
      parseIso(right.published_at).getTime() - parseIso(left.published_at).getTime()
  );
}

async function ensureCleanSiteDir(): Promise<void> {
  await fs.rm(SITE_DIR, { recursive: true, force: true });
  await fs.mkdir(PUBLIC_DIR, { recursive: true });
}

function buildManifest(reports: Report[]): { generated_at: string; site_url: string; reports: ManifestEntry[] } {
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
  await ensureCleanSiteDir();

  await writeText(path.join(SITE_DIR, 'index.mdx'), renderHomePage(reports));
  await writeText(path.join(SITE_DIR, 'archive', 'index.mdx'), renderArchivePage(reports));

  for (const [index, report] of reports.entries()) {
    await writeText(
      path.join(SITE_DIR, 'reports', report.slug, 'index.mdx'),
      renderReportPage(report, {
        newerReport: index > 0 ? reports[index - 1] : undefined,
        olderReport: index + 1 < reports.length ? reports[index + 1] : undefined
      })
    );
  }

  await writeText(
    path.join(PUBLIC_DIR, 'manifest.json'),
    `${JSON.stringify(buildManifest(reports), null, 2)}\n`
  );
  await writeText(path.join(PUBLIC_DIR, '.nojekyll'), '');
}

renderSite().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
