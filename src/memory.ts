import { createHash } from 'node:crypto';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

import { Schema } from 'effect';

import { parseMarkdownHeadings } from './memory-markdown.ts';
import { PageIndexStateSchema } from './memory-schema.ts';
import {
  collectAppendixLabelValues,
  collectCanonicalIdValues,
  extractPartLetter,
} from './memory-tokens.ts';

export type LineSpan = {
  start: number;
  end: number;
};

export type PageIndexNode = {
  nodeId: string;
  title: string;
  depth: number;
  startLine: number;
  endLine: number;
  summary: string;
  references: string[];
  canonicalIds: string[];
  subNodes: PageIndexNode[];
};

export type PageIndexContentRecord = {
  nodeId: string;
  title: string;
  depth: number;
  lineSpan: LineSpan;
  summary: string;
  references: string[];
  canonicalIds: string[];
  parentNodeId: string | null;
  childNodeIds: string[];
  content: string;
};

export type PageIndexState = {
  kind: 'pageindex-state';
  schemaVersion: 2;
  sourcePath: string;
  maxHeadingDepth: number;
  inspectLineBudget: number;
  inspectCharBudget: number;
  generatedAt: string;
  contentHash: string;
  nodeCount: number;
};

export type FpfBranchRecord = {
  branchId: string;
  nodeId: string;
  title: string;
  lineSpan: LineSpan;
  summary: string;
  patternPrefixes: string[];
  focusAreas: string[];
};

export type EnsurePageIndexInput = {
  cwd: string;
  targetPath: string;
  content: string;
  generatedAt: string;
  maxHeadingDepth?: number;
};

export type EnsurePageIndexResult = {
  changed: boolean;
  artifactRoot: string;
  nodeCount: number;
};

type ParsedHeading = {
  ordinal: number;
  depth: number;
  title: string;
  normalizedTitle: string;
  line: number;
  parentOrdinal: number | null;
};

type ParsedNode = {
  ordinal: number;
  depth: number;
  title: string;
  normalizedTitle: string;
  lineSpan: LineSpan;
  parentOrdinal: number | null;
  content: string;
  summary: string;
  references: string[];
  canonicalIds: string[];
};

