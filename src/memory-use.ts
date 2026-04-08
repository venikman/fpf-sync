import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Agent } from '@mastra/core/agent';
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

export type ModelRequestPurpose = 'branch-selection' | 'frontier-selection' | 'answer-synthesis';

export type LocalModelRequest = {
  endpoint: string;
  model: string;
  systemPrompt: string;
  input: string;
  purpose?: ModelRequestPurpose;
};

export type OpenRouterOptions = {
  apiKey?: string;
  endpoint?: string;
  model?: string;
  timeoutMs?: number;
};

export type PageIndexTraceEvent =
  | {
      stage: 'retrieve-start';
      question: string;
      message: string;
    }
  | {
      stage: 'question-match';
      step: number;
      nodeIds: string[];
      frontierCount: number;
      message: string;
    }
  | {
      stage: 'branch-request';
      step: number;
      candidateCount: number;
      message: string;
    }
  | {
      stage: 'branch-selected';
      step: number;
      action: 'expand' | 'inspect';
      nodeIds: string[];
      frontierCount: number;
      message: string;
    }
  | {
      stage: 'frontier-request';
      step: number;
      candidateCount: number;
      frontierCount: number;
      evidenceCount: number;
      message: string;
    }
  | {
      stage: 'frontier-selected';
      step: number;
      action: 'expand' | 'inspect';
      nodeIds: string[];
      message: string;
    }
  | {
      stage: 'step-finish';
      step: number;
      action: 'expand' | 'inspect';
      nodeIds: string[];
      frontierCount: number;
      evidenceCount: number;
      message: string;
    }
  | {
      stage: 'answer-deferred';
      step: number;
      nodeId: string;
      action: 'expand' | 'inspect';
      evidenceCount: number;
      frontierCount: number;
      message: string;
    }
  | {
      stage: 'retrieve-complete';
      evidenceCount: number;
      answerPlan: string | null;
      message: string;
    }
  | {
      stage: 'retrieve-step-limit';
      stepCount: number;
      evidenceCount: number;
      message: string;
    }
  | {
      stage: 'answer-request';
      evidenceCount: number;
      message: string;
    }
  | {
      stage: 'answer-complete';
      evidenceCount: number;
      citationCount: number;
      message: string;
    }
  | {
      stage: 'model-usage';
      purpose: ModelRequestPurpose;
      model: string;
      endpoint: string;
      latencyMs: number;
      promptTokens: number | null;
      completionTokens: number | null;
      totalTokens: number | null;
      estimatedCostUsd: number | null;
      message: string;
    };

export type LocalModelOptions = {
  chat?: (request: LocalModelRequest) => Promise<string>;
  fetchImpl?: typeof fetch;
  maxSteps?: number;
  openRouter?: OpenRouterOptions;
  trace?: (event: PageIndexTraceEvent) => void;
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
      action: 'expand';
      nodeId: string;
      title: string;
      nodeIds: string[];
      titles: string[];
      rationale: string;
    }
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
  contents: PageIndexContentRecord[];
  contentsById: Map<string, PageIndexContentRecord>;
  contentsByCanonicalId: Map<string, PageIndexContentRecord[]>;
  contentsByAppendixLabel: Map<string, PageIndexContentRecord[]>;
};

type RetrievalAction =
  | {
      action: 'expand';
      nodeIds: string[];
      rationale: string;
    }
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
  | 'question-literal'
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
  pathLabel: string;
  childPreview: string[];
  score: number;
};

const defaultEndpoint = 'https://openrouter.ai/api/v1/chat/completions';
const defaultModel = 'minimax/minimax-m2.7';
const defaultMaxSteps = 6;
const defaultRequestTimeoutMs = 60_000;
const maxFrontierCandidates = 12;
const maxInspectBatch = 3;
const maxBranchRoutingCandidates = 6;
const maxBranchSeedCandidates = 8;
const maxQuestionLiteralMatches = 8;
const shortLeafLineBudget = 8;
type FrontierConsumeMode = 'expand' | 'inspect';

type FrontierConsumeResult = {
  mode: FrontierConsumeMode;
  notes: string[];
  titles: string[];
};

const reasonPriority: Record<FrontierReason, number> = {
  'question-exact-id': 0,
  'question-literal': 1,
  'reference-follow': 2,
  'child-of-routing': 3,
  'sibling-neighbor': 4,
  'branch-root': 5,
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
  'pattern',
  'patterns',
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

const highSignalLookupTokens = new Set([
  'alias',
  'aliases',
  'lexical',
  'morphology',
  'name',
  'naming',
  'ontology',
  'ontological',
  'prefix',
  'prefixes',
  'register',
  'registers',
  'rewrite',
  'rewrites',
  'suffix',
  'suffixes',
  'terminology',
  'token',
  'tokens',
  'twin',
]);

const lowSignalLookupTokens = new Set([
  'define',
  'defined',
  'explain',
  'meaning',
  'means',
  'rule',
  'rules',
  'section',
]);

const namingIntentTokens = new Set([
  'alias',
  'aliases',
  'label',
  'labels',
  'lexical',
  'lexicon',
  'name',
  'named',
  'naming',
  'register',
  'registers',
  'terminology',
  'term',
  'terms',
  'twin',
  'twins',
]);

const checklistIntentTokens = new Set([
  'acceptance',
  'checklist',
  'checklists',
  'conformance',
  'harness',
  'scr',
  'rscr',
  'template',
  'templates',
]);

const patternIntentTokens = new Set([
  'pattern',
  'patterns',
  'protocol',
  'use',
  'used',
]);

const toReason = (cause: unknown): string => {
  return cause instanceof Error ? cause.message : String(cause);
};

const isEnoent = (cause: unknown): cause is { code: 'ENOENT' } => {
  return typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'ENOENT';
};

type ResolvedOpenRouterConfig = {
  apiKey: string;
  endpoint: string;
  model: string;
  timeoutMs: number;
};

type ModelUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsd: number | null;
};

const trimConfiguredValue = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
};

const toPositiveInteger = (value: number | undefined): number | undefined => {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
};

const parseConfiguredPositiveInteger = (value: string | undefined): number | undefined => {
  const trimmed = trimConfiguredValue(value);

  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);

  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
};

const parseFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const parseTokenCount = (value: unknown): number | null => {
  const direct = parseFiniteNumber(value);

  if (direct !== null) {
    return direct;
  }

  if (typeof value === 'object' && value !== null && 'total' in value) {
    return parseFiniteNumber(value.total);
  }

  return null;
};

const pickFiniteNumber = (record: Record<string, unknown>, keys: readonly string[]): number | null => {
  for (const key of keys) {
    const value = parseFiniteNumber(record[key]);

    if (value !== null) {
      return value;
    }
  }

  return null;
};

const pickTokenCount = (record: Record<string, unknown>, keys: readonly string[]): number | null => {
  for (const key of keys) {
    const value = parseTokenCount(record[key]);

    if (value !== null) {
      return value;
    }
  }

  return null;
};

const pickFiniteNumberDeep = (
  value: unknown,
  keys: readonly string[],
  depth = 0,
): number | null => {
  if (depth > 4 || typeof value !== 'object' || value === null) {
    return null;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = pickFiniteNumberDeep(entry, keys, depth + 1);

      if (found !== null) {
        return found;
      }
    }

    return null;
  }

  const record = value as Record<string, unknown>;
  const direct = pickFiniteNumber(record, keys);

  if (direct !== null) {
    return direct;
  }

  for (const entry of Object.values(record)) {
    const found = pickFiniteNumberDeep(entry, keys, depth + 1);

    if (found !== null) {
      return found;
    }
  }

  return null;
};

const resolveRequestTarget = (
  options: LocalModelOptions,
): Pick<LocalModelRequest, 'endpoint' | 'model'> => {
  return {
    endpoint:
      trimConfiguredValue(options.openRouter?.endpoint) ??
      trimConfiguredValue(process.env.OPENROUTER_ENDPOINT) ??
      defaultEndpoint,
    model:
      trimConfiguredValue(options.openRouter?.model) ??
      trimConfiguredValue(process.env.OPENROUTER_MODEL) ??
      defaultModel,
  };
};

