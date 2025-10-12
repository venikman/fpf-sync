import { mkdir, readdir } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { join, relative, resolve as resolvePath, sep } from 'node:path';
import process from "node:process";

export const repoRoot = process.cwd();
// Allow overriding data dir via env var for deployments (e.g., Fly.io volume at /data)
export const DATA_DIR = process.env.FPF_DATA_DIR && process.env.FPF_DATA_DIR.trim()
  ? process.env.FPF_DATA_DIR
  : join(repoRoot, 'data');
export const EPISTEMES_PATH = join(DATA_DIR, 'epistemes.json');
export const BACKUP_DIR = join(DATA_DIR, 'backups');

export function getFpfDir(): string {
  const override = process.env.FPF_DOCS_DIR?.trim();
  if (override) {
    const resolved = resolveWithin(repoRoot, override);
    if (resolved === repoRoot) {
      throw new Error('FPF_DOCS_DIR must resolve to a subdirectory inside the repository root');
    }
    return resolved;
  }
  return join(repoRoot, 'yadisk');
}

export function resolveWithin(base: string, candidate: string): string {
  const abs = resolvePath(base, candidate);
  const baseNorm = base.endsWith(sep) ? base : base + sep;
  if (abs === base) {
    return abs;
  }
  if (!abs.startsWith(baseNorm)) {
    throw new Error(`Path escapes base: ${candidate}`);
  }
  return abs;
}

export async function ensureDir(p: string) {
  await mkdir(p, { recursive: true });
}

export function writeFileAtomic(path: string, data: string | Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const tmp = path + `.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const out = createWriteStream(tmp, { flags: 'wx' });
    out.on('error', reject);
    out.on('finish', () => {
      // rename via fs.promises (atomic on same filesystem)
      import('node:fs/promises').then(fs => fs.rename(tmp, path).then(() => resolve()).catch(reject));
    });
    out.end(data);
  });
}

function toRepoRelative(pathname: string): string {
  const rel = relative(repoRoot, pathname);
  return rel.split(sep).join('/');
}

export async function listWhitelistedFpfDocs(): Promise<string[]> {
  const docsDir = getFpfDir();
  try {
    const entries = await readdir(docsDir, { withFileTypes: true });
    return entries
      .filter(e => e.isFile())
      .map(e => toRepoRelative(join(docsDir, e.name)))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

export function isAllowedFpfPath(relPath: string): string {
  const abs = resolveWithin(repoRoot, relPath);
  const fpfAbs = getFpfDir();
  const fpfNorm = fpfAbs.endsWith(sep) ? fpfAbs : fpfAbs + sep;
  if (!(abs === fpfAbs || abs.startsWith(fpfNorm))) {
    throw new Error(`Path not allowed outside whitelisted FPF docs directory: ${relPath}`);
  }
  return abs;
}

export async function findMainFpfSpec(): Promise<string | undefined> {
  const docs = await listWhitelistedFpfDocs();
  const pattern = /first\s*principles\s*framework[\s-—]*core\s*conceptual\s*specification[\s-()]*holonic/i;
  const found = docs.find(p => pattern.test(p));
  return found;
}

export function extractTopicsFromMarkdown(markdown: string, maxTopics = 12): string[] {
  const headingRe = /^(#{1,6})\s+(.+?)(?:\s*#*\s*)?$/gm;
  const topics: string[] = [];
  const seen = new Set<string>();
  for (const m of markdown.matchAll(headingRe)) {
    const text = String(m[2] || '').trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    topics.push(text);
    if (topics.length >= maxTopics) break;
  }
  return topics;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export function extractHeadings(markdown: string, depthMax = 6): { level: number; text: string; line: number; slug: string }[] {
  const headingRe = /^(#{1,6})\s+(.+?)(?:\s*#*\s*)?$/gm;
  const out: { level: number; text: string; line: number; slug: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(markdown)) !== null) {
    const level = m[1].length;
    if (level > depthMax) continue;
    const text = String(m[2] || '').trim();
    const before = markdown.slice(0, m.index);
    const line = before.split(/\n/).length; // 1-based line number
    out.push({ level, text, line, slug: slugify(text) });
  }
  return out;
}

export function parseHeadingToEpistemeFields(heading: string): { object: string; concept?: string; symbol?: string } {
  let h = heading.trim();
  // Extract trailing (Symbol)
  let symbol: string | undefined;
  const symMatch = h.match(/\(([^)]+)\)\s*$/);
  if (symMatch) {
    symbol = symMatch[1].trim();
    h = h.slice(0, symMatch.index).trim();
  }
  // Split on common separators for object — concept
  const parts = h.split(/\s*[—:-]\s+/); // em-dash, colon, hyphen
  let object = h;
  let concept: string | undefined;
  if (parts.length >= 2) {
    object = parts[0].trim();
    concept = parts.slice(1).join(' - ').trim();
  }
  if (!object) object = heading.trim();
  return { object, concept, symbol };
}
