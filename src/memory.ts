import { createHash } from 'node:crypto';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';

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
  subNodes: PageIndexNode[];
};

export type PageIndexContentRecord = {
  nodeId: string;
  title: string;
  depth: number;
  lineSpan: LineSpan;
  summary: string;
  references: string[];
  parentNodeId: string | null;
  childNodeIds: string[];
  content: string;
};

export type PageIndexState = {
  kind: 'pageindex-state';
  schemaVersion: 1;
  sourcePath: string;
  maxHeadingDepth: number;
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
  line: number;
  parentOrdinal: number | null;
};

type ParsedNode = {
  ordinal: number;
  depth: number;
  title: string;
  lineSpan: LineSpan;
  parentOrdinal: number | null;
  content: string;
  summary: string;
  references: string[];
};

const schemaVersion = 1;
const defaultMaxHeadingDepth = 3;
const maxSummaryChars = 220;
const patternIdPattern = /\b([A-Z]\.[A-Z0-9]+(?:\.[A-Z0-9]+)*)\b/g;
const appendixPattern = /\b(Appendix\s+[A-Z0-9]+)\b/g;

const FPF_BRANCH_PROFILES = {
  PREFACE: {
    focusAreas: ['orientation', 'scope', 'non-normative framing', 'how to read FPF'],
    patternPrefixes: [],
  },
  A: {
    focusAreas: ['kernel', 'bounded context', 'roles', 'methods', 'evidence', 'extension layering'],
    patternPrefixes: ['A.'],
  },
  B: {
    focusAreas: ['reasoning', 'abduction', 'trust', 'canonical reasoning cycle', 'aggregation'],
    patternPrefixes: ['B.'],
  },
  C: {
    focusAreas: ['kernel extensions', 'episteme', 'worldview', 'governed knowledge structures'],
    patternPrefixes: ['C.'],
  },
  D: {
    focusAreas: ['ethics', 'conflict', 'optimization', 'multi-scale trade-offs'],
    patternPrefixes: ['D.'],
  },
  E: {
    focusAreas: ['constitution', 'authoring', 'lexical rules', 'multi-view', 'publication discipline'],
    patternPrefixes: ['E.'],
  },
  F: {
    focusAreas: ['unification suite', 'alignment', 'bridge across contexts', 'meaning raw material'],
    patternPrefixes: ['F.'],
  },
  G: {
    focusAreas: ['discipline patterns', 'sota patterns', 'pattern kit'],
    patternPrefixes: ['G.'],
  },
  H: {
    focusAreas: ['glossary', 'definitions', 'pattern index'],
    patternPrefixes: ['H.'],
  },
  I: {
    focusAreas: ['annexes', 'tutorials', 'extended examples'],
    patternPrefixes: ['I.'],
  },
  J: {
    focusAreas: ['indexes', 'navigation aids'],
    patternPrefixes: ['J.'],
  },
  K: {
    focusAreas: ['lexical debt', 'cleanup', 'terminology debt'],
    patternPrefixes: ['K.'],
  },
} as const;

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

const dedupeStrings = (values: readonly string[]): string[] => {
  return [...new Set(values)];
};

const extractReferences = (input: string): string[] => {
  const refs: string[] = [];

  for (const match of input.matchAll(patternIdPattern)) {
    const value = match[1]?.trim();

    if (value) {
      refs.push(value);
    }
  }

  for (const match of input.matchAll(appendixPattern)) {
    const value = match[1]?.trim();

    if (value) {
      refs.push(value);
    }
  }

  return dedupeStrings(refs);
};

const padNodeId = (ordinal: number): string => {
  return String(ordinal).padStart(4, '0');
};

const findHeadings = (lines: readonly string[], maxHeadingDepth: number): ParsedHeading[] => {
  const headings: ParsedHeading[] = [];
  const stack: ParsedHeading[] = [];
  let ordinal = 0;
  let inFence = false;

  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();

    if (/^(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }

    if (inFence) {
      continue;
    }

    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(rawLine);

    if (!match) {
      continue;
    }

    const [, hashes = '', rawTitle = ''] = match;
    const depth = hashes.length;

    if (depth > maxHeadingDepth) {
      continue;
    }

    ordinal += 1;

    while (stack.length > 0) {
      const current = stack.at(-1);

      if (!current || current.depth < depth) {
        break;
      }

      stack.pop();
    }

    const heading: ParsedHeading = {
      ordinal,
      depth,
      title: rawTitle.trim() || `Section ${ordinal}`,
      line: index + 1,
      parentOrdinal: stack.at(-1)?.ordinal ?? null,
    };

    headings.push(heading);
    stack.push(heading);
  }

  return headings;
};