const resolveOpenRouterConfig = (
  request: LocalModelRequest,
  options: LocalModelOptions,
): ResolvedOpenRouterConfig => {
  const apiKey =
    trimConfiguredValue(options.openRouter?.apiKey) ??
    trimConfiguredValue(process.env.OPENROUTER_API_KEY);
  const timeoutMs =
    toPositiveInteger(options.openRouter?.timeoutMs) ??
    parseConfiguredPositiveInteger(process.env.OPENROUTER_TIMEOUT_MS) ??
    defaultRequestTimeoutMs;

  if (!apiKey) {
    throw new PageIndexModelError({
      reason: 'OpenRouter is not configured. Set OPENROUTER_API_KEY in .env or the environment.',
    });
  }

  return {
    apiKey,
    endpoint:
      trimConfiguredValue(options.openRouter?.endpoint) ??
      trimConfiguredValue(process.env.OPENROUTER_ENDPOINT) ??
      request.endpoint,
    model:
      trimConfiguredValue(options.openRouter?.model) ??
      trimConfiguredValue(process.env.OPENROUTER_MODEL) ??
      request.model,
    timeoutMs,
  };
};

const toModelReason = (cause: unknown, timeoutMs: number): string => {
  if (
    typeof cause === 'object' &&
    cause !== null &&
    'name' in cause &&
    cause.name === 'TimeoutError'
  ) {
    return `OpenRouter request timed out after ${timeoutMs}ms`;
  }

  return toReason(cause);
};

const emitTrace = (options: LocalModelOptions, event: PageIndexTraceEvent): void => {
  options.trace?.(event);
};

const toModelUsage = (
  usageLike: unknown,
  owner: unknown,
  tokenKeys: {
    prompt: readonly string[];
    completion: readonly string[];
    total: readonly string[];
  },
): ModelUsage | null => {
  if (typeof usageLike !== 'object' || usageLike === null || Array.isArray(usageLike)) {
    return null;
  }

  const record = usageLike as Record<string, unknown>;
  const promptTokens = pickTokenCount(record, tokenKeys.prompt);
  const completionTokens = pickTokenCount(record, tokenKeys.completion);
  const totalTokens =
    pickTokenCount(record, tokenKeys.total) ??
    (promptTokens !== null && completionTokens !== null ? promptTokens + completionTokens : null);
  const estimatedCostUsd = pickFiniteNumberDeep(owner, ['cost', 'total_cost', 'totalCost', 'estimatedCostUsd']);

  return promptTokens === null && completionTokens === null && totalTokens === null && estimatedCostUsd === null
    ? null
    : {
        promptTokens,
        completionTokens,
        totalTokens,
        estimatedCostUsd,
      };
};

const extractModelUsage = (payload: unknown): ModelUsage | null => {
  if (typeof payload !== 'object' || payload === null || !('usage' in payload)) {
    return null;
  }

  return toModelUsage(
    payload.usage,
    payload,
    {
      prompt: ['prompt_tokens', 'input_tokens', 'promptTokens', 'inputTokens'],
      completion: ['completion_tokens', 'output_tokens', 'completionTokens', 'outputTokens'],
      total: ['total_tokens', 'totalTokens'],
    },
  );
};

const extractMastraUsage = (result: unknown): ModelUsage | null => {
  if (typeof result !== 'object' || result === null) {
    return null;
  }

  const record = result as Record<string, unknown>;

  return (
    toModelUsage(
      record.totalUsage,
      result,
      {
        prompt: ['inputTokens', 'promptTokens'],
        completion: ['outputTokens', 'completionTokens'],
        total: ['totalTokens'],
      },
    ) ??
    toModelUsage(
      record.usage,
      result,
      {
        prompt: ['inputTokens', 'promptTokens'],
        completion: ['outputTokens', 'completionTokens'],
        total: ['totalTokens'],
      },
    )
  );
};

const formatUsageNumber = (value: number | null): string => {
  return value === null ? '?' : `${value}`;
};

const formatUsageCost = (value: number | null): string | null => {
  if (value === null) {
    return null;
  }

  return `$${value >= 0.01 ? value.toFixed(4) : value.toFixed(6)}`;
};