const schemaVersion = 2;
const pageIndexBuildRevision = 'mdast-v4';
const defaultMaxHeadingDepth = 6;
const defaultInspectLineBudget = 140;
const defaultInspectCharBudget = 6000;
const maxSummaryChars = 220;
const fpfBranchIds = ['PREFACE', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'] as const;
type FpfBranchId = (typeof fpfBranchIds)[number];
const fpfBranchIdSet = new Set<string>(fpfBranchIds);


const sha1 = (input: string): string => {
  return createHash('sha1').update(input).digest('hex');
};

const toJsonl = (records: readonly unknown[]): string => {
  if (records.length === 0) {
    return '';
  }

  return `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
};

const truncateText = (input: string, maxChars: number): string => {
  if (input.length <= maxChars) {
    return input;
  }

  return `${input.slice(0, maxChars - 1).trimEnd()}…`;
};

const dedupeStrings = (values: readonly string[]): string[] => {
  return [...new Set(values)];
};

const stripMarkdownSyntax = (input: string): string => {
  return input
    .replace(/!\[[^\]]*\]\(([^)]+)\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/`{1,3}([^`]+)`{1,3}/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[>*_~]/g, ' ')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const summarizeContent = (content: string, fallback: string): string => {
  const stripped = stripMarkdownSyntax(content);

  if (!stripped) {
    return fallback;
  }

  return truncateText(stripped, maxSummaryChars);
};

const extractCanonicalIds = (input: string): string[] => {
  return collectCanonicalIdValues(input);
};

const extractAppendixLabels = (input: string): string[] => {
  return collectAppendixLabelValues(input);
};

const extractReferences = (input: string): string[] => {
  return dedupeStrings([
    ...extractCanonicalIds(input),
    ...extractAppendixLabels(input),
  ]);
};

const normalizeTitle = (title: string): string => {
  return stripMarkdownSyntax(title);
};

const padNodeId = (ordinal: number): string => {
  return String(ordinal).padStart(4, '0');
};

const findHeadings = (content: string, maxHeadingDepth: number): ParsedHeading[] => {
  const markdownHeadings = parseMarkdownHeadings(content, maxHeadingDepth);
  const headings: ParsedHeading[] = [];
  const stack: ParsedHeading[] = [];
  let ordinal = 0;
 
  for (const markdownHeading of markdownHeadings) {
    const depth = markdownHeading.depth;

    ordinal += 1;

    while (stack.length > 0) {
      const current = stack.at(-1);

      if (!current || current.depth < depth) {
        break;
      }

      stack.pop();
    }

    const title = markdownHeading.title.trim() || `Section ${ordinal}`;
    const heading: ParsedHeading = {
      ordinal,
      depth,
      title,
      normalizedTitle: normalizeTitle(title),
      line: markdownHeading.line,
      parentOrdinal: stack.at(-1)?.ordinal ?? null,
    };

    headings.push(heading);
    stack.push(heading);
  }

  return headings;
};

const parseNodes = (targetPath: string, content: string, maxHeadingDepth: number): ParsedNode[] => {
  const lines = content.split(/\r?\n/);
  const headings = findHeadings(content, maxHeadingDepth);
  const baseTitle = basename(targetPath, extname(targetPath));

  if (headings.length === 0) {
    const fullContent = content.trim();

    return [
      {
        ordinal: 1,
        depth: 1,
        title: baseTitle,
        normalizedTitle: normalizeTitle(baseTitle),
        lineSpan: {
          start: 1,
          end: Math.max(1, lines.length),
        },
        parentOrdinal: null,
        content: fullContent,
        summary: summarizeContent(fullContent, baseTitle),
        references: extractReferences(fullContent),
        canonicalIds: extractCanonicalIds(baseTitle),
      },
    ];
  }

  return headings.map((heading, index) => {
    const nextHeading = headings[index + 1];
    const endLine = nextHeading ? nextHeading.line - 1 : lines.length;
    const nodeContent = lines.slice(heading.line - 1, endLine).join('\n').trim();

    return {
      ordinal: heading.ordinal,
      depth: heading.depth,
      title: heading.title,
      normalizedTitle: heading.normalizedTitle,
      lineSpan: {
        start: heading.line,
        end: Math.max(heading.line, endLine),
      },
      parentOrdinal: heading.parentOrdinal,
      content: nodeContent,
      summary: summarizeContent(nodeContent, heading.normalizedTitle || heading.title),
      references: extractReferences(nodeContent),
      canonicalIds: dedupeStrings([
        ...extractCanonicalIds(heading.normalizedTitle),
        ...extractAppendixLabels(heading.normalizedTitle),
      ]),
    };
  });
};

const isDocumentPreamble = (title: string): boolean => {
  const normalized = title.trim().toLowerCase();

  return (
    normalized.startsWith('first principles framework') ||
    normalized.startsWith('table of content')
  );
};

const inferBranchRootId = (title: string): FpfBranchId | null => {
  const normalized = title.trim().toLowerCase();

  if (normalized.includes('table of content') || isDocumentPreamble(title)) {
    return null;
  }

  if (normalized.startsWith('preface')) {
    return 'PREFACE';
  }

  const branchIdFromTitle = extractPartLetter(title);

  if (branchIdFromTitle && fpfBranchIdSet.has(branchIdFromTitle)) {
    return branchIdFromTitle as FpfBranchId;
  }

  return null;
};

const inferFallbackFocusAreas = (input: string): string[] => {
  return dedupeStrings(
    input
      .replace(/^[#\s-]+/, '')
      .split(/[^A-Za-z0-9.]+/g)
      .map((part) => part.trim())
      .filter((part) => part.length > 2)
      .slice(0, 12),
  ).slice(0, 6);
};

const collectBranchPreviewLines = (branchId: FpfBranchId, sectionText: string): string[] => {
  if (branchId === 'PREFACE') {
    return dedupeStrings(
      sectionText
        .split(/\r?\n/)
        .map((line) => stripMarkdownSyntax(line).trim())
        .filter((line) => line.length > 0),
    ).slice(0, 6);
  }

  const ownIdPattern = new RegExp(`\\b${branchId}\\.[A-Za-z0-9:.\\-]+`, 'i');

  return dedupeStrings(
    sectionText
      .split(/\r?\n/)
      .map((line) => stripMarkdownSyntax(line).trim())
      .filter((line) => line.length > 0 && ownIdPattern.test(line)),
  ).slice(0, 6);
};

const collectBranchFocusAreas = (
  branchId: FpfBranchId,
  rootTitle: string,
  sectionText: string,
  sectionRecords: readonly PageIndexContentRecord[],
): string[] => {
  const previewLines = collectBranchPreviewLines(branchId, sectionText).filter(
    (line) => line !== normalizeTitle(rootTitle),
  );

  if (previewLines.length > 0) {
    return previewLines;
  }

  const headingTitles = dedupeStrings(
    sectionRecords
      .map((record) => normalizeTitle(record.title))
      .filter((title) => title.length > 0 && title !== normalizeTitle(rootTitle)),
  ).slice(0, 6);

  if (headingTitles.length > 0) {
    return headingTitles;
  }

  return inferFallbackFocusAreas(sectionText);
};

const flattenTree = (tree: readonly PageIndexNode[]): PageIndexNode[] => {
  const nodes: PageIndexNode[] = [];

  const visit = (node: PageIndexNode): void => {
    nodes.push(node);

    for (const child of node.subNodes) {
      visit(child);
    }
  };

  for (const node of tree) {
    visit(node);
  }

  return nodes;
};

const buildFpfBranchIndex = (
  tree: readonly PageIndexNode[],
  contents: readonly PageIndexContentRecord[],
  sourceContent: string,
): FpfBranchRecord[] => {
  const sourceLines = sourceContent.split(/\r?\n/);
  const seen = new Set<string>();
  const branchRoots = flattenTree(tree)
    .map((node) => {
      const branchId = inferBranchRootId(normalizeTitle(node.title));

      return branchId ? { branchId, node } : null;
    })
    .filter((entry): entry is { branchId: FpfBranchId; node: PageIndexNode } => entry !== null)
    .filter((entry) => {
      if (seen.has(entry.branchId)) {
        return false;
      }

      seen.add(entry.branchId);
      return true;
    })
    .sort((left, right) => left.node.startLine - right.node.startLine);

  return branchRoots.map((entry, index) => {
    const sectionStart = entry.node.startLine;
    const sectionEnd = index + 1 < branchRoots.length
      ? branchRoots[index + 1]!.node.startLine - 1
      : sourceLines.length;
    const sectionText = sourceLines.slice(sectionStart - 1, sectionEnd).join('\n').trim();
    const sectionRecords = contents.filter((record) =>
      record.lineSpan.start >= sectionStart && record.lineSpan.start <= sectionEnd,
    );

    return {
      branchId: entry.branchId,
      nodeId: entry.node.nodeId,
      title: entry.node.title,
      lineSpan: {
        start: sectionStart,
        end: sectionEnd,
      },
      summary: summarizeContent(sectionText, entry.node.title),
      patternPrefixes: entry.branchId === 'PREFACE' ? [] : [`${entry.branchId}.`],
      focusAreas: collectBranchFocusAreas(entry.branchId, entry.node.title, sectionText, sectionRecords),
    } satisfies FpfBranchRecord;
  });
};

const buildTreeArtifacts = (
  targetPath: string,
  content: string,
  maxHeadingDepth: number,
): {
  tree: PageIndexNode[];
  contents: PageIndexContentRecord[];
  branches: FpfBranchRecord[];
  nodeCount: number;
} => {
  const parsedNodes = parseNodes(targetPath, content, maxHeadingDepth);
  const childrenByParentOrdinal = new Map<number | null, ParsedNode[]>();

  for (const node of parsedNodes) {
    const current = childrenByParentOrdinal.get(node.parentOrdinal) ?? [];
    current.push(node);
    childrenByParentOrdinal.set(node.parentOrdinal, current);
  }

  const contents = parsedNodes.map((node) => {
    const nodeId = padNodeId(node.ordinal);
    const childNodeIds = (childrenByParentOrdinal.get(node.ordinal) ?? []).map((candidate) => padNodeId(candidate.ordinal));

    return {
      nodeId,
      title: node.title,
      depth: node.depth,
      lineSpan: node.lineSpan,
      summary: node.summary,
      references: node.references,
      canonicalIds: node.canonicalIds,
      parentNodeId: node.parentOrdinal ? padNodeId(node.parentOrdinal) : null,
      childNodeIds,
      content: node.content,
    } satisfies PageIndexContentRecord;
  });
  const contentsById = new Map(contents.map((node) => [node.nodeId, node]));
  const childrenByParent = new Map<string | null, PageIndexContentRecord[]>();

  for (const node of contents) {
    const current = childrenByParent.get(node.parentNodeId) ?? [];
    current.push(node);
    childrenByParent.set(node.parentNodeId, current);
  }

  const toTree = (node: PageIndexContentRecord): PageIndexNode => {
    return {
      nodeId: node.nodeId,
      title: node.title,
      depth: node.depth,
      startLine: node.lineSpan.start,
      endLine: node.lineSpan.end,
      summary: node.summary,
      references: node.references,
      canonicalIds: node.canonicalIds,
      subNodes: (childrenByParent.get(node.nodeId) ?? [])
        .map((child) => contentsById.get(child.nodeId))
        .filter((child): child is PageIndexContentRecord => child !== undefined)
        .map(toTree),
    };
  };

  const tree = (childrenByParent.get(null) ?? []).map(toTree);

  return {
    tree,
    contents,
    branches: buildFpfBranchIndex(tree, contents, content),
    nodeCount: contents.length,
  };
};

const getArtifactPaths = (memoryRoot: string): {
  branchPath: string;
  contentPath: string;
  statePath: string;
  treePath: string;
} => {
  return {
    branchPath: join(memoryRoot, 'fpf-branches.json'),
    contentPath: join(memoryRoot, 'pageindex-content.jsonl'),
    statePath: join(memoryRoot, 'pageindex-state.json'),
    treePath: join(memoryRoot, 'pageindex-tree.json'),
  };
};

const readState = async (statePath: string): Promise<PageIndexState | null> => {
  try {
    const raw = await readFile(statePath, 'utf8');
    const parsed = Schema.decodeUnknownSync(PageIndexStateSchema)(JSON.parse(raw) as unknown);

    return {
      kind: 'pageindex-state',
      schemaVersion,
      sourcePath: parsed.sourcePath,
      maxHeadingDepth: parsed.maxHeadingDepth,
      inspectLineBudget: parsed.inspectLineBudget,
      inspectCharBudget: parsed.inspectCharBudget,
      generatedAt: parsed.generatedAt,
      contentHash: parsed.contentHash,
      nodeCount: parsed.nodeCount,
    };
  } catch {
    return null;
  }
};

const artifactsExist = async (paths: ReturnType<typeof getArtifactPaths>): Promise<boolean> => {
  const checks = await Promise.all([
    Bun.file(paths.statePath).exists(),
    Bun.file(paths.treePath).exists(),
    Bun.file(paths.contentPath).exists(),
    Bun.file(paths.branchPath).exists(),
  ]);

  return checks.every((value) => value);
};

const writeArtifacts = async (
  memoryRoot: string,
  state: PageIndexState,
  tree: readonly PageIndexNode[],
  contents: readonly PageIndexContentRecord[],
  branches: readonly FpfBranchRecord[],
): Promise<void> => {
  const paths = getArtifactPaths(memoryRoot);

  await rm(memoryRoot, { force: true, recursive: true });
  await mkdir(memoryRoot, { recursive: true });
  await Bun.write(paths.statePath, `${JSON.stringify(state, null, 2)}\n`);
  await Bun.write(paths.treePath, `${JSON.stringify(tree, null, 2)}\n`);
  await Bun.write(paths.branchPath, `${JSON.stringify(branches, null, 2)}\n`);
  await Bun.write(paths.contentPath, toJsonl(contents));
};

export const ensurePageIndex = async (
  input: EnsurePageIndexInput,
): Promise<EnsurePageIndexResult> => {
  const artifactRoot = '.memory';
  const memoryRoot = join(input.cwd, artifactRoot);
  const maxHeadingDepth = input.maxHeadingDepth ?? defaultMaxHeadingDepth;
  const contentHash = sha1(`${pageIndexBuildRevision}\0${input.content}`);
  const paths = getArtifactPaths(memoryRoot);
  const currentState = await readState(paths.statePath);

  if (
    currentState &&
    currentState.contentHash === contentHash &&
    currentState.sourcePath === input.targetPath &&
    currentState.maxHeadingDepth === maxHeadingDepth &&
    currentState.inspectLineBudget === defaultInspectLineBudget &&
    currentState.inspectCharBudget === defaultInspectCharBudget &&
    (await artifactsExist(paths))
  ) {
    return {
      changed: false,
      artifactRoot,
      nodeCount: currentState.nodeCount,
    };
  }

  const { tree, contents, branches, nodeCount } = buildTreeArtifacts(
    input.targetPath,
    input.content,
    maxHeadingDepth,
  );
  const state: PageIndexState = {
    kind: 'pageindex-state',
    schemaVersion,
    sourcePath: input.targetPath,
    maxHeadingDepth,
    inspectLineBudget: defaultInspectLineBudget,
    inspectCharBudget: defaultInspectCharBudget,
    generatedAt: input.generatedAt,
    contentHash,
    nodeCount,
  };

  await writeArtifacts(memoryRoot, state, tree, contents, branches);

  return {
    changed: true,
    artifactRoot,
    nodeCount,
  };
};
