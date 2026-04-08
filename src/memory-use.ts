import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Data, Effect, Schema } from 'effect';

import {
  ensurePageIndex,
  type FpfBranchRecord,
  type LineSpan,
  type PageIndexContentRecord,
  type PageIndexNode,
  type PageIndexState,
} from './memory.ts';
import {
  FpfBranchRecordArraySchema,
  PageIndexContentRecordArraySchema,
  PageIndexStateSchema,
  PageIndexTreeSchema,
} from './memory-schema.ts';
import {
  collectAppendixLabelValues,
  collectCanonicalIdValues,
} from './memory-tokens.ts';

export class PageIndexMissing extends Data.TaggedError('PageIndexMissing')<{
  readonly path: string;
}> {}

export class PageIndexIoError extends Data.TaggedError('PageIndexIoError')<{
  readonly path: string;
  readonly reason: string;
}> {}

export class PageIndexQuestionEmpty extends Data.TaggedError('PageIndexQuestionEmpty')<{
  readonly question: string;
}> {}

export class PageIndexNodeMissing extends Data.TaggedError('PageIndexNodeMissing')<{
  readonly nodeId: string;
}> {}

export class PageIndexModelError extends Data.TaggedError('PageIndexModelError')<{
  readonly reason: string;
}> {}

export class PageIndexActionInvalid extends Data.TaggedError('PageIndexActionInvalid')<{
  readonly reason: string;
}> {}

export class PageIndexEvidenceMissing extends Data.TaggedError('PageIndexEvidenceMissing')<{
  readonly question: string;
}> {}

export type PageIndexAppError =
  | PageIndexActionInvalid
  | PageIndexEvidenceMissing
  | PageIndexIoError
  | PageIndexMissing
  | PageIndexModelError
  | PageIndexNodeMissing
  | PageIndexQuestionEmpty;

export type LocalModelRequest = {
  endpoint: string;
  model: string;
  systemPrompt: string;
  input: string;
};

export type LocalModelOptions = {
  chat?: (request: LocalModelRequest) => Promise<string>;
  fetchImpl?: typeof fetch;
  maxSteps?: number;
};

export type PageIndexTreeResult = {
  maxHeadingDepth: number;
  nodeCount: number;
  sourcePath: string;
  tree: PageIndexNode[];
};

export type PageIndexRetrievalStep =
  | {
      step: number;
      action: 'inspect';
      nodeId: string;
      title: string;
      nodeIds: string[];
      titles: string[];
      rationale: string;
    }
  | {
      step: number;
      action: 'answer';
      rationale: string;
      answerPlan: string;
    };

export type PageIndexEvidence = {
  nodeId: string;
  title: string;
  lineSpan: LineSpan;
  summary: string;
  content: string;
};

export type PageIndexRetrieveResult = {
  question: string;
  status: 'complete' | 'step-limit';
  steps: PageIndexRetrievalStep[];
  evidence: PageIndexEvidence[];
  answerPlan: string | null;
};

export type PageIndexAnswerCitation = {
  nodeId: string;
  title: string;
  lineSpan: LineSpan;
  label: string;
};

export type PageIndexAnswerResult = {
  question: string;
  answer: string;
  citations: PageIndexAnswerCitation[];
  rendered: string;
  retrieval: PageIndexRetrieveResult;
};

type PageIndexRepository = {
  state: PageIndexState;
  tree: PageIndexNode[];
  treeById: Map<string, PageIndexNode>;
  branches: FpfBranchRecord[];
  contentsById: Map<string, PageIndexContentRecord>;
  contentsByCanonicalId: Map<string, PageIndexContentRecord[]>;
  contentsByAppendixLabel: Map<string, PageIndexContentRecord[]>;
};

type RetrievalAction =
  | {
      action: 'inspect';
      nodeIds: string[];
      rationale: string;
    }
  | {
      action: 'answer';
      rationale: string;
      answerPlan: string;
    };

type AnswerPayload = {
  answer: string;
  citations: string[];
};

type RawSelectionPayload = Schema.Schema.Type<typeof RawSelectionPayloadSchema>;
type RawAnswerPayload = Schema.Schema.Type<typeof RawAnswerPayloadSchema>;

type FrontierReason =
  | 'branch-root'
  | 'child-of-routing'
  | 'question-exact-id'
  | 'reference-follow'
  | 'sibling-neighbor';

type FrontierEntry = {
  nodeId: string;
  reasons: FrontierReason[];
  priority: number;
};

type FrontierCandidate = FrontierEntry & {
  title: string;
  summary: string;
  depth: number;
  childCount: number;
  canonicalIds: string[];
  inspectable: boolean;
  lineSpan: LineSpan;
};

const defaultEndpoint = 'http://localhost:1234/api/v1/chat';
const defaultModel = 'google/gemma-4-26b-a4b';
const defaultMaxSteps = 6;
const maxFrontierCandidates = 12;
const maxInspectBatch = 3;
const shortLeafLineBudget = 8;
const reasonPriority: Record<FrontierReason, number> = {
  'question-exact-id': 0,
  'reference-follow': 1,
  'child-of-routing': 2,
  'sibling-neighbor': 3,
  'branch-root': 4,
};
const StringArraySchema = Schema.Array(Schema.String);
const RawSelectionPayloadSchema = Schema.Struct({
  action: Schema.optional(Schema.String),
  rationale: Schema.optional(Schema.String),
  answer_plan: Schema.optional(Schema.String),
  answerPlan: Schema.optional(Schema.String),
  node_list: Schema.optional(StringArraySchema),
  nodeList: Schema.optional(StringArraySchema),
  node_ids: Schema.optional(StringArraySchema),
  nodeIds: Schema.optional(StringArraySchema),
  node_id: Schema.optional(Schema.String),
  nodeId: Schema.optional(Schema.String),
});
const RawAnswerPayloadSchema = Schema.Struct({
  answer: Schema.String,
  citations: Schema.optional(StringArraySchema),
  citation_node_ids: Schema.optional(StringArraySchema),
});