const emitModelUsageTrace = (
  options: LocalModelOptions,
  request: LocalModelRequest,
  config: ResolvedOpenRouterConfig,
  latencyMs: number,
  usage: ModelUsage | null,
): void => {
  if (!request.purpose) {
    return;
  }

  const cost = formatUsageCost(usage?.estimatedCostUsd ?? null);
  const message = usage
    ? `${request.purpose}: model ${config.model} responded in ${latencyMs}ms; tokens prompt=${formatUsageNumber(usage.promptTokens)} completion=${formatUsageNumber(usage.completionTokens)} total=${formatUsageNumber(usage.totalTokens)}${cost ? `; estimated-cost=${cost}` : ''}`
    : `${request.purpose}: model ${config.model} responded in ${latencyMs}ms; usage unavailable`;

  emitTrace(options, {
    stage: 'model-usage',
    purpose: request.purpose,
    model: config.model,
    endpoint: config.endpoint,
    latencyMs,
    promptTokens: usage?.promptTokens ?? null,
    completionTokens: usage?.completionTokens ?? null,
    totalTokens: usage?.totalTokens ?? null,
    estimatedCostUsd: usage?.estimatedCostUsd ?? null,
    message,
  });
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

const toLookupTokens = (input: string): string[] => {
  return dedupeStrings(
    normalizeLookupText(input)
      .split(' ')
      .map((token) => token.trim())
      .filter((token) => token.length >= 3 && !lookupStopWords.has(token)),
  );
};

const toIntentTokens = (input: string): string[] => {
  return dedupeStrings(
    normalizeLookupText(input)
      .split(' ')
      .map((token) => token.trim())
      .filter((token) => token.length >= 2),
  );
};

const hasIntentToken = (question: string, intentTokens: ReadonlySet<string>): boolean => {
  return toIntentTokens(question).some((token) => intentTokens.has(token));
};

const ignoredQuestionAcronymTokens = new Set(['FPF']);

const extractQuestionAcronymTokens = (input: string): string[] => {
  return dedupeStrings(
    [...input.matchAll(/\b[A-Z][A-Z0-9]{1,}\b/g)]
      .map((match) => match[0]?.trim().toUpperCase() ?? '')
      .filter((token) => token.length >= 3 && !ignoredQuestionAcronymTokens.has(token)),
  );
};

const escapeRegExp = (input: string): string => {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const containsWholeWord = (haystack: string, token: string): boolean => {
  if (!haystack || !token) {
    return false;
  }

  return new RegExp(`\\b${escapeRegExp(token)}\\b`, 'i').test(haystack);
};

const normalizeLookupText = (input: string): string => {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
    if (!haystack.includes(token)) {
      continue;
    }

    if (highSignalLookupTokens.has(token)) {
      score += 12;
      continue;
    }

    if (lowSignalLookupTokens.has(token)) {
      score += 2;
      continue;
    }

    score += token.length >= 6 ? 6 : 4;
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
      contents,
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

const getLineCount = (lineSpan: LineSpan): number => {
  return lineSpan.end - lineSpan.start + 1;
};

const isInspectable = (repository: PageIndexRepository, item: PageIndexContentRecord): boolean => {
  const lineCount = getLineCount(item.lineSpan);

  return (
    lineCount <= repository.state.inspectLineBudget &&
    item.content.length <= repository.state.inspectCharBudget
  );
};

const isShortLeaf = (item: PageIndexContentRecord): boolean => {
  const lineCount = getLineCount(item.lineSpan);

  return item.childNodeIds.length === 0 && lineCount <= shortLeafLineBudget;
};

const isCanonicalPatternRootRecord = (item: PageIndexContentRecord): boolean => {
  return item.depth <= 2 && item.canonicalIds.some((canonicalId) => canonicalId.length > 0 && !canonicalId.includes(':'));
};

const isHarnessLikeRecord = (item: PageIndexContentRecord): boolean => {
  const haystack = `${item.title} ${item.summary}`.toLowerCase();

  return (
    haystack.includes('acceptance harness') ||
    haystack.includes('conformance checklist') ||
    haystack.includes('canonical heading template') ||
    haystack.includes('canonical heading templates') ||
    haystack.includes('template') ||
    haystack.includes('scr/rscr')
  );
};

const isMigrationLikeRecord = (item: PageIndexContentRecord): boolean => {
  const haystack = `${item.title} ${item.summary}`.toLowerCase();

  return (
    haystack.includes('migration') ||
    haystack.includes('rename vs semantic change') ||
    haystack.includes('surface-bound naming') ||
    haystack.includes('terminology continuity') ||
    haystack.includes('legacy') ||
    haystack.includes('debt')
  );
};

const scoreQuestionLiteralMatches = (question: string, item: PageIndexContentRecord): number => {
  const acronymTokens = extractQuestionAcronymTokens(question);

  if (acronymTokens.length === 0) {
    return 0;
  }

  const headerHaystack = `${item.title} ${item.summary} ${item.references.join(' ')} ${item.canonicalIds.join(' ')}`;
  let score = 0;

  for (const token of acronymTokens) {
    if (containsWholeWord(headerHaystack, token)) {
      score += 18;
      continue;
    }

    if (containsWholeWord(item.content, token)) {
      score += 14;
    }
  }

  return score;
};

const scoreIntentHeuristics = (question: string, item: PageIndexContentRecord): number => {
  const hasNamingIntent = hasIntentToken(question, namingIntentTokens);
  const hasChecklistIntent = hasIntentToken(question, checklistIntentTokens);
  const hasPatternIntent = hasIntentToken(question, patternIntentTokens);
  let score = 0;

  if ((hasNamingIntent || hasPatternIntent) && isCanonicalPatternRootRecord(item)) {
    score += 12;
  }

  if (hasNamingIntent) {
    const namingHaystack = normalizeLookupText(`${item.title} ${item.summary} ${item.canonicalIds.join(' ')}`);

    if (
      namingHaystack.includes('naming') ||
      namingHaystack.includes('lexical') ||
      namingHaystack.includes('terminology') ||
      namingHaystack.includes('twin') ||
      namingHaystack.includes('term sheet') ||
      namingHaystack.includes('unified tech') ||
      namingHaystack.includes('plain')
    ) {
      score += 10;
    }
  }

  if (hasChecklistIntent && isHarnessLikeRecord(item)) {
    score += 12;
  }

  if ((hasNamingIntent || hasPatternIntent) && isMigrationLikeRecord(item)) {
    score -= 8;
  }

  return score;
};

const scoreStructuredContentMatch = (
  repository: PageIndexRepository,
  question: string,
  item: PageIndexContentRecord,
): number => {
  const lineCount = getLineCount(item.lineSpan);
  let score = scoreLookupMatch(
    question,
    [item.title, item.summary, item.references.join(' '), item.canonicalIds.join(' ')],
  );

  if (item.canonicalIds.length > 0) {
    score += 6;
  }

  if (isInspectable(repository, item)) {
    score += 2;
  }

  if (item.childNodeIds.length === 0) {
    score += 2;
  }

  if (lineCount <= shortLeafLineBudget) {
    score += 2;
  }

  if (item.depth <= 1 && item.canonicalIds.length === 0) {
    score -= 8;
  }

  if (item.canonicalIds.length === 0 && item.childNodeIds.length === 0 && lineCount <= 3) {
    score -= 4;
  }

  score += scoreQuestionLiteralMatches(question, item);
  score += scoreIntentHeuristics(question, item);

  return score;
};

const getBranchSectionRecords = (
  repository: PageIndexRepository,
  branch: FpfBranchRecord,
): PageIndexContentRecord[] => {
  const sectionRecords = repository.contents.filter((record) => {
    return (
      record.nodeId !== branch.nodeId &&
      record.lineSpan.start >= branch.lineSpan.start &&
      record.lineSpan.start <= branch.lineSpan.end
    );
  });

  if (branch.branchId === 'PREFACE') {
    return sectionRecords;
  }

  const prefix = `${branch.branchId}.`;
  const canonicalBranchRecords = sectionRecords.filter((record) =>
    record.canonicalIds.some((canonicalId) => canonicalId.startsWith(prefix)),
  );

  return canonicalBranchRecords.length > 0 ? canonicalBranchRecords : sectionRecords;
};

const rankBranchSectionRecords = (
  repository: PageIndexRepository,
  question: string,
  branch: FpfBranchRecord,
): PageIndexContentRecord[] => {
  return getBranchSectionRecords(repository, branch)
    .map((record) => ({
      record,
      score: scoreStructuredContentMatch(repository, question, record),
    }))
    .sort((left, right) => {
      return (
        right.score - left.score ||
        left.record.lineSpan.start - right.record.lineSpan.start ||
        left.record.nodeId.localeCompare(right.record.nodeId)
      );
    })
    .map((entry) => entry.record);
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
  question: string,
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

  return matches.sort((left, right) => {
    const leftScore = scoreStructuredContentMatch(repository, question, left);
    const rightScore = scoreStructuredContentMatch(repository, question, right);

    return rightScore - leftScore || left.lineSpan.start - right.lineSpan.start || left.nodeId.localeCompare(right.nodeId);
  });
};

const orderBranchesByQuestion = (
  branches: readonly FpfBranchRecord[],
  preferredBranchIds: readonly string[],
): FpfBranchRecord[] => {
  const preferredRank = new Map(preferredBranchIds.map((branchId, index) => [branchId, index]));

  return [...branches].sort((left, right) => {
    const leftRank = preferredRank.get(left.branchId) ?? Number.POSITIVE_INFINITY;
    const rightRank = preferredRank.get(right.branchId) ?? Number.POSITIVE_INFINITY;

    return leftRank - rightRank || left.lineSpan.start - right.lineSpan.start;
  });
};

const renderBranchIndex = (
  branches: readonly FpfBranchRecord[],
  preferredBranchIds: readonly string[],
): string => {
  return orderBranchesByQuestion(branches, preferredBranchIds)
    .map((branch) => {
      const prefixes = branch.patternPrefixes.length > 0 ? branch.patternPrefixes.join(', ') : 'none';
      const preview = branch.focusAreas.length > 0 ? branch.focusAreas.join(' | ') : 'none';
      const summary = truncateText(branch.summary, 140);

      return `- node ${branch.nodeId} | branch ${branch.branchId} | ${branch.title} | lines ${branch.lineSpan.start}-${branch.lineSpan.end} | prefixes ${prefixes} | preview ${truncateText(preview, 160)} | ${summary}`;
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

  const literalMatches = repository.contents
    .map((item) => ({
      item,
      score: scoreQuestionLiteralMatches(question, item),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      return (
        right.score - left.score ||
        left.item.lineSpan.start - right.item.lineSpan.start ||
        left.item.nodeId.localeCompare(right.item.nodeId)
      );
    })
    .slice(0, maxQuestionLiteralMatches);

  for (const match of literalMatches) {
    addFrontierCandidate(frontier, match.item.nodeId, 'question-literal', visitedNodeIds);
  }
};

const scoreBranchIntentHints = (question: string, branch: FpfBranchRecord): number => {
  const hasNamingIntent = hasIntentToken(question, namingIntentTokens);
  const hasChecklistIntent = hasIntentToken(question, checklistIntentTokens);
  let score = 0;

  if (hasNamingIntent) {
    switch (branch.branchId) {
      case 'F':
        score += 24;
        break;
      case 'E':
        score += 18;
        break;
      case 'H':
        score += 14;
        break;
      case 'K':
        score += 10;
        break;
      case 'G':
        score += 6;
        break;
    }
  }

  if (hasChecklistIntent) {
    switch (branch.branchId) {
      case 'F':
        score += 14;
        break;
      case 'E':
        score += 16;
        break;
      case 'G':
        score += 10;
        break;
      case 'H':
        score += 6;
        break;
    }
  }

  return score;
};

const derivePreferredBranchIds = (
  question: string,
  repository: PageIndexRepository,
): string[] => {
  const exact = new Set<string>();

  for (const canonicalId of extractCanonicalIds(question)) {
    const prefix = `${canonicalId.slice(0, 1)}.`;

    for (const branch of repository.branches) {
      if (branch.patternPrefixes.includes(prefix)) {
        exact.add(branch.branchId);
      }
    }
  }

  if (exact.size > 0) {
    return [...exact];
  }

  return repository.branches
    .map((branch) => {
      const sectionScore = rankBranchSectionRecords(repository, question, branch)
        .slice(0, maxBranchSeedCandidates)
        .reduce((best, record) => Math.max(best, scoreStructuredContentMatch(repository, question, record)), 0);
      const score = Math.max(
        scoreLookupMatch(
          question,
          [branch.title, branch.summary, branch.focusAreas.join(' '), branch.patternPrefixes.join(' ')],
        ),
        sectionScore,
      ) + scoreBranchIntentHints(question, branch);

      return {
        branchId: branch.branchId,
        lineStart: branch.lineSpan.start,
        score,
      };
    })
    .filter((branch) => branch.score > 0)
    .sort((left, right) => right.score - left.score || left.lineStart - right.lineStart)
    .map((branch) => branch.branchId);
};

const selectBranchRoutingCandidates = (
  question: string,
  repository: PageIndexRepository,
): FpfBranchRecord[] => {
  const preferredBranchIds = derivePreferredBranchIds(question, repository);

  return orderBranchesByQuestion(repository.branches, preferredBranchIds).slice(0, maxBranchRoutingCandidates);
};

const selectFallbackBranchIds = (
  question: string,
  repository: PageIndexRepository,
): string[] => {
  const preferredBranchIds = derivePreferredBranchIds(question, repository).slice(0, maxInspectBatch);

  if (preferredBranchIds.length > 0) {
    return preferredBranchIds;
  }

  return [...repository.branches]
    .sort((left, right) => left.lineSpan.start - right.lineSpan.start)
    .slice(0, maxInspectBatch)
    .map((branch) => branch.branchId);
};

const shouldKeepPreferredBranchInPlay = (question: string): boolean => {
  if (extractCanonicalIds(question).length > 0 || extractAppendixLabels(question).length > 0) {
    return false;
  }

  return (
    hasIntentToken(question, namingIntentTokens) ||
    hasIntentToken(question, checklistIntentTokens) ||
    hasIntentToken(question, patternIntentTokens)
  );
};

const augmentBranchSelection = (
  question: string,
  offeredBranches: readonly FpfBranchRecord[],
  selectedNodeIds: readonly string[],
): { nodeIds: string[]; notes: string[] } => {
  if (!shouldKeepPreferredBranchInPlay(question)) {
    return {
      nodeIds: [...selectedNodeIds],
      notes: [],
    };
  }

  const preferredBranch = offeredBranches[0];

  if (!preferredBranch || selectedNodeIds.includes(preferredBranch.nodeId) || selectedNodeIds.length >= maxInspectBatch) {
    return {
      nodeIds: [...selectedNodeIds],
      notes: [],
    };
  }

  return {
    nodeIds: [...selectedNodeIds, preferredBranch.nodeId],
    notes: [
      `Kept preferred branch ${preferredBranch.nodeId}/${preferredBranch.branchId} in play because this is a broad pattern/naming question without exact FPF ids.`,
    ],
  };
};

const buildNodePathTitles = (
  repository: PageIndexRepository,
  nodeId: string,
): string[] => {
  const titles: string[] = [];
  let current = repository.contentsById.get(nodeId);

  while (current) {
    titles.unshift(current.title);
    current = current.parentNodeId ? repository.contentsById.get(current.parentNodeId) : undefined;
  }

  return titles;
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

      const pathTitles = buildNodePathTitles(repository, item.nodeId);
      const childPreview = item.childNodeIds
        .map((childNodeId) => repository.contentsById.get(childNodeId)?.title)
        .filter((title): title is string => title !== undefined)
        .slice(0, 3);

      return {
        ...entry,
        title: item.title,
        summary: item.summary,
        depth: item.depth,
        childCount: item.childNodeIds.length,
        canonicalIds: item.canonicalIds,
        inspectable: isInspectable(repository, item),
        lineSpan: item.lineSpan,
        pathLabel: pathTitles.join(' > '),
        childPreview,
        score: scoreStructuredContentMatch(repository, question, item),
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
    .slice(0, maxFrontierCandidates);
};

const renderFrontierCandidates = (candidates: readonly FrontierCandidate[]): string => {
  return candidates
    .map((candidate) => {
      const canonicalIds = candidate.canonicalIds.length > 0 ? candidate.canonicalIds.join(', ') : 'none';
      const kind = candidate.inspectable ? 'inspectable' : 'routing';
      const childPreview = candidate.childPreview.length > 0 ? candidate.childPreview.join(' | ') : 'none';

      return `- ${candidate.nodeId} | ${candidate.title} | ${kind} | score ${candidate.score} | reasons ${candidate.reasons.join(', ')} | ids ${canonicalIds} | path ${candidate.pathLabel} | children ${candidate.childCount} | child-preview ${childPreview} | lines ${candidate.lineSpan.start}-${candidate.lineSpan.end} | ${truncateText(candidate.summary, 140)}`;
    })
    .join('\n');
};

const renderTraceBranchPreview = (
  branches: readonly FpfBranchRecord[],
  preferredBranchIds: readonly string[],
  maxItems = 6,
): string => {
  const orderedBranches = orderBranchesByQuestion(branches, preferredBranchIds);
  const preview = orderedBranches
    .slice(0, maxItems)
    .map((branch, index) => `#${index + 1} ${branch.nodeId}/${branch.branchId} ${truncateText(branch.title, 36)}`);

  if (orderedBranches.length > maxItems) {
    preview.push(`… +${orderedBranches.length - maxItems} more`);
  }

  return preview.join(' | ');
};

const renderTraceBranchSelectionPreview = (
  branches: readonly FpfBranchRecord[],
  preferredBranchIds: readonly string[],
  selectedNodeIds: readonly string[],
): string => {
  const orderedBranches = orderBranchesByQuestion(branches, preferredBranchIds);
  const rankByNodeId = new Map(orderedBranches.map((branch, index) => [branch.nodeId, index + 1]));

  return selectedNodeIds
    .map((nodeId) => {
      const branch = orderedBranches.find((candidate) => candidate.nodeId === nodeId);
      const rank = rankByNodeId.get(nodeId);
      const title = branch?.title ?? 'unknown';
      const branchId = branch?.branchId ?? '?';

      return `${rank ? `#${rank}` : '#?'} ${nodeId}/${branchId} ${truncateText(title, 40)}`;
    })
    .join(' | ');
};

const renderTraceNodePreview = (
  repository: PageIndexRepository,
  nodeIds: readonly string[],
  maxItems = 4,
): string => {
  const preview = nodeIds.slice(0, maxItems).map((nodeId) => {
    const title = repository.contentsById.get(nodeId)?.title ?? repository.branches.find((branch) => branch.nodeId === nodeId)?.title ?? 'unknown';

    return `${nodeId} ${truncateText(title, 48)}`;
  });

  if (nodeIds.length > maxItems) {
    preview.push(`… +${nodeIds.length - maxItems} more`);
  }

  return preview.join(' | ');
};

const renderTraceFrontierPreview = (
  candidates: readonly FrontierCandidate[],
  maxItems = 6,
): string => {
  const preview = candidates.slice(0, maxItems).map((candidate, index) => {
    const kind = candidate.inspectable ? 'inspect' : 'expand';

    return `#${index + 1} ${candidate.nodeId}:${kind}:s${candidate.score} ${truncateText(candidate.title, 34)}`;
  });

  if (candidates.length > maxItems) {
    preview.push(`… +${candidates.length - maxItems} more`);
  }

  return preview.join(' | ');
};

const renderTraceFrontierSelectionPreview = (
  candidates: readonly FrontierCandidate[],
  selectedNodeIds: readonly string[],
): string => {
  const rankByNodeId = new Map(candidates.map((candidate, index) => [candidate.nodeId, index + 1]));
  const candidateByNodeId = new Map(candidates.map((candidate) => [candidate.nodeId, candidate]));

  return selectedNodeIds
    .map((nodeId) => {
      const candidate = candidateByNodeId.get(nodeId);
      const rank = rankByNodeId.get(nodeId);
      const title = candidate?.title ?? 'unknown';
      const kind = candidate?.inspectable ? 'inspect' : 'expand';
      const score = candidate?.score ?? 0;

      return `${rank ? `#${rank}` : '#?'} ${nodeId}:${kind}:s${score} ${truncateText(title, 36)}`;
    })
    .join(' | ');
};

const renderTraceEvidencePreview = (
  evidence: readonly PageIndexEvidence[],
  maxItems = 3,
): string => {
  if (evidence.length === 0) {
    return 'none';
  }

  const preview = evidence.slice(-maxItems).map((item) => `${item.nodeId} ${truncateText(item.title, 44)}`);

  if (evidence.length > maxItems) {
    preview.unshift(`… ${evidence.length - maxItems} earlier`);
  }

  return preview.join(' | ');
};

const scoreEvidenceMatch = (
  repository: PageIndexRepository,
  question: string,
  evidence: readonly PageIndexEvidence[],
): number => {
  return evidence.reduce((best, item) => {
    const contentRecord = repository.contentsById.get(item.nodeId);
    const score = contentRecord
      ? scoreStructuredContentMatch(repository, question, contentRecord)
      : (() => {
          let fallbackScore = scoreLookupMatch(question, [item.title, item.summary, item.content]);

          if (extractCanonicalIds(`${item.title} ${item.summary}`).length > 0) {
            fallbackScore += 6;
          }

          if (getLineCount(item.lineSpan) <= shortLeafLineBudget) {
            fallbackScore += 2;
          }

          return fallbackScore;
        })();

    return Math.max(best, score);
  }, 0);
};

const selectAnswerDeferralCandidate = (
  repository: PageIndexRepository,
  question: string,
  evidence: readonly PageIndexEvidence[],
  candidates: readonly FrontierCandidate[],
): FrontierCandidate | null => {
  const bestCandidate = candidates[0];

  if (!bestCandidate) {
    return null;
  }

  const bestEvidenceScore = scoreEvidenceMatch(repository, question, evidence);
  const hasHighSignalIntent = toLookupTokens(question).some((token) => highSignalLookupTokens.has(token));
  const minimumCandidateScore = hasHighSignalIntent ? 10 : 12;
  const requiredLead = hasHighSignalIntent ? 4 : 6;

  if (
    bestCandidate.score >= minimumCandidateScore &&
    bestCandidate.score > bestEvidenceScore + requiredLead
  ) {
    return bestCandidate;
  }

  return null;
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

  if (action === 'expand' || action === 'inspect') {
    const nodeIds = parseNodeList(parsed);

    if (nodeIds.length === 0) {
      throw new PageIndexModelError({ reason: `${action} action is missing node_list or node_id` });
    }

    return {
      action,
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

  throw new PageIndexModelError({ reason: 'model action must be expand, inspect, or answer' });
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

  if (action !== 'expand' && action !== 'inspect') {
    throw new PageIndexModelError({ reason: 'frontier action must be expand, inspect, or answer' });
  }

  const nodeIds = parseNodeList(record);

  if (nodeIds.length === 0) {
    throw new PageIndexModelError({ reason: `${action} action is missing node_list or node_id` });
  }

  return {
    action,
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

const parseModelOutputEffect = <T>(
  rawText: string,
  parse: (rawText: string) => T,
): Effect.Effect<T, PageIndexModelError> => {
  return Effect.try({
    try: () => parse(rawText),
    catch: (cause) =>
      cause instanceof PageIndexModelError
        ? cause
        : new PageIndexModelError({ reason: toReason(cause) }),
  });
};

const isRecoverableModelFormatError = (error: PageIndexAppError): error is PageIndexModelError => {
  return error._tag === 'PageIndexModelError' && (
    /valid json/i.test(error.reason) ||
    /payload is invalid/i.test(error.reason) ||
    /could not extract text/i.test(error.reason) ||
    /response is invalid/i.test(error.reason) ||
    /action must be/i.test(error.reason) ||
    /missing node_list or node_id/i.test(error.reason) ||
    /missing answer_plan/i.test(error.reason) ||
    /missing answer/i.test(error.reason)
  );
};

const requestParsedModelOutput = <T>(
  request: LocalModelRequest,
  options: LocalModelOptions,
  parse: (rawText: string) => T,
  retryHint: string,
): Effect.Effect<T, PageIndexAppError> => {
  const parseRequest = (candidate: LocalModelRequest): Effect.Effect<T, PageIndexAppError> => {
    return Effect.flatMap(callLocalModel(candidate, options), (rawText) => parseModelOutputEffect(rawText, parse));
  };

  return Effect.catchAll(parseRequest(request), (error) => {
    if (!isRecoverableModelFormatError(error)) {
      return Effect.fail(error);
    }

    return parseRequest({
      ...request,
      input: `${request.input}\n\nRetry instruction:\n${retryHint}`,
    });
  });
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
    throw new PageIndexModelError({ reason: 'model response is invalid' });
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

  throw new PageIndexModelError({ reason: 'could not extract text from model response' });
};

const toMastraBaseUrl = (endpoint: string): string => {
  const trimmed = endpoint.trim().replace(/\/+$/, '');

  return trimmed.replace(/\/chat\/completions$/i, '');
};

const toMastraModelId = (model: string): `${string}/${string}` => {
  if (!model.includes('/')) {
    throw new PageIndexModelError({
      reason: `OpenRouter model must contain a provider/model id for Mastra compatibility: ${model}`,
    });
  }

  return model as `${string}/${string}`;
};

const callLocalModelViaFetch = (
  request: LocalModelRequest,
  fetchImpl: typeof fetch,
  config: ResolvedOpenRouterConfig,
  options: LocalModelOptions,
): Promise<string> => {
  return (async () => {
    const startedAt = Date.now();
    const response = await fetchImpl(config.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: 'system',
            content: request.systemPrompt,
          },
          {
            role: 'user',
            content: request.input,
          },
        ],
        temperature: 0,
      }),
      signal: AbortSignal.timeout(config.timeoutMs),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenRouter request failed with ${response.status}: ${body}`);
    }

    const payload = (await response.json()) as unknown;
    const text = extractModelText(payload);

    emitModelUsageTrace(options, request, config, Date.now() - startedAt, extractModelUsage(payload));

    return text;
  })();
};

const callLocalModelViaMastra = (
  request: LocalModelRequest,
  config: ResolvedOpenRouterConfig,
  options: LocalModelOptions,
): Promise<string> => {
  return (async () => {
    const startedAt = Date.now();
    const agent = new Agent({
      id: 'pageindex-openrouter-gateway',
      name: 'PageIndex OpenRouter Gateway',
      instructions: request.systemPrompt,
      model: {
        id: toMastraModelId(config.model),
        url: toMastraBaseUrl(config.endpoint),
        apiKey: config.apiKey,
      },
    });
    const output = await agent.generate(request.input, {
      maxSteps: 1,
      abortSignal: AbortSignal.timeout(config.timeoutMs),
    });

    if (output.error) {
      throw output.error;
    }

    emitModelUsageTrace(options, request, config, Date.now() - startedAt, extractMastraUsage(output));

    return output.text;
  })();
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

  return Effect.flatMap(
    Effect.try({
      try: () => resolveOpenRouterConfig(request, options),
      catch: (cause) =>
        cause instanceof PageIndexModelError
          ? cause
          : new PageIndexModelError({ reason: toReason(cause) }),
    }),
    (config) =>
      Effect.tryPromise({
        try: async () => {
          return options.fetchImpl
            ? callLocalModelViaFetch(request, options.fetchImpl, config, options)
            : callLocalModelViaMastra(request, config, options);
        },
        catch: (cause) =>
          cause instanceof PageIndexModelError
            ? cause
            : new PageIndexModelError({ reason: toModelReason(cause, config.timeoutMs) }),
      }),
  );
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

const normalizeBranchSelection = (
  selectedIds: readonly string[],
  branches: readonly FpfBranchRecord[],
): string[] => {
  const branchIdToNodeId = new Map<string, string>();
  const allowedNodeIds = new Set<string>();
  const normalizedIds: string[] = [];

  for (const branch of branches) {
    branchIdToNodeId.set(branch.branchId, branch.nodeId);
    allowedNodeIds.add(branch.nodeId);
  }

  for (const selectedId of selectedIds) {
    if (typeof selectedId !== 'string' || !selectedId.trim()) {
      continue;
    }

    const trimmed = selectedId.trim();
    const resolvedNodeId = allowedNodeIds.has(trimmed)
      ? trimmed
      : branchIdToNodeId.get(trimmed.toUpperCase());

    if (!resolvedNodeId) {
      throw new PageIndexActionInvalid({
        reason: `branch selection chose node ${trimmed} outside the offered candidate set`,
      });
    }

    if (!normalizedIds.includes(resolvedNodeId)) {
      normalizedIds.push(resolvedNodeId);
    }
  }

  if (normalizedIds.length === 0) {
    throw new PageIndexActionInvalid({ reason: 'branch selection returned no valid candidate ids' });
  }

  return normalizedIds.slice(0, maxInspectBatch);
};

const normalizeBranchSelectionEffect = (
  selectedIds: readonly string[],
  branches: readonly FpfBranchRecord[],
): Effect.Effect<string[], PageIndexActionInvalid> => {
  return Effect.try({
    try: () => normalizeBranchSelection(selectedIds, branches),
    catch: (cause) =>
      cause instanceof PageIndexActionInvalid
        ? cause
        : new PageIndexActionInvalid({ reason: toReason(cause) }),
  });
};

const isTimeoutModelError = (error: PageIndexAppError): error is PageIndexModelError => {
  return error._tag === 'PageIndexModelError' && /timed out/i.test(error.reason);
};

type BranchSelectionAttempt = {
  action: RetrievalAction;
  source: 'model' | 'timeout-fallback';
  timeoutReason: string | null;
};

type FrontierSelectionAttempt = {
  action: RetrievalAction;
  source: 'model' | 'error-fallback';
  fallbackReason: string | null;
};

const requestBranchSelectionWithTimeoutFallback = (
  repository: PageIndexRepository,
  offeredBranches: readonly FpfBranchRecord[],
  question: string,
  evidence: readonly PageIndexEvidence[],
  options: LocalModelOptions,
): Effect.Effect<BranchSelectionAttempt, PageIndexAppError> => {
  return Effect.flatMap(
    Effect.either(requestBranchSelection(offeredBranches, question, evidence, options)),
    (result): Effect.Effect<BranchSelectionAttempt, PageIndexAppError> => {
      if (result._tag === 'Right') {
        const attempt: BranchSelectionAttempt = {
          action: result.right,
          source: 'model',
          timeoutReason: null,
        };

        return Effect.succeed(attempt);
      }

      if (!isTimeoutModelError(result.left)) {
        return Effect.fail(result.left);
      }

      const attempt: BranchSelectionAttempt = {
        action: {
          action: 'expand',
          nodeIds: selectFallbackBranchIds(question, repository),
          rationale: 'OpenRouter branch routing timed out, so the controller fell back to deterministic reduced-branch ranking.',
        },
        source: 'timeout-fallback',
        timeoutReason: result.left.reason,
      };

      return Effect.succeed(attempt);
    },
  );
};

const buildFrontierAliasToNodeId = (
  candidates: readonly FrontierCandidate[],
): Map<string, string> => {
  const aliasToNodeId = new Map<string, string>();

  for (const candidate of candidates) {
    const aliases = [candidate.nodeId, ...candidate.canonicalIds]
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    for (const alias of aliases) {
      if (!aliasToNodeId.has(alias)) {
        aliasToNodeId.set(alias, candidate.nodeId);
      }

      const upper = alias.toUpperCase();

      if (!aliasToNodeId.has(upper)) {
        aliasToNodeId.set(upper, candidate.nodeId);
      }
    }
  }

  return aliasToNodeId;
};

const coerceFrontierAction = (
  action: RetrievalAction,
  candidates: readonly FrontierCandidate[],
  evidence: readonly PageIndexEvidence[],
): RetrievalAction => {
  if (action.action === 'answer') {
    return action;
  }

  const aliasToNodeId = buildFrontierAliasToNodeId(candidates);
  const allowedNodeIds = new Set(candidates.map((candidate) => candidate.nodeId));
  const evidenceIds = new Set(evidence.map((item) => item.nodeId));
  const requestedNodeIds = dedupeStrings(
    action.nodeIds.map((nodeId) => nodeId.trim()).filter((nodeId) => nodeId.length > 0),
  );
  const validNodeIds = dedupeStrings(
    requestedNodeIds
      .map((nodeId) => aliasToNodeId.get(nodeId) ?? aliasToNodeId.get(nodeId.toUpperCase()) ?? nodeId)
      .filter((nodeId) => allowedNodeIds.has(nodeId)),
  );

  if (validNodeIds.length > 0) {
    return {
      ...action,
      nodeIds: validNodeIds.slice(0, maxInspectBatch),
    };
  }

  const repeatedEvidenceNodeIds = requestedNodeIds.filter((nodeId) => evidenceIds.has(nodeId));

  if (
    requestedNodeIds.length > 0 &&
    repeatedEvidenceNodeIds.length === requestedNodeIds.length &&
    evidence.length > 0
  ) {
    return {
      action: 'answer',
      rationale: `${action.rationale} The model reselected already inspected evidence instead of the offered frontier.`,
      answerPlan: `Answer from the current evidence after the model reselected ${repeatedEvidenceNodeIds.join(', ')}.`,
    };
  }

  throw new PageIndexActionInvalid({
    reason: `${action.action === 'expand' ? 'frontier expand' : 'frontier selection'} chose node ${requestedNodeIds[0] ?? 'unknown'} outside the offered candidate set`,
  });
};

const coerceFrontierActionEffect = (
  action: RetrievalAction,
  candidates: readonly FrontierCandidate[],
  evidence: readonly PageIndexEvidence[],
): Effect.Effect<RetrievalAction, PageIndexActionInvalid> => {
  return Effect.try({
    try: () => coerceFrontierAction(action, candidates, evidence),
    catch: (cause) =>
      cause instanceof PageIndexActionInvalid
        ? cause
        : new PageIndexActionInvalid({ reason: toReason(cause) }),
  });
};

const selectFallbackFrontierAction = (
  candidates: readonly FrontierCandidate[],
): RetrievalAction => {
  const inspectableNodeIds = candidates
    .filter((candidate) => candidate.inspectable)
    .slice(0, maxInspectBatch)
    .map((candidate) => candidate.nodeId);

  if (inspectableNodeIds.length > 0) {
    return {
      action: 'inspect',
      nodeIds: inspectableNodeIds,
      rationale: 'The controller fell back to deterministic ranked frontier inspection because the frontier model response was unavailable or invalid.',
    };
  }

  return {
    action: 'expand',
    nodeIds: candidates.slice(0, maxInspectBatch).map((candidate) => candidate.nodeId),
    rationale: 'The controller fell back to deterministic ranked frontier expansion because the frontier model response was unavailable or invalid.',
  };
};

const requestFrontierSelectionWithFallback = (
  question: string,
  evidence: readonly PageIndexEvidence[],
  candidates: readonly FrontierCandidate[],
  options: LocalModelOptions,
): Effect.Effect<FrontierSelectionAttempt, PageIndexAppError> => {
  return Effect.flatMap(
    Effect.either(requestFrontierSelection(question, evidence, candidates, options)),
    (result): Effect.Effect<FrontierSelectionAttempt, PageIndexAppError> => {
      if (result._tag === 'Right') {
        return Effect.succeed({
          action: result.right,
          source: 'model',
          fallbackReason: null,
        });
      }

      if (!(isTimeoutModelError(result.left) || isRecoverableModelFormatError(result.left))) {
        return Effect.fail(result.left);
      }

      return Effect.succeed({
        action: selectFallbackFrontierAction(candidates),
        source: 'error-fallback',
        fallbackReason: result.left.reason,
      });
    },
  );
};

const requestBranchSelection = (
  offeredBranches: readonly FpfBranchRecord[],
  question: string,
  evidence: readonly PageIndexEvidence[],
  options: LocalModelOptions,
): Effect.Effect<RetrievalAction, PageIndexAppError> => {
  const inspectedNodeIds = evidence.map((item) => item.nodeId);
  const preferredBranchIds = offeredBranches.map((branch) => branch.branchId);
  const systemPrompt = [
    'You are a PageIndex-style reasoning retriever specialized for the FPF specification.',
    'Stage 1: choose up to 3 high-level FPF branches to expand into the next tree slice.',
    'Use the reduced FPF branch index, not the full tree.',
    'Prefer expand for routing nodes. Legacy inspect is still accepted if you only want to point at branch nodes.',
    'For broad "which pattern should I use" questions, keep the strongest owner branch in play before glossary, annex, or navigation surfaces.',
    'If the gathered evidence is already sufficient, you may answer.',
    'Return JSON only.',
    'Allowed outputs:',
    '{"action":"expand","node_list":["0001","0002"],"rationale":"..."}',
    '{"action":"expand","node_id":"0001","rationale":"..."}',
    '{"action":"inspect","node_list":["0001"],"rationale":"..."}',
    '{"action":"answer","rationale":"...","answer_plan":"..."}',
    'Important: each branch row shows both a branch label and a node id. Return node ids only, never branch labels.',
    'Choose only node ids that appear in the reduced FPF branch index.',
  ].join(' ');
  const input = [
    `Question:\n${question}`,
    '',
    `Inspected node ids: ${inspectedNodeIds.join(', ') || 'none'}`,
    '',
    'Reduced FPF branch index:',
    renderBranchIndex(offeredBranches, preferredBranchIds),
    '',
    'Already inspected evidence:',
    renderEvidence(evidence),
  ].join('\n');

  const target = resolveRequestTarget(options);

  return requestParsedModelOutput(
    {
      endpoint: target.endpoint,
      model: target.model,
      systemPrompt,
      input,
      purpose: 'branch-selection',
    },
    options,
    parseRetrievalAction,
    'Return JSON only with one allowed branch action and node ids from the reduced branch index. No prose, no markdown fences, no commentary.',
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
    'Stage 2: choose up to 3 frontier nodes from the current tree slice.',
    'Use expand for routing nodes when you want to descend into children.',
    'Use inspect for evidence-bearing nodes when you want to read their content.',
    'Prefer inspectable nodes that answer the question directly.',
    'If the supplied evidence is already sufficient, you may answer.',
    'Return JSON only.',
    'Allowed outputs:',
    '{"action":"expand","node_list":["0002","0003"],"rationale":"..."}',
    '{"action":"expand","node_id":"0002","rationale":"..."}',
    '{"action":"inspect","node_list":["0002","0003"],"rationale":"..."}',
    '{"action":"inspect","node_id":"0002","rationale":"..."}',
    '{"action":"answer","rationale":"...","answer_plan":"..."}',
    'Choose only node ids that appear in the frontier candidate list.',
    'Already inspected evidence ids are context only, not frontier candidates. If the current evidence is enough, return answer instead of repeating an evidence id.',
  ].join(' ');
  const input = [
    `Question:\n${question}`,
    '',
    `Frontier candidate ids: ${candidates.map((candidate) => candidate.nodeId).join(', ')}`,
    '',
    'Current tree-slice frontier candidates:',
    renderFrontierCandidates(candidates),
    '',
    'Already inspected evidence:',
    renderEvidence(evidence),
  ].join('\n');

  const target = resolveRequestTarget(options);

  return requestParsedModelOutput(
    {
      endpoint: target.endpoint,
      model: target.model,
      systemPrompt,
      input,
      purpose: 'frontier-selection',
    },
    options,
    parseFrontierAction,
    'Return JSON only with one allowed frontier action and node ids from the frontier candidate list. No prose, no markdown fences, no commentary.',
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

  const target = resolveRequestTarget(options);

  return requestParsedModelOutput(
    {
      endpoint: target.endpoint,
      model: target.model,
      systemPrompt,
      input,
      purpose: 'answer-synthesis',
    },
    options,
    parseAnswerPayload,
    'Return JSON only in the form {"answer":"...","citations":["0001"]}. No prose, no markdown fences, no commentary.',
  );
};

const seedBranchSelection = (
  repository: PageIndexRepository,
  question: string,
  branchNodeIds: readonly string[],
  frontier: Map<string, FrontierEntry>,
  visitedNodeIds: ReadonlySet<string>,
): string[] => {
  const seededNodeIds: string[] = [];

  for (const nodeId of branchNodeIds) {
    const branch = repository.branches.find((candidate) => candidate.nodeId === nodeId);
    const branchNode = repository.contentsById.get(nodeId);
    const branchSectionSeedIds = branch
      ? rankBranchSectionRecords(repository, question, branch)
          .slice(0, maxBranchSeedCandidates)
          .map((record) => record.nodeId)
      : [];
    const childSeedIds = branchNode?.childNodeIds ?? [];
    const seedIds = dedupeStrings([...branchSectionSeedIds, ...childSeedIds]).slice(
      0,
      maxBranchSeedCandidates,
    );

    if (seedIds.length === 0) {
      addFrontierCandidate(frontier, nodeId, 'branch-root', visitedNodeIds);
      continue;
    }

    for (const seedId of seedIds) {
      addFrontierCandidate(frontier, seedId, 'child-of-routing', visitedNodeIds);
      seededNodeIds.push(seedId);
    }
  }

  return dedupeStrings(seededNodeIds);
};

const consumeFrontierSelection = (
  repository: PageIndexRepository,
  question: string,
  selectionAction: 'expand' | 'inspect',
  selectedNodeIds: readonly string[],
  frontier: Map<string, FrontierEntry>,
  visitedNodeIds: Set<string>,
  evidence: PageIndexEvidence[],
): FrontierConsumeResult => {
  const titles: string[] = [];
  const notes: string[] = [];
  let expandedAny = false;
  let inspectedAny = false;

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
        selectionAction === 'expand' ||
        !isInspectable(repository, record) ||
        frontierEntry?.reasons.includes('branch-root') === true
      )
    );

    if (treatAsRouting) {
      expandedAny = true;
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

    inspectedAny = true;
    evidence.push({
      nodeId: record.nodeId,
      title: record.title,
      lineSpan: record.lineSpan,
      summary: record.summary,
      content: record.content,
    });

    const referenceTargets = findReferenceTargets(repository, question, record, visitedNodeIds).slice(0, maxFrontierCandidates);

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

  return {
    mode: expandedAny && !inspectedAny ? 'expand' : 'inspect',
    titles,
    notes,
  };
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

    emitTrace(options, {
      stage: 'retrieve-start',
      question: trimmedQuestion,
      message: `retrieval started for question: ${trimmedQuestion}`,
    });

    for (let step = 1; step <= maxSteps; step += 1) {
      let branchNotes: string[] = [];

      if (frontier.size === 0) {
        seedExactQuestionMatches(repository, trimmedQuestion, frontier, visitedNodeIds);

        if (frontier.size > 0) {
          emitTrace(options, {
            stage: 'question-match',
            step,
            nodeIds: [...frontier.keys()],
            frontierCount: frontier.size,
            message: `step ${step}: seeded exact question matches ${[...frontier.keys()].join(', ')}; matches=${renderTraceNodePreview(repository, [...frontier.keys()])}`,
          });
        }

        if (frontier.size === 0) {
          const offeredBranches = selectBranchRoutingCandidates(trimmedQuestion, repository);
          const offeredBranchIds = offeredBranches.map((branch) => branch.branchId);

          emitTrace(options, {
            stage: 'branch-request',
            step,
            candidateCount: offeredBranches.length,
            message: `step ${step}: asking the model to route across ${offeredBranches.length} FPF branches; rows=${renderTraceBranchPreview(offeredBranches, offeredBranchIds)}`,
          });
          const branchAttempt = yield* requestBranchSelectionWithTimeoutFallback(
            repository,
            offeredBranches,
            trimmedQuestion,
            evidence,
            options,
          );
          const branchAction = branchAttempt.action;

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

            emitTrace(options, {
              stage: 'retrieve-complete',
              evidenceCount: evidence.length,
              answerPlan: branchAction.answerPlan,
              message: `retrieval completed at branch stage with ${evidence.length} evidence node(s); evidence=${renderTraceEvidencePreview(evidence)}`,
            });

            return {
              question: trimmedQuestion,
              status: 'complete',
              steps,
              evidence,
              answerPlan: branchAction.answerPlan,
            };
          }

          const selectedBranchIds = yield* normalizeBranchSelectionEffect(
            branchAction.nodeIds,
            offeredBranches,
          );
          const augmentedBranchSelection = augmentBranchSelection(
            trimmedQuestion,
            offeredBranches,
            selectedBranchIds,
          );
          const seededChildIds = seedBranchSelection(
            repository,
            trimmedQuestion,
            augmentedBranchSelection.nodeIds,
            frontier,
            visitedNodeIds,
          );

          branchNotes = [
            ...(branchAttempt.source === 'timeout-fallback'
              ? [`Branch routing fell back to deterministic reduced-branch ranking because ${asSentence(branchAttempt.timeoutReason ?? 'the model timed out')}`]
              : []),
            `Branches ${augmentedBranchSelection.nodeIds.join(', ')} ${branchAction.action === 'expand' ? 'expanded' : 'selected'} because ${asSentence(branchAction.rationale)}`,
            ...augmentedBranchSelection.notes,
            ...(seededChildIds.length > 0
              ? [`Seeded ${seededChildIds.join(', ')} into the frontier from the selected branch sections.`]
              : []),
          ];

          emitTrace(options, {
            stage: 'branch-selected',
            step,
            action: branchAction.action,
            nodeIds: augmentedBranchSelection.nodeIds,
            frontierCount: frontier.size,
            message:
              branchAttempt.source === 'timeout-fallback'
                ? `step ${step}: branch routing timed out and fell back to deterministic reduced-branch ranking; selected=${renderTraceBranchSelectionPreview(offeredBranches, offeredBranchIds, augmentedBranchSelection.nodeIds)}; frontier now has ${frontier.size} node(s)`
                : `step ${step}: model ${branchAction.action === 'expand' ? 'expanded' : 'selected'} branches ${augmentedBranchSelection.nodeIds.join(', ')}; selected=${renderTraceBranchSelectionPreview(offeredBranches, offeredBranchIds, augmentedBranchSelection.nodeIds)}; frontier now has ${frontier.size} node(s)`,
          });
        } else {
          branchNotes = ['Seeded exact question-id matches into the frontier before branch search.'];
        }
      }

      const frontierCandidates = rankFrontierCandidates(repository, frontier, trimmedQuestion);

      if (frontierCandidates.length === 0) {
        return yield* Effect.fail(new PageIndexActionInvalid({ reason: 'no frontier candidates remain to inspect' }));
      }

      emitTrace(options, {
        stage: 'frontier-request',
        step,
        candidateCount: frontierCandidates.length,
        frontierCount: frontier.size,
        evidenceCount: evidence.length,
        message: `step ${step}: asking the model to choose from ${frontierCandidates.length} frontier node(s); evidence=${evidence.length}, frontier=${frontier.size}; top=${renderTraceFrontierPreview(frontierCandidates)}`,
      });

      const frontierAttempt = yield* requestFrontierSelectionWithFallback(
        trimmedQuestion,
        evidence,
        frontierCandidates,
        options,
      );
      const frontierAction = frontierAttempt.action;
      const normalizedFrontierAction = yield* coerceFrontierActionEffect(
        frontierAction,
        frontierCandidates,
        evidence,
      );

      if (normalizedFrontierAction.action === 'answer' && evidence.length === 0) {
        return yield* Effect.fail(
          new PageIndexActionInvalid({ reason: 'frontier selection attempted to answer before any evidence was gathered' }),
        );
      }

      const effectiveFrontierAction = normalizedFrontierAction.action === 'answer'
        ? (() => {
            const deferralCandidate = selectAnswerDeferralCandidate(repository, trimmedQuestion, evidence, frontierCandidates);

            if (!deferralCandidate) {
              return normalizedFrontierAction;
            }

            const deferredAction = deferralCandidate.inspectable ? 'inspect' : 'expand';

            emitTrace(options, {
              stage: 'answer-deferred',
              step,
              nodeId: deferralCandidate.nodeId,
              action: deferredAction,
              evidenceCount: evidence.length,
              frontierCount: frontier.size,
              message: `step ${step}: deferred answer because ${deferralCandidate.nodeId} (${deferralCandidate.title}) still outranks the current evidence for this question; evidence=${renderTraceEvidencePreview(evidence)}`,
            });

            return {
              action: deferredAction,
              nodeIds: [deferralCandidate.nodeId],
              rationale: `Continue search with ${deferralCandidate.nodeId} because it matches the question more strongly than the current evidence.`,
            } satisfies RetrievalAction;
          })()
        : normalizedFrontierAction;

      if (effectiveFrontierAction.action === 'answer') {
        steps.push({
          step,
          action: 'answer',
          rationale: effectiveFrontierAction.rationale,
          answerPlan: effectiveFrontierAction.answerPlan,
        });

        emitTrace(options, {
          stage: 'retrieve-complete',
          evidenceCount: evidence.length,
          answerPlan: effectiveFrontierAction.answerPlan,
          message: `retrieval completed at frontier stage with ${evidence.length} evidence node(s); evidence=${renderTraceEvidencePreview(evidence)}`,
        });

        return {
          question: trimmedQuestion,
          status: 'complete',
          steps,
          evidence,
          answerPlan: effectiveFrontierAction.answerPlan,
        };
      }

      const selectedNodeIds = yield* normalizeSelectionEffect(
        effectiveFrontierAction.nodeIds,
        frontierCandidates.map((candidate) => candidate.nodeId),
        'frontier selection',
      );

      emitTrace(options, {
        stage: 'frontier-selected',
        step,
        action: effectiveFrontierAction.action,
        nodeIds: selectedNodeIds,
        message:
          frontierAttempt.source === 'error-fallback'
            ? `step ${step}: frontier selection fell back to deterministic ranked ${effectiveFrontierAction.action}; selected=${renderTraceFrontierSelectionPreview(frontierCandidates, selectedNodeIds)}`
            : `step ${step}: model chose to ${effectiveFrontierAction.action} node(s) ${selectedNodeIds.join(', ')}; selected=${renderTraceFrontierSelectionPreview(frontierCandidates, selectedNodeIds)}`,
      });

      const evidenceCountBeforeStep = evidence.length;
      const consumed = consumeFrontierSelection(
        repository,
        trimmedQuestion,
        effectiveFrontierAction.action,
        selectedNodeIds,
        frontier,
        visitedNodeIds,
        evidence,
      );
      const rationaleParts = [
        ...branchNotes,
        ...(frontierAttempt.source === 'error-fallback'
          ? [`Frontier selection fell back to deterministic ranked frontier because ${asSentence(frontierAttempt.fallbackReason ?? 'the model response was unavailable or invalid')}`]
          : []),
        `Frontier nodes ${selectedNodeIds.join(', ')} ${effectiveFrontierAction.action === 'expand' ? 'expanded' : 'selected'} because ${asSentence(effectiveFrontierAction.rationale)}`,
        ...consumed.notes,
      ];

      steps.push({
        step,
        action: consumed.mode,
        nodeId: selectedNodeIds[0]!,
        title: consumed.titles[0]!,
        nodeIds: selectedNodeIds,
        titles: consumed.titles,
        rationale: rationaleParts.join(' '),
      });

      emitTrace(options, {
        stage: 'step-finish',
        step,
        action: consumed.mode,
        nodeIds: selectedNodeIds,
        frontierCount: frontier.size,
        evidenceCount: evidence.length,
        message: `step ${step}: ${consumed.mode === 'expand' ? 'expanded' : 'inspected'} ${selectedNodeIds.join(', ')}; evidence+${evidence.length - evidenceCountBeforeStep}; evidence=${evidence.length}, frontier=${frontier.size}; current-evidence=${renderTraceEvidencePreview(evidence)}`,
      });
    }

    emitTrace(options, {
      stage: 'retrieve-step-limit',
      stepCount: steps.length,
      evidenceCount: evidence.length,
      message: `retrieval hit the step limit after ${steps.length} step(s) with ${evidence.length} evidence node(s); evidence=${renderTraceEvidencePreview(evidence)}`,
    });

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

    emitTrace(options, {
      stage: 'answer-request',
      evidenceCount: retrieval.evidence.length,
      message: `answer synthesis started with ${retrieval.evidence.length} evidence node(s); evidence=${renderTraceEvidencePreview(retrieval.evidence)}`,
    });

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

    emitTrace(options, {
      stage: 'answer-complete',
      evidenceCount: retrieval.evidence.length,
      citationCount: citations.length,
      message: `answer synthesis completed with ${citations.length} citation(s) from ${retrieval.evidence.length} evidence node(s); cited=${citations.map((citation) => `${citation.nodeId} ${truncateText(citation.title, 36)}`).join(' | ') || 'none'}`,
    });

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