const parseNodes = (targetPath: string, content: string, maxHeadingDepth: number): ParsedNode[] => {
  const lines = content.split(/\r?\n/);
  const headings = findHeadings(lines, maxHeadingDepth);
  const baseTitle = basename(targetPath, extname(targetPath));

  if (headings.length === 0) {
    const fullContent = content.trim();

    return [
      {
        ordinal: 1,
        depth: 1,
        title: baseTitle,
        lineSpan: {
          start: 1,
          end: Math.max(1, lines.length),
        },
        parentOrdinal: null,
        content: fullContent,
        summary: summarizeContent(fullContent, baseTitle),
        references: extractReferences(fullContent),
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
      lineSpan: {
        start: heading.line,
        end: Math.max(heading.line, endLine),
      },
      parentOrdinal: heading.parentOrdinal,
      content: nodeContent,
      summary: summarizeContent(nodeContent, heading.title),
      references: extractReferences(nodeContent),
    };
  });
};

const classifyFpfBranch = (title: string): string | null => {
  if (/table of content/i.test(title)) {
    return null;
  }

  if (/preface/i.test(title)) {
    return 'PREFACE';
  }

  const partMatch = /^Part\s+([A-Z0-9]+)\b/i.exec(title);

  if (partMatch?.[1]) {
    return partMatch[1].toUpperCase();
  }

  const sectionMatch = /^Section\s+([A-Z0-9-]+)\b/i.exec(title);

  if (sectionMatch?.[1]) {
    return `SECTION-${sectionMatch[1].toUpperCase()}`;
  }

  return `ROOT-${title
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)}`;
};

const collectSubtreePatternPrefixes = (node: PageIndexNode): string[] => {
  const prefixes = new Set<string>();
  const visit = (current: PageIndexNode): void => {
    for (const match of `${current.title} ${current.summary} ${current.references.join(' ')}`.matchAll(
      patternIdPattern,
    )) {
      const patternId = match[1]?.trim();

      if (!patternId) {
        continue;
      }

      const [prefix] = patternId.split('.');

      if (prefix) {
        prefixes.add(`${prefix}.`);
      }
    }

    for (const child of current.subNodes) {
      visit(child);
    }
  };

  visit(node);

  return [...prefixes].sort((left, right) => left.localeCompare(right));
};

const inferFallbackFocusAreas = (title: string): string[] => {
  return title
    .replace(/^[#\s-]+/, '')
    .split(/[^A-Za-z0-9]+/g)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 2)
    .slice(0, 6);
};

const buildFpfBranchIndex = (tree: readonly PageIndexNode[]): FpfBranchRecord[] => {
  const seen = new Set<string>();
  const branches: FpfBranchRecord[] = [];

  for (const node of tree) {
    const branchId = classifyFpfBranch(node.title);

    if (!branchId || seen.has(branchId)) {
      continue;
    }

    seen.add(branchId);
    const knownProfile = branchId in FPF_BRANCH_PROFILES
      ? FPF_BRANCH_PROFILES[branchId as keyof typeof FPF_BRANCH_PROFILES]
      : null;
    const inferredPrefixes = collectSubtreePatternPrefixes(node);

    branches.push({
      branchId,
      nodeId: node.nodeId,
      title: node.title,
      lineSpan: {
        start: node.startLine,
        end: node.endLine,
      },
      summary: node.summary,
      patternPrefixes:
        knownProfile && knownProfile.patternPrefixes.length > 0
          ? [...knownProfile.patternPrefixes]
          : inferredPrefixes,
      focusAreas: knownProfile ? [...knownProfile.focusAreas] : inferFallbackFocusAreas(node.title),
    });
  }

  return branches;
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
  const contents = parsedNodes.map((node) => {
    const nodeId = padNodeId(node.ordinal);
    const childNodeIds = parsedNodes
      .filter((candidate) => candidate.parentOrdinal === node.ordinal)
      .map((candidate) => padNodeId(candidate.ordinal));

    return {
      nodeId,
      title: node.title,
      depth: node.depth,
      lineSpan: node.lineSpan,
      summary: node.summary,
      references: node.references,
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
    branches: buildFpfBranchIndex(tree),
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
    const parsed = JSON.parse(raw) as Partial<PageIndexState>;

    if (
      parsed.kind !== 'pageindex-state' ||
      parsed.schemaVersion !== schemaVersion ||
      typeof parsed.sourcePath !== 'string' ||
      typeof parsed.maxHeadingDepth !== 'number' ||
      typeof parsed.generatedAt !== 'string' ||
      typeof parsed.contentHash !== 'string' ||
      typeof parsed.nodeCount !== 'number'
    ) {
      return null;
    }

    return {
      kind: 'pageindex-state',
      schemaVersion,
      sourcePath: parsed.sourcePath,
      maxHeadingDepth: parsed.maxHeadingDepth,
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
  const contentHash = sha1(input.content);
  const paths = getArtifactPaths(memoryRoot);
  const currentState = await readState(paths.statePath);

  if (
    currentState &&
    currentState.contentHash === contentHash &&
    currentState.sourcePath === input.targetPath &&
    currentState.maxHeadingDepth === maxHeadingDepth &&
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