const lookupStopWords = new Set([
  'a',
  'an',
  'and',
  'are',
  'be',
  'best',
  'by',
  'can',
  'does',
  'for',
  'from',
  'how',
  'in',
  'into',
  'is',
  'it',
  'of',
  'on',
  'or',
  'say',
  'the',
  'this',
  'to',
  'used',
  'use',
  'what',
  'which',
  'with',
]);

const toReason = (cause: unknown): string => {
  return cause instanceof Error ? cause.message : String(cause);
};

const isEnoent = (cause: unknown): cause is { code: 'ENOENT' } => {
  return typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'ENOENT';
};

const truncateText = (input: string, maxChars: number): string => {
  if (input.length <= maxChars) {
    return input;
  }

  return `${input.slice(0, maxChars - 1).trimEnd()}…`;
};

const asSentence = (input: string): string => {
  const trimmed = input.trim();

  if (!trimmed) {
    return 'no rationale.';
  }

  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
};

const dedupeStrings = (values: readonly string[]): string[] => {
  return [...new Set(values)];
};

const normalizeLookupText = (input: string): string => {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const toLookupTokens = (input: string): string[] => {
  return [
    ...new Set(
      normalizeLookupText(input)
        .split(' ')
        .filter((token) => token.length >= 3 && !lookupStopWords.has(token)),
    ),
  ];
};

const scoreLookupMatch = (question: string, parts: readonly string[]): number => {
  const haystack = normalizeLookupText(parts.join(' '));

  if (!haystack) {
    return 0;
  }

  const normalizedQuestion = normalizeLookupText(question);
  const questionTokens = toLookupTokens(question);
  let score = 0;

  if (normalizedQuestion && haystack.includes(normalizedQuestion)) {
    score += 24;
  }

  for (const token of questionTokens) {
    if (haystack.includes(token)) {
      score += token.length >= 6 ? 6 : 4;
    }
  }

  for (const canonicalId of extractCanonicalIds(question)) {
    if (haystack.includes(canonicalId.toLowerCase())) {
      score += 18;
    }
  }

  for (const appendixLabel of extractAppendixLabels(question)) {
    if (haystack.includes(appendixLabel.toLowerCase())) {
      score += 18;
    }
  }

  return score;
};

const sortByLineSpan = <T extends { lineSpan: LineSpan; title: string }>(items: readonly T[]): T[] => {
  return [...items].sort((left, right) => {
    return (
      left.lineSpan.start - right.lineSpan.start ||
      left.lineSpan.end - right.lineSpan.end ||
      left.title.localeCompare(right.title)
    );
  });
};

const renderCitationLabel = (title: string, lineSpan: LineSpan): string => {
  return `${title} (lines ${lineSpan.start}-${lineSpan.end})`;
};

const renderAnswerResult = (answer: string, citations: readonly PageIndexAnswerCitation[]): string => {
  const sources = citations.length === 0
    ? 'Sources: none'
    : ['Sources:', ...citations.map((citation) => `- ${citation.label}`)].join('\n');

  return `${answer}\n\n${sources}`;
};

const extractCanonicalIds = (input: string): string[] => {
  return collectCanonicalIdValues(input);
};

const extractAppendixLabels = (input: string): string[] => {
  return collectAppendixLabelValues(input);
};

const readJson = (path: string): Effect.Effect<unknown, PageIndexAppError> => {
  return Effect.tryPromise({
    try: async () => JSON.parse(await readFile(path, 'utf8')) as unknown,
    catch: (cause) =>
      isEnoent(cause)
        ? new PageIndexMissing({ path })
        : new PageIndexIoError({ path, reason: toReason(cause) }),
  });
};

const readJsonl = (path: string): Effect.Effect<unknown[], PageIndexAppError> => {
  return Effect.tryPromise({
    try: async () => {
      const raw = await readFile(path, 'utf8');

      return raw
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as unknown);
    },
    catch: (cause) =>
      isEnoent(cause)
        ? new PageIndexMissing({ path })
        : new PageIndexIoError({ path, reason: toReason(cause) }),
  });
};

const decodeArtifact = <T>(
  schema: Schema.Schema<T>,
  value: unknown,
  path: string,
  label: string,
): T => {
  try {
    return Schema.decodeUnknownSync(schema)(value);
  } catch (error) {
    throw new PageIndexIoError({
      path,
      reason: `invalid ${label}: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
};

const buildTreeById = (tree: readonly PageIndexNode[]): Map<string, PageIndexNode> => {
  const index = new Map<string, PageIndexNode>();

  const visit = (node: PageIndexNode): void => {
    index.set(node.nodeId, node);

    for (const child of node.subNodes) {
      visit(child);
    }
  };

  for (const node of tree) {
    visit(node);
  }

  return index;
};

const buildLookupIndex = (
  contents: readonly PageIndexContentRecord[],
  selectKeys: (item: PageIndexContentRecord) => readonly string[],
): Map<string, PageIndexContentRecord[]> => {
  const index = new Map<string, PageIndexContentRecord[]>();

  for (const item of contents) {
    for (const key of selectKeys(item)) {
      const current = index.get(key) ?? [];
      current.push(item);
      index.set(key, current);
    }
  }

  return index;
};

const loadRepository = (cwd: string): Effect.Effect<PageIndexRepository, PageIndexAppError> => {
  return Effect.gen(function* () {
    const memoryRoot = join(cwd, '.memory');
    const statePath = join(memoryRoot, 'pageindex-state.json');
    const treePath = join(memoryRoot, 'pageindex-tree.json');
    const branchPath = join(memoryRoot, 'fpf-branches.json');
    const contentPath = join(memoryRoot, 'pageindex-content.jsonl');
    const [rawState, rawTree, rawBranches, rawContents] = yield* Effect.all([
      readJson(statePath),
      readJson(treePath),
      readJson(branchPath),
      readJsonl(contentPath),
    ]);
    const state = decodeArtifact(PageIndexStateSchema, rawState, statePath, 'pageindex state file') as PageIndexState;
    const tree = decodeArtifact(PageIndexTreeSchema, rawTree, treePath, 'pageindex tree file') as PageIndexNode[];
    const branches = decodeArtifact(
      FpfBranchRecordArraySchema,
      rawBranches,
      branchPath,
      'fpf branch index file',
    ) as FpfBranchRecord[];
    const contents = decodeArtifact(
      PageIndexContentRecordArraySchema,
      rawContents,
      contentPath,
      'pageindex content file',
    ) as PageIndexContentRecord[];

    return {
      state,
      tree,
      treeById: buildTreeById(tree),
      branches,
      contentsById: new Map(contents.map((item) => [item.nodeId, item])),
      contentsByCanonicalId: buildLookupIndex(contents, (item) => item.canonicalIds),
      contentsByAppendixLabel: buildLookupIndex(contents, (item) =>
        item.canonicalIds.filter((value) => value.startsWith('Appendix '))),
    };
  });
};

const renderTree = (tree: readonly PageIndexNode[]): string => {
  const lines: string[] = [];

  const visit = (node: PageIndexNode, indent: number): void => {
    const prefix = '  '.repeat(indent);
    const summary = truncateText(node.summary, 140);
    const canonicalIds = node.canonicalIds.length > 0 ? ` | ids ${node.canonicalIds.join(', ')}` : '';
    const references = node.references.length > 0 ? ` | refs ${node.references.join(', ')}` : '';
    const childCount = node.subNodes.length;
    lines.push(
      `${prefix}- ${node.nodeId} | ${node.title} | lines ${node.startLine}-${node.endLine} | children ${childCount}${canonicalIds}${references} | ${summary}`,
    );

    for (const child of node.subNodes) {
      visit(child, indent + 1);
    }
  };

  for (const node of tree) {
    visit(node, 0);
  }

  return lines.join('\n');
};

const renderEvidence = (evidence: readonly PageIndexEvidence[]): string => {
  if (evidence.length === 0) {
    return 'none';
  }

  return evidence
    .map((item) => {
      const body = truncateText(item.content, 1600);

      return [
        `${item.nodeId} | ${item.title} | lines ${item.lineSpan.start}-${item.lineSpan.end}`,
        body,
      ].join('\n');
    })
    .join('\n\n---\n\n');
};

const isInspectable = (repository: PageIndexRepository, item: PageIndexContentRecord): boolean => {
  const lineCount = item.lineSpan.end - item.lineSpan.start + 1;

  return (
    lineCount <= repository.state.inspectLineBudget &&
    item.content.length <= repository.state.inspectCharBudget
  );
};

const isShortLeaf = (item: PageIndexContentRecord): boolean => {
  const lineCount = item.lineSpan.end - item.lineSpan.start + 1;

  return item.childNodeIds.length === 0 && lineCount <= shortLeafLineBudget;
};

const getAdjacentSiblingRecords = (
  repository: PageIndexRepository,
  node: PageIndexContentRecord,
): PageIndexContentRecord[] => {
  if (!node.parentNodeId) {
    return [];
  }

  const parent = repository.contentsById.get(node.parentNodeId);

  if (!parent) {
    return [];
  }

  const index = parent.childNodeIds.indexOf(node.nodeId);

  if (index === -1) {
    return [];
  }

  return [parent.childNodeIds[index - 1], parent.childNodeIds[index + 1]]
    .filter((value): value is string => typeof value === 'string')
    .map((nodeId) => repository.contentsById.get(nodeId))
    .filter((item): item is PageIndexContentRecord => item !== undefined);
};

const findReferenceTargets = (
  repository: PageIndexRepository,
  node: PageIndexContentRecord,
  visitedNodeIds: ReadonlySet<string>,
): PageIndexContentRecord[] => {
  const matches: PageIndexContentRecord[] = [];
  const seenNodeIds = new Set<string>();

  const addMatch = (candidate: PageIndexContentRecord): void => {
    if (
      candidate.nodeId === node.nodeId ||
      visitedNodeIds.has(candidate.nodeId) ||
      seenNodeIds.has(candidate.nodeId)
    ) {
      return;
    }

    seenNodeIds.add(candidate.nodeId);
    matches.push(candidate);
  };

  for (const reference of node.references) {
    const exactMatches = repository.contentsByCanonicalId.get(reference) ?? repository.contentsByAppendixLabel.get(reference) ?? [];

    for (const candidate of exactMatches) {
      addMatch(candidate);
    }

    if (exactMatches.length > 0) {
      continue;
    }

    const normalizedReference = normalizeLookupText(reference);

    if (!normalizedReference) {
      continue;
    }

    for (const candidate of repository.contentsById.values()) {
      const normalizedTarget = normalizeLookupText(
        `${candidate.title} ${candidate.summary} ${candidate.canonicalIds.join(' ')}`,
      );

      if (normalizedTarget.includes(normalizedReference)) {
        addMatch(candidate);
      }
    }
  }

  return matches;
};

const renderBranchIndex = (
  branches: readonly FpfBranchRecord[],
  preferredBranchIds: readonly string[],
): string => {
  const preferred = new Set(preferredBranchIds);
  const orderedBranches = [...branches].sort((left, right) => {
    const leftPreferred = preferred.has(left.branchId) ? 0 : 1;
    const rightPreferred = preferred.has(right.branchId) ? 0 : 1;

    return leftPreferred - rightPreferred || left.lineSpan.start - right.lineSpan.start;
  });

  return orderedBranches
    .map((branch) => {
      const preferredMark = preferred.has(branch.branchId) ? ' | preferred-by-fpf-heuristic' : '';
      const prefixes = branch.patternPrefixes.length > 0 ? branch.patternPrefixes.join(', ') : 'none';
      const focusAreas = branch.focusAreas.join(', ');
      const summary = truncateText(branch.summary, 140);

      return `- ${branch.branchId} | ${branch.nodeId} | ${branch.title} | lines ${branch.lineSpan.start}-${branch.lineSpan.end} | prefixes ${prefixes} | focus ${focusAreas}${preferredMark} | ${summary}`;
    })
    .join('\n');
};

const addFrontierCandidate = (
  frontier: Map<string, FrontierEntry>,
  nodeId: string,
  reason: FrontierReason,
  visitedNodeIds: ReadonlySet<string>,
): void => {
  if (visitedNodeIds.has(nodeId)) {
    return;
  }

  const current = frontier.get(nodeId);

  if (!current) {
    frontier.set(nodeId, {
      nodeId,
      reasons: [reason],
      priority: reasonPriority[reason],
    });

    return;
  }

  if (!current.reasons.includes(reason)) {
    current.reasons.push(reason);
    current.priority = Math.min(current.priority, reasonPriority[reason]);
  }
};

const seedExactQuestionMatches = (
  repository: PageIndexRepository,
  question: string,
  frontier: Map<string, FrontierEntry>,
  visitedNodeIds: ReadonlySet<string>,
): void => {
  for (const canonicalId of extractCanonicalIds(question)) {
    for (const item of repository.contentsByCanonicalId.get(canonicalId) ?? []) {
      addFrontierCandidate(frontier, item.nodeId, 'question-exact-id', visitedNodeIds);
    }
  }

  for (const appendixLabel of extractAppendixLabels(question)) {
    for (const item of repository.contentsByAppendixLabel.get(appendixLabel) ?? []) {
      addFrontierCandidate(frontier, item.nodeId, 'question-exact-id', visitedNodeIds);
    }
  }
};

const derivePreferredBranchIds = (
  question: string,
  branches: readonly FpfBranchRecord[],
): string[] => {
  const exact = new Set<string>();

  for (const canonicalId of extractCanonicalIds(question)) {
    const prefix = `${canonicalId.slice(0, 1)}.`;

    for (const branch of branches) {
      if (branch.patternPrefixes.includes(prefix)) {
        exact.add(branch.branchId);
      }
    }
  }

  if (exact.size > 0) {
    return [...exact];
  }

  const normalizedQuestion = normalizeLookupText(question);

  return branches
    .filter((branch) => {
      const haystack = normalizeLookupText(
        `${branch.title} ${branch.summary} ${branch.focusAreas.join(' ')} ${branch.patternPrefixes.join(' ')}`,
      );

      return normalizedQuestion.length > 0 && haystack.includes(normalizedQuestion);
    })
    .map((branch) => branch.branchId);
};

const rankFrontierCandidates = (
  repository: PageIndexRepository,
  frontier: ReadonlyMap<string, FrontierEntry>,
  question: string,
): FrontierCandidate[] => {
  return [...frontier.values()]
    .map((entry) => {
      const item = repository.contentsById.get(entry.nodeId);

      if (!item) {
        throw new PageIndexNodeMissing({ nodeId: entry.nodeId });
      }

      return {
        ...entry,
        title: item.title,
        summary: item.summary,
        depth: item.depth,
        childCount: item.childNodeIds.length,
        canonicalIds: item.canonicalIds,
        inspectable: isInspectable(repository, item),
        lineSpan: item.lineSpan,
        score: scoreLookupMatch(question, [item.title, item.summary, item.references.join(' '), item.canonicalIds.join(' ')]),
      };
    })
    .sort((left, right) => {
      return (
        left.priority - right.priority ||
        right.score - left.score ||
        left.lineSpan.start - right.lineSpan.start ||
        left.nodeId.localeCompare(right.nodeId)
      );
    })
    .slice(0, maxFrontierCandidates)
    .map(({ score: _score, ...candidate }) => candidate);
};

const renderFrontierCandidates = (candidates: readonly FrontierCandidate[]): string => {
  return candidates
    .map((candidate) => {
      const canonicalIds = candidate.canonicalIds.length > 0 ? candidate.canonicalIds.join(', ') : 'none';
      const kind = candidate.inspectable ? 'inspectable' : 'routing';

      return `- ${candidate.nodeId} | ${candidate.title} | ${kind} | reasons ${candidate.reasons.join(', ')} | ids ${canonicalIds} | lines ${candidate.lineSpan.start}-${candidate.lineSpan.end} | children ${candidate.childCount} | ${truncateText(candidate.summary, 140)}`;
    })
    .join('\n');
};

const splitLines = (input: string): string[] => {
  return input.split(/\r?\n/);
};

const readFence = (line: string): { marker: '`' | '~'; size: number } | null => {
  const trimmed = line.trimStart();
  const marker = trimmed[0];

  if (marker !== '`' && marker !== '~') {
    return null;
  }

  let size = 0;

  while (trimmed[size] === marker) {
    size += 1;
  }

  if (size < 3) {
    return null;
  }

  return { marker, size };
};

const extractFencedJson = (input: string): string | null => {
  const lines = splitLines(input);
  let openFence: { marker: '`' | '~'; size: number; startLineIndex: number } | null = null;

  for (const [index, line] of lines.entries()) {
    const fence = readFence(line);

    if (!fence) {
      continue;
    }

    if (!openFence) {
      openFence = {
        ...fence,
        startLineIndex: index + 1,
      };
      continue;
    }

    if (fence.marker !== openFence.marker || fence.size < openFence.size) {
      continue;
    }

    const jsonText = lines.slice(openFence.startLineIndex, index).join('\n').trim();

    if (jsonText) {
      return jsonText;
    }

    openFence = null;
  }

  return null;
};

const findBalancedJsonObject = (input: string): string | null => {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const value = input[index];

    if (start === -1) {
      if (value === '{') {
        start = index;
        depth = 1;
      }

      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (value === '\\') {
        escaped = true;
        continue;
      }

      if (value === '"') {
        inString = false;
      }

      continue;
    }

    if (value === '"') {
      inString = true;
      continue;
    }

    if (value === '{') {
      depth += 1;
      continue;
    }

    if (value === '}') {
      depth -= 1;

      if (depth === 0) {
        return input.slice(start, index + 1);
      }
    }
  }

  return null;
};

const parseJsonCandidate = (input: string): { ok: true; value: unknown } | { ok: false } => {
  try {
    return {
      ok: true,
      value: JSON.parse(input) as unknown,
    };
  } catch {
    return { ok: false };
  }
};

const extractJson = (input: string): unknown => {
  const trimmed = input.trim();

  const direct = parseJsonCandidate(trimmed);

  if (direct.ok) {
    return direct.value;
  }

  const fencedJson = extractFencedJson(trimmed);

  if (fencedJson) {
    const recovered = parseJsonCandidate(fencedJson);

    if (recovered.ok) {
      return recovered.value;
    }
  }

  const balancedJson = findBalancedJsonObject(trimmed);

  if (balancedJson) {
    const recovered = parseJsonCandidate(balancedJson);

    if (recovered.ok) {
      return recovered.value;
    }
  }

  throw new PageIndexModelError({ reason: 'model did not return valid JSON' });
};

const decodeModelPayload = <T>(schema: Schema.Schema<T>, value: unknown, label: string): T => {
  try {
    return Schema.decodeUnknownSync(schema)(value);
  } catch (error) {
    throw new PageIndexModelError({
      reason: `${label} is invalid: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
};

const parseStringArray = (value: readonly string[] | undefined): string[] => {
  if (!value) {
    return [];
  }

  return value.map((item) => item.trim()).filter((item) => item.length > 0);
};

const parseNodeList = (input: RawSelectionPayload): string[] => {
  const nodeListValue =
    input.node_list ??
    input.nodeList ??
    input.node_ids ??
    input.nodeIds;

  const nodeList = parseStringArray(nodeListValue);

  if (nodeList.length > 0) {
    return nodeList;
  }

  const nodeIdValue = input.node_id ?? input.nodeId;

  if (typeof nodeIdValue === 'string' && nodeIdValue.trim()) {
    return [nodeIdValue.trim()];
  }

  return [];
};

const parseRetrievalAction = (rawText: string): RetrievalAction => {
  const parsed = decodeModelPayload(
    RawSelectionPayloadSchema,
    extractJson(rawText),
    'model action payload',
  );
  const action = parsed.action;
  const rationaleValue = parsed.rationale;
  const rationale = typeof rationaleValue === 'string' ? rationaleValue.trim() : 'no rationale';

  if (action === 'inspect') {
    const nodeIds = parseNodeList(parsed);

    if (nodeIds.length === 0) {
      throw new PageIndexModelError({ reason: 'inspect action is missing node_list or node_id' });
    }

    return {
      action: 'inspect',
      nodeIds,
      rationale,
    };
  }

  if (action === 'answer') {
    const answerPlanValue = parsed.answer_plan ?? parsed.answerPlan;

    if (typeof answerPlanValue !== 'string' || !answerPlanValue.trim()) {
      throw new PageIndexModelError({ reason: 'answer action is missing answer_plan' });
    }

    return {
      action: 'answer',
      rationale,
      answerPlan: answerPlanValue.trim(),
    };
  }

  throw new PageIndexModelError({ reason: 'model action must be inspect or answer' });
};

const parseFrontierAction = (rawText: string): RetrievalAction => {
  const record = decodeModelPayload(
    RawSelectionPayloadSchema,
    extractJson(rawText),
    'frontier payload',
  );
  const action = record.action;
  const rationaleValue = record.rationale;
  const rationale = typeof rationaleValue === 'string' && rationaleValue.trim() ? rationaleValue.trim() : 'no rationale';

  if (action === 'answer') {
    const answerPlanValue = record.answer_plan ?? record.answerPlan;

    if (typeof answerPlanValue !== 'string' || !answerPlanValue.trim()) {
      throw new PageIndexModelError({ reason: 'answer action is missing answer_plan' });
    }

    return {
      action: 'answer',
      rationale,
      answerPlan: answerPlanValue.trim(),
    };
  }

  const nodeIds = parseNodeList(record);

  if (nodeIds.length === 0) {
    throw new PageIndexModelError({ reason: 'frontier selection is missing node_list or node_id' });
  }

  return {
    action: 'inspect',
    nodeIds,
    rationale,
  };
};

const parseAnswerPayload = (rawText: string): AnswerPayload => {
  const parsed = decodeModelPayload(
    RawAnswerPayloadSchema,
    extractJson(rawText),
    'answer payload',
  );

  if (!parsed.answer.trim()) {
    throw new PageIndexModelError({ reason: 'answer payload is missing answer' });
  }

  return {
    answer: parsed.answer.trim(),
    citations: parseStringArray(parsed.citations ?? parsed.citation_node_ids),
  };
};

const extractTextParts = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }

  if (!Array.isArray(value)) {
    return '';
  }

  return value
    .map((part) => {
      if (typeof part === 'string') {
        return part;
      }

      if (typeof part === 'object' && part !== null) {
        if ('text' in part && typeof part.text === 'string') {
          return part.text;
        }

        if ('content' in part && typeof part.content === 'string') {
          return part.content;
        }
      }

      return '';
    })
    .join('')
    .trim();
};

const extractModelText = (payload: unknown): string => {
  if (typeof payload === 'string') {
    return payload;
  }

  if (typeof payload !== 'object' || payload === null) {
    throw new PageIndexModelError({ reason: 'local model response is invalid' });
  }

  if ('output' in payload) {
    if (typeof payload.output === 'string') {
      return payload.output;
    }

    if (Array.isArray(payload.output)) {
      const messagePart = [...payload.output]
        .reverse()
        .find(
          (part) =>
            typeof part === 'object' &&
            part !== null &&
            'type' in part &&
            part.type === 'message' &&
            'content' in part,
        );

      if (typeof messagePart === 'object' && messagePart !== null && 'content' in messagePart) {
        const content = extractTextParts(messagePart.content);

        if (content) {
          return content;
        }
      }

      const outputText = extractTextParts(payload.output);

      if (outputText) {
        return outputText;
      }
    }
  }

  if ('response' in payload && typeof payload.response === 'string') {
    return payload.response;
  }

  if ('content' in payload && typeof payload.content === 'string') {
    return payload.content;
  }

  if ('choices' in payload && Array.isArray(payload.choices)) {
    const first = payload.choices[0];

    if (typeof first === 'object' && first !== null) {
      if ('text' in first && typeof first.text === 'string') {
        return first.text;
      }

      if ('message' in first && typeof first.message === 'object' && first.message !== null) {
        const content = 'content' in first.message ? first.message.content : undefined;
        const messageText = extractTextParts(content);

        if (messageText) {
          return messageText;
        }
      }
    }
  }

  throw new PageIndexModelError({ reason: 'could not extract text from local model response' });
};

const callLocalModel = (
  request: LocalModelRequest,
  options: LocalModelOptions,
): Effect.Effect<string, PageIndexAppError> => {
  if (options.chat) {
    return Effect.tryPromise({
      try: async () => options.chat!(request),
      catch: (cause) => new PageIndexModelError({ reason: toReason(cause) }),
    });
  }

  const fetchImpl = options.fetchImpl ?? fetch;

  return Effect.tryPromise({
    try: async () => {
      const response = await fetchImpl(request.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: request.model,
          system_prompt: request.systemPrompt,
          input: request.input,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`local model request failed with ${response.status}: ${body}`);
      }

      const payload = (await response.json()) as unknown;

      return extractModelText(payload);
    },
    catch: (cause) =>
      cause instanceof PageIndexModelError
        ? cause
        : new PageIndexModelError({ reason: toReason(cause) }),
  });
};

const normalizeSelection = (
  nodeIds: readonly string[],
  allowedNodeIds: readonly string[],
  stageLabel: string,
): string[] => {
  const allowed = new Set(allowedNodeIds);
  const deduped: string[] = [];

  for (const nodeId of nodeIds) {
    if (typeof nodeId !== 'string' || !nodeId.trim()) {
      continue;
    }

    const trimmed = nodeId.trim();

    if (!allowed.has(trimmed)) {
      throw new PageIndexActionInvalid({
        reason: `${stageLabel} chose node ${trimmed} outside the offered candidate set`,
      });
    }

    if (!deduped.includes(trimmed)) {
      deduped.push(trimmed);
    }
  }

  if (deduped.length === 0) {
    throw new PageIndexActionInvalid({ reason: `${stageLabel} returned no valid candidate ids` });
  }

  return deduped.slice(0, maxInspectBatch);
};

const normalizeSelectionEffect = (
  nodeIds: readonly string[],
  allowedNodeIds: readonly string[],
  stageLabel: string,
): Effect.Effect<string[], PageIndexActionInvalid> => {
  return Effect.try({
    try: () => normalizeSelection(nodeIds, allowedNodeIds, stageLabel),
    catch: (cause) =>
      cause instanceof PageIndexActionInvalid
        ? cause
        : new PageIndexActionInvalid({ reason: toReason(cause) }),
  });
};

const requestBranchSelection = (
  repository: PageIndexRepository,
  question: string,
  evidence: readonly PageIndexEvidence[],
  options: LocalModelOptions,
): Effect.Effect<RetrievalAction, PageIndexAppError> => {
  const inspectedNodeIds = evidence.map((item) => item.nodeId);
  const preferredBranchIds = derivePreferredBranchIds(question, repository.branches);
  const systemPrompt = [
    'You are a PageIndex-style reasoning retriever specialized for the FPF specification.',
    'Stage 1: choose up to 3 high-level FPF branches that most likely contain the answer.',
    'Use the reduced FPF branch index, not the full tree.',
    'If the gathered evidence is already sufficient, you may answer.',
    'Return JSON only.',
    'Allowed outputs:',
    '{"action":"inspect","node_list":["0001","0002"],"rationale":"..."}',
    '{"action":"inspect","node_id":"0001","rationale":"..."}',
    '{"action":"answer","rationale":"...","answer_plan":"..."}',
    'Choose only node ids that appear in the reduced FPF branch index.',
  ].join(' ');
  const input = [
    `Question:\n${question}`,
    '',
    `Inspected node ids: ${inspectedNodeIds.join(', ') || 'none'}`,
    `Preferred FPF branches by heuristic: ${preferredBranchIds.join(', ') || 'none'}`,
    '',
    'Reduced FPF branch index:',
    renderBranchIndex(repository.branches, preferredBranchIds),
    '',
    'Already inspected evidence:',
    renderEvidence(evidence),
  ].join('\n');

  return Effect.flatMap(
    callLocalModel(
      { endpoint: defaultEndpoint, model: defaultModel, systemPrompt, input },
      options,
    ),
    (rawText) => Effect.sync(() => parseRetrievalAction(rawText)),
  );
};

const requestFrontierSelection = (
  question: string,
  evidence: readonly PageIndexEvidence[],
  candidates: readonly FrontierCandidate[],
  options: LocalModelOptions,
): Effect.Effect<RetrievalAction, PageIndexAppError> => {
  const systemPrompt = [
    'You are a PageIndex-style reasoning retriever.',
    'Stage 2: choose up to 3 frontier nodes to inspect next.',
    'Routing nodes may be selected to descend into their children.',
    'Prefer inspectable nodes that answer the question directly.',
    'If the supplied evidence is already sufficient, you may answer.',
    'Return JSON only.',
    'Allowed outputs:',
    '{"action":"inspect","node_list":["0002","0003"],"rationale":"..."}',
    '{"action":"inspect","node_id":"0002","rationale":"..."}',
    '{"action":"answer","rationale":"...","answer_plan":"..."}',
    'Choose only node ids that appear in the frontier candidate list.',
  ].join(' ');
  const input = [
    `Question:\n${question}`,
    '',
    `Frontier candidate ids: ${candidates.map((candidate) => candidate.nodeId).join(', ')}`,
    '',
    'Frontier candidates:',
    renderFrontierCandidates(candidates),
    '',
    'Already inspected evidence:',
    renderEvidence(evidence),
  ].join('\n');

  return Effect.flatMap(
    callLocalModel(
      { endpoint: defaultEndpoint, model: defaultModel, systemPrompt, input },
      options,
    ),
    (rawText) => Effect.sync(() => parseFrontierAction(rawText)),
  );
};

const requestAnswer = (
  question: string,
  evidence: readonly PageIndexEvidence[],
  options: LocalModelOptions,
): Effect.Effect<AnswerPayload, PageIndexAppError> => {
  const systemPrompt = [
    'You answer questions using only the supplied evidence nodes.',
    'Return JSON only.',
    'Format: {"answer":"...","citations":["0001","0002"]}',
    'Do not cite node ids that are not present in the evidence.',
  ].join(' ');
  const input = [
    `Question:\n${question}`,
    '',
    'Evidence nodes:',
    renderEvidence(evidence),
  ].join('\n');

  return Effect.flatMap(
    callLocalModel(
      { endpoint: defaultEndpoint, model: defaultModel, systemPrompt, input },
      options,
    ),
    (rawText) => Effect.sync(() => parseAnswerPayload(rawText)),
  );
};

const seedBranchSelection = (
  repository: PageIndexRepository,
  branchNodeIds: readonly string[],
  frontier: Map<string, FrontierEntry>,
  visitedNodeIds: ReadonlySet<string>,
): string[] => {
  const seededChildIds: string[] = [];

  for (const nodeId of branchNodeIds) {
    addFrontierCandidate(frontier, nodeId, 'branch-root', visitedNodeIds);

    const branchNode = repository.contentsById.get(nodeId);

    if (!branchNode) {
      continue;
    }

    for (const childNodeId of branchNode.childNodeIds) {
      addFrontierCandidate(frontier, childNodeId, 'child-of-routing', visitedNodeIds);
      seededChildIds.push(childNodeId);
    }
  }

  return dedupeStrings(seededChildIds);
};

const consumeFrontierSelection = (
  repository: PageIndexRepository,
  selectedNodeIds: readonly string[],
  frontier: Map<string, FrontierEntry>,
  visitedNodeIds: Set<string>,
  evidence: PageIndexEvidence[],
): {
  titles: string[];
  notes: string[];
} => {
  const titles: string[] = [];
  const notes: string[] = [];

  for (const nodeId of selectedNodeIds) {
    const record = repository.contentsById.get(nodeId);

    if (!record) {
      throw new PageIndexNodeMissing({ nodeId });
    }

    const frontierEntry = frontier.get(nodeId);
    titles.push(record.title);
    visitedNodeIds.add(nodeId);
    frontier.delete(nodeId);

    const treatAsRouting = (
      record.childNodeIds.length > 0 &&
      (
        !isInspectable(repository, record) ||
        frontierEntry?.reasons.includes('branch-root') === true
      )
    );

    if (treatAsRouting) {
      const childIds: string[] = [];

      for (const childNodeId of record.childNodeIds) {
        addFrontierCandidate(frontier, childNodeId, 'child-of-routing', visitedNodeIds);

        if (!childIds.includes(childNodeId)) {
          childIds.push(childNodeId);
        }
      }

      notes.push(
        childIds.length === 0
          ? `Routing node ${nodeId} had no unvisited children to seed.`
          : `Expanded routing node ${nodeId} into ${childIds.join(', ')} via child-of-routing.`,
      );
      continue;
    }

    evidence.push({
      nodeId: record.nodeId,
      title: record.title,
      lineSpan: record.lineSpan,
      summary: record.summary,
      content: record.content,
    });

    const referenceTargets = findReferenceTargets(repository, record, visitedNodeIds).slice(0, maxFrontierCandidates);

    if (referenceTargets.length > 0) {
      for (const target of referenceTargets) {
        addFrontierCandidate(frontier, target.nodeId, 'reference-follow', visitedNodeIds);
      }

      notes.push(
        `Seeded ${referenceTargets.map((item) => item.nodeId).join(', ')} via reference-follow from ${nodeId}.`,
      );
    }

    if (isShortLeaf(record)) {
      const siblingTargets = getAdjacentSiblingRecords(repository, record).filter((item) => !visitedNodeIds.has(item.nodeId));

      if (siblingTargets.length > 0) {
        for (const target of siblingTargets) {
          addFrontierCandidate(frontier, target.nodeId, 'sibling-neighbor', visitedNodeIds);
        }

        notes.push(
          `Seeded ${siblingTargets.map((item) => item.nodeId).join(', ')} via sibling-neighbor from ${nodeId}.`,
        );
      }
    }
  }

  return { titles, notes };
};

export const indexPageIndexEffect = (
  cwd: string,
  targetPath = 'FPF/FPF-Spec.md',
  now: () => string = () => new Date().toISOString(),
): Effect.Effect<{
  artifactRoot: string;
  changed: boolean;
  nodeCount: number;
  targetPath: string;
}, PageIndexAppError> => {
  return Effect.tryPromise({
    try: async () => {
      const sourcePath = join(cwd, targetPath);
      const content = await readFile(sourcePath, 'utf8');
      const result = await ensurePageIndex({
        cwd,
        targetPath,
        content,
        generatedAt: now(),
      });

      return {
        artifactRoot: result.artifactRoot,
        changed: result.changed,
        nodeCount: result.nodeCount,
        targetPath,
      };
    },
    catch: (cause) =>
      isEnoent(cause)
        ? new PageIndexMissing({ path: join(cwd, targetPath) })
        : new PageIndexIoError({ path: join(cwd, targetPath), reason: toReason(cause) }),
  });
};

export const readPageIndexTreeEffect = (
  cwd: string,
): Effect.Effect<PageIndexTreeResult, PageIndexAppError> => {
  return Effect.map(loadRepository(cwd), (repository) => {
    return {
      maxHeadingDepth: repository.state.maxHeadingDepth,
      nodeCount: repository.state.nodeCount,
      sourcePath: repository.state.sourcePath,
      tree: repository.tree,
    };
  });
};

export const retrievePageIndexEffect = (
  cwd: string,
  question: string,
  options: LocalModelOptions = {},
): Effect.Effect<PageIndexRetrieveResult, PageIndexAppError> => {
  return Effect.gen(function* () {
    const trimmedQuestion = question.trim();

    if (!trimmedQuestion) {
      return yield* Effect.fail(new PageIndexQuestionEmpty({ question }));
    }

    const repository = yield* loadRepository(cwd);
    const maxSteps = options.maxSteps ?? defaultMaxSteps;
    const evidence: PageIndexEvidence[] = [];
    const visitedNodeIds = new Set<string>();
    const frontier = new Map<string, FrontierEntry>();
    const steps: PageIndexRetrievalStep[] = [];

    for (let step = 1; step <= maxSteps; step += 1) {
      let branchNotes: string[] = [];

      if (frontier.size === 0) {
        seedExactQuestionMatches(repository, trimmedQuestion, frontier, visitedNodeIds);

        if (frontier.size === 0) {
          const branchAction = yield* requestBranchSelection(repository, trimmedQuestion, evidence, options);

          if (branchAction.action === 'answer') {
            if (evidence.length === 0) {
              return yield* Effect.fail(
                new PageIndexActionInvalid({ reason: 'branch selection attempted to answer before any evidence was gathered' }),
              );
            }

            steps.push({
              step,
              action: 'answer',
              rationale: branchAction.rationale,
              answerPlan: branchAction.answerPlan,
            });

            return {
              question: trimmedQuestion,
              status: 'complete',
              steps,
              evidence,
              answerPlan: branchAction.answerPlan,
            };
          }

          const selectedBranchIds = yield* normalizeSelectionEffect(
            branchAction.nodeIds,
            repository.branches.map((branch) => branch.nodeId),
            'branch selection',
          );
          const seededChildIds = seedBranchSelection(repository, selectedBranchIds, frontier, visitedNodeIds);

          branchNotes = [
            `Branches ${selectedBranchIds.join(', ')} selected because ${asSentence(branchAction.rationale)}`,
            ...(seededChildIds.length > 0
              ? [`Seeded ${seededChildIds.join(', ')} via child-of-routing from the selected branches.`]
              : []),
          ];
        } else {
          branchNotes = ['Seeded exact question-id matches into the frontier before branch search.'];
        }
      }

      const frontierCandidates = rankFrontierCandidates(repository, frontier, trimmedQuestion);

      if (frontierCandidates.length === 0) {
        return yield* Effect.fail(new PageIndexActionInvalid({ reason: 'no frontier candidates remain to inspect' }));
      }

      const frontierAction = yield* requestFrontierSelection(
        trimmedQuestion,
        evidence,
        frontierCandidates,
        options,
      );

      if (frontierAction.action === 'answer') {
        if (evidence.length === 0) {
          return yield* Effect.fail(
            new PageIndexActionInvalid({ reason: 'frontier selection attempted to answer before any evidence was gathered' }),
          );
        }

        steps.push({
          step,
          action: 'answer',
          rationale: frontierAction.rationale,
          answerPlan: frontierAction.answerPlan,
        });

        return {
          question: trimmedQuestion,
          status: 'complete',
          steps,
          evidence,
          answerPlan: frontierAction.answerPlan,
        };
      }

      const selectedNodeIds = yield* normalizeSelectionEffect(
        frontierAction.nodeIds,
        frontierCandidates.map((candidate) => candidate.nodeId),
        'frontier selection',
      );
      const consumed = consumeFrontierSelection(
        repository,
        selectedNodeIds,
        frontier,
        visitedNodeIds,
        evidence,
      );
      const rationaleParts = [
        ...branchNotes,
        `Frontier nodes ${selectedNodeIds.join(', ')} selected because ${asSentence(frontierAction.rationale)}`,
        ...consumed.notes,
      ];

      steps.push({
        step,
        action: 'inspect',
        nodeId: selectedNodeIds[0]!,
        title: consumed.titles[0]!,
        nodeIds: selectedNodeIds,
        titles: consumed.titles,
        rationale: rationaleParts.join(' '),
      });
    }

    return {
      question: trimmedQuestion,
      status: 'step-limit',
      steps,
      evidence,
      answerPlan: null,
    };
  });
};

export const answerWithPageIndexEffect = (
  cwd: string,
  question: string,
  options: LocalModelOptions = {},
): Effect.Effect<PageIndexAnswerResult, PageIndexAppError> => {
  return Effect.gen(function* () {
    const retrieval = yield* retrievePageIndexEffect(cwd, question, options);

    if (retrieval.evidence.length === 0) {
      return yield* Effect.fail(new PageIndexEvidenceMissing({ question }));
    }

    const answerPayload = yield* requestAnswer(retrieval.question, retrieval.evidence, options);
    const citationIds = answerPayload.citations.filter((citation) =>
      retrieval.evidence.some((item) => item.nodeId === citation),
    );
    const finalCitationIds = [
      ...new Set(
        citationIds.length > 0 ? citationIds : retrieval.evidence.map((item) => item.nodeId),
      ),
    ];
    const citations = sortByLineSpan(
      finalCitationIds
        .map((nodeId) => retrieval.evidence.find((item) => item.nodeId === nodeId))
        .filter((item): item is PageIndexEvidence => item !== undefined)
        .map((item) => {
          return {
            nodeId: item.nodeId,
            title: item.title,
            lineSpan: item.lineSpan,
            label: renderCitationLabel(item.title, item.lineSpan),
          } satisfies PageIndexAnswerCitation;
        }),
    );

    return {
      question: retrieval.question,
      answer: answerPayload.answer,
      citations,
      rendered: renderAnswerResult(answerPayload.answer, citations),
      retrieval,
    };
  });
};

export const indexPageIndex = (
  cwd: string,
  targetPath = 'FPF/FPF-Spec.md',
  now: () => string = () => new Date().toISOString(),
): Promise<{
  artifactRoot: string;
  changed: boolean;
  nodeCount: number;
  targetPath: string;
}> => {
  return Effect.runPromise(indexPageIndexEffect(cwd, targetPath, now));
};

export const readPageIndexTree = (cwd: string): Promise<PageIndexTreeResult> => {
  return Effect.runPromise(readPageIndexTreeEffect(cwd));
};

export const retrievePageIndex = (
  cwd: string,
  question: string,
  options: LocalModelOptions = {},
): Promise<PageIndexRetrieveResult> => {
  return Effect.runPromise(retrievePageIndexEffect(cwd, question, options));
};

export const answerWithPageIndex = (
  cwd: string,
  question: string,
  options: LocalModelOptions = {},
): Promise<PageIndexAnswerResult> => {
  return Effect.runPromise(answerWithPageIndexEffect(cwd, question, options));
};
