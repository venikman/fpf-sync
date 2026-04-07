import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Data, Effect } from 'effect';

import {
  ensurePageIndex,
  type FpfBranchRecord,
  type LineSpan,
  type PageIndexContentRecord,
  type PageIndexNode,
  type PageIndexState,
} from './memory.ts';

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
};

export type PageIndexAnswerResult = {
  question: string;
  answer: string;
  citations: PageIndexAnswerCitation[];
  retrieval: PageIndexRetrieveResult;
};

type PageIndexRepository = {
  state: PageIndexState;
  tree: PageIndexNode[];
  treeById: Map<string, PageIndexNode>;
  branches: FpfBranchRecord[];
  contentsById: Map<string, PageIndexContentRecord>;
};

type RetrievalAction =
  | {
      action: 'inspect';
      nodeId: string;
      rationale: string;
    }
  | {
      action: 'answer';
      rationale: string;
      answerPlan: string;
    };

type InspectChoice = {
  nodeId: string;
  rationale: string;
};

type AnswerPayload = {
  answer: string;
  citations: string[];
};

const defaultEndpoint = 'http://localhost:1234/api/v1/chat';
const defaultModel = 'google/gemma-4-26b-a4b';
const defaultMaxSteps = 6;

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

const readJson = <T>(path: string): Effect.Effect<T, PageIndexAppError> => {
  return Effect.tryPromise({
    try: async () => JSON.parse(await readFile(path, 'utf8')) as T,
    catch: (cause) =>
      isEnoent(cause)
        ? new PageIndexMissing({ path })
        : new PageIndexIoError({ path, reason: toReason(cause) }),
  });
};

const readJsonl = <T>(path: string): Effect.Effect<T[], PageIndexAppError> => {
  return Effect.tryPromise({
    try: async () => {
      const raw = await readFile(path, 'utf8');

      return raw
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as T);
    },
    catch: (cause) =>
      isEnoent(cause)
        ? new PageIndexMissing({ path })
        : new PageIndexIoError({ path, reason: toReason(cause) }),
  });
};

const validateState = (input: Partial<PageIndexState>, path: string): PageIndexState => {
  if (
    input.kind !== 'pageindex-state' ||
    input.schemaVersion !== 1 ||
    typeof input.sourcePath !== 'string' ||
    typeof input.maxHeadingDepth !== 'number' ||
    typeof input.generatedAt !== 'string' ||
    typeof input.contentHash !== 'string' ||
    typeof input.nodeCount !== 'number'
  ) {
    throw new PageIndexIoError({ path, reason: 'invalid pageindex state file' });
  }

  return {
    kind: 'pageindex-state',
    schemaVersion: 1,
    sourcePath: input.sourcePath,
    maxHeadingDepth: input.maxHeadingDepth,
    generatedAt: input.generatedAt,
    contentHash: input.contentHash,
    nodeCount: input.nodeCount,
  };
};

const validateTree = (input: unknown, path: string): PageIndexNode[] => {
  if (!Array.isArray(input)) {
    throw new PageIndexIoError({ path, reason: 'invalid pageindex tree file' });
  }

  return input as PageIndexNode[];
};

const validateContents = (input: readonly PageIndexContentRecord[], path: string): PageIndexContentRecord[] => {
  for (const item of input) {
    if (
      typeof item.nodeId !== 'string' ||
      typeof item.title !== 'string' ||
      typeof item.depth !== 'number' ||
      typeof item.summary !== 'string' ||
      typeof item.content !== 'string' ||
      typeof item.lineSpan?.start !== 'number' ||
      typeof item.lineSpan?.end !== 'number' ||
      !Array.isArray(item.references) ||
      !Array.isArray(item.childNodeIds)
    ) {
      throw new PageIndexIoError({ path, reason: 'invalid pageindex content file' });
    }
  }

  return [...input];
};

const validateBranches = (input: unknown, path: string): FpfBranchRecord[] => {
  if (!Array.isArray(input)) {
    throw new PageIndexIoError({ path, reason: 'invalid fpf branch index file' });
  }

  for (const item of input) {
    if (
      typeof item !== 'object' ||
      item === null ||
      !(typeof item.branchId === 'string') ||
      !(typeof item.nodeId === 'string') ||
      !(typeof item.title === 'string') ||
      !(typeof item.summary === 'string') ||
      !(typeof item.lineSpan?.start === 'number') ||
      !(typeof item.lineSpan?.end === 'number') ||
      !Array.isArray(item.patternPrefixes) ||
      !Array.isArray(item.focusAreas)
    ) {
      throw new PageIndexIoError({ path, reason: 'invalid fpf branch index file' });
    }
  }

  return input as FpfBranchRecord[];
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

const loadRepository = (cwd: string): Effect.Effect<PageIndexRepository, PageIndexAppError> => {
  return Effect.gen(function* () {
    const memoryRoot = join(cwd, '.memory');
    const statePath = join(memoryRoot, 'pageindex-state.json');
    const treePath = join(memoryRoot, 'pageindex-tree.json');
    const branchPath = join(memoryRoot, 'fpf-branches.json');
    const contentPath = join(memoryRoot, 'pageindex-content.jsonl');
    const [rawState, rawTree, rawBranches, rawContents] = yield* Effect.all([
      readJson<Partial<PageIndexState>>(statePath),
      readJson<unknown>(treePath),
      readJson<unknown>(branchPath),
      readJsonl<PageIndexContentRecord>(contentPath),
    ]);
    const state = validateState(rawState, statePath);
    const tree = validateTree(rawTree, treePath);
    const branches = validateBranches(rawBranches, branchPath);
    const contents = validateContents(rawContents, contentPath);

    return {
      state,
      tree,
      treeById: buildTreeById(tree),
      branches,
      contentsById: new Map(contents.map((item) => [item.nodeId, item])),
    };
  });
};

const renderTree = (tree: readonly PageIndexNode[]): string => {
  const lines: string[] = [];

  const visit = (node: PageIndexNode, indent: number): void => {
    const prefix = '  '.repeat(indent);
    const summary = truncateText(node.summary, 140);
    const references = node.references.length > 0 ? ` | refs ${node.references.join(', ')}` : '';
    const childCount = node.subNodes.length;
    lines.push(
      `${prefix}- ${node.nodeId} | ${node.title} | lines ${node.startLine}-${node.endLine} | children ${childCount}${references} | ${summary}`,
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

const normalizeLookupText = (input: string): string => {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const hasDirectionalCue = (input: string): boolean => {
  return /\b(see|appendix|refer|reference|details|detail|described|following|continued|continue|summarized|summarises|table|figure)\b/i.test(
    input,
  );
};

const getAdjacentSiblingNodeIds = (
  repository: PageIndexRepository,
  node: PageIndexContentRecord,
): string[] => {
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

  return [parent.childNodeIds[index - 1], parent.childNodeIds[index + 1]].filter(
    (value): value is string => typeof value === 'string',
  );
};

const findReferenceTargets = (
  repository: PageIndexRepository,
  node: PageIndexContentRecord,
): PageIndexContentRecord[] => {
  const matches: PageIndexContentRecord[] = [];
  const seenNodeIds = new Set<string>();

  for (const reference of node.references) {
    const normalizedReference = normalizeLookupText(reference);

    if (!normalizedReference) {
      continue;
    }

    for (const candidate of repository.contentsById.values()) {
      if (candidate.nodeId === node.nodeId || seenNodeIds.has(candidate.nodeId)) {
        continue;
      }

      const normalizedTarget = normalizeLookupText(`${candidate.title} ${candidate.summary}`);

      if (!normalizedTarget.includes(normalizedReference)) {
        continue;
      }

      seenNodeIds.add(candidate.nodeId);
      matches.push(candidate);
    }
  }

  return matches;
};

const collectAutoExpansionNodes = (
  repository: PageIndexRepository,
  node: PageIndexContentRecord,
  visitedNodeIds: ReadonlySet<string>,
): {
  nodes: PageIndexContentRecord[];
  reasons: string[];
} => {
  const candidates: PageIndexContentRecord[] = [];
  const reasons: string[] = [];
  const addCandidate = (candidate: PageIndexContentRecord | undefined, reason: string): void => {
    if (!candidate || visitedNodeIds.has(candidate.nodeId) || candidate.nodeId === node.nodeId) {
      return;
    }

    if (candidates.some((current) => current.nodeId === candidate.nodeId)) {
      return;
    }

    candidates.push(candidate);

    if (!reasons.includes(reason)) {
      reasons.push(reason);
    }
  };
  const lineCount = node.lineSpan.end - node.lineSpan.start + 1;
  const shortLeaf = !node.parentNodeId ? false : node.childNodeIds.length === 0 && lineCount <= 4;
  const broadParent = node.childNodeIds.length > 0 && (lineCount <= 6 || node.content.length <= 700);
  const referenceHeavy = hasDirectionalCue(node.content) || /\bappendix\b/i.test(node.title);

  if (broadParent) {
    for (const childNodeId of node.childNodeIds.slice(0, 2)) {
      addCandidate(repository.contentsById.get(childNodeId), 'child-expansion');
    }
  }

  if (referenceHeavy) {
    for (const target of findReferenceTargets(repository, node).slice(0, 2)) {
      addCandidate(target, 'reference-follow');
    }
  }

  if (shortLeaf || candidates.length === 0) {
    for (const siblingNodeId of getAdjacentSiblingNodeIds(repository, node)) {
      addCandidate(repository.contentsById.get(siblingNodeId), 'sibling-neighbor');
    }
  }

  return {
    nodes: candidates.slice(0, 3),
    reasons,
  };
};

const branchPrefixPattern = /\b([A-Z])\.[A-Z0-9]+(?:\.[A-Z0-9]+)*\b/g;

const derivePreferredBranchIds = (
  question: string,
  branches: readonly FpfBranchRecord[],
): string[] => {
  const exact = new Set<string>();

  for (const match of question.matchAll(branchPrefixPattern)) {
    const prefix = `${match[1]}.`;

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

const collectSubtreeNodes = (node: PageIndexNode): PageIndexNode[] => {
  const nodes: PageIndexNode[] = [];

  const visit = (current: PageIndexNode): void => {
    nodes.push(current);

    for (const child of current.subNodes) {
      visit(child);
    }
  };

  visit(node);

  return nodes;
};

const renderSubtree = (node: PageIndexNode): string => {
  return renderTree([node]);
};

const extractJson = (input: string): unknown => {
  const trimmed = input.trim();

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed)?.[1]?.trim();

    if (fenced) {
      return extractJson(fenced);
    }

    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');

    if (start !== -1 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    }

    throw new PageIndexModelError({ reason: 'model did not return valid JSON' });
  }
};

const parseStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
};

const parseRetrievalAction = (rawText: string): RetrievalAction => {
  const parsed = extractJson(rawText);

  if (typeof parsed !== 'object' || parsed === null) {
    throw new PageIndexModelError({ reason: 'model action payload is not an object' });
  }

  const action = 'action' in parsed ? parsed.action : undefined;
  const rationaleValue = 'rationale' in parsed ? parsed.rationale : undefined;
  const rationale = typeof rationaleValue === 'string' ? rationaleValue.trim() : 'no rationale';

  if (action === 'inspect') {
    const nodeIdValue = 'node_id' in parsed ? parsed.node_id : 'nodeId' in parsed ? parsed.nodeId : undefined;

    if (typeof nodeIdValue !== 'string' || !nodeIdValue.trim()) {
      throw new PageIndexModelError({ reason: 'inspect action is missing node_id' });
    }

    return {
      action: 'inspect',
      nodeId: nodeIdValue.trim(),
      rationale,
    };
  }

  if (action === 'answer') {
    const answerPlanValue =
      'answer_plan' in parsed ? parsed.answer_plan : 'answerPlan' in parsed ? parsed.answerPlan : undefined;

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

const parseInspectChoice = (rawText: string): InspectChoice => {
  const parsed = extractJson(rawText);

  if (typeof parsed !== 'object' || parsed === null) {
    throw new PageIndexModelError({ reason: 'inspect choice payload is not an object' });
  }

  const nodeIdValue = 'node_id' in parsed ? parsed.node_id : 'nodeId' in parsed ? parsed.nodeId : undefined;
  const rationaleValue = 'rationale' in parsed ? parsed.rationale : undefined;

  if (typeof nodeIdValue !== 'string' || !nodeIdValue.trim()) {
    throw new PageIndexModelError({ reason: 'inspect choice is missing node_id' });
  }

  return {
    nodeId: nodeIdValue.trim(),
    rationale: typeof rationaleValue === 'string' && rationaleValue.trim() ? rationaleValue.trim() : 'no rationale',
  };
};

const parseAnswerPayload = (rawText: string): AnswerPayload => {
  const parsed = extractJson(rawText);

  if (typeof parsed !== 'object' || parsed === null) {
    throw new PageIndexModelError({ reason: 'answer payload is not an object' });
  }

  const answerValue = 'answer' in parsed ? parsed.answer : undefined;

  if (typeof answerValue !== 'string' || !answerValue.trim()) {
    throw new PageIndexModelError({ reason: 'answer payload is missing answer' });
  }

  const citationsValue =
    'citations' in parsed
      ? parsed.citations
      : 'citation_node_ids' in parsed
        ? parsed.citation_node_ids
        : [];

  return {
    answer: answerValue.trim(),
    citations: parseStringArray(citationsValue),
  };
};

const extractModelText = (payload: unknown): string => {
  if (typeof payload === 'string') {
    return payload;
  }

  if (typeof payload !== 'object' || payload === null) {
    throw new PageIndexModelError({ reason: 'local model response is invalid' });
  }

  if ('output' in payload && typeof payload.output === 'string') {
    return payload.output;
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

        if (typeof content === 'string') {
          return content;
        }

        if (Array.isArray(content)) {
          const text = content
            .map((part) => {
              if (typeof part === 'string') {
                return part;
              }

              if (typeof part === 'object' && part !== null && 'text' in part && typeof part.text === 'string') {
                return part.text;
              }

              return '';
            })
            .join('')
            .trim();

          if (text) {
            return text;
          }
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
    'Stage 1: choose the highest-level FPF branch that most likely contains the answer.',
    'Use the reduced FPF branch index, not the full tree.',
    'Prefer a branch marked preferred-by-fpf-heuristic when it matches the question, unless the evidence strongly points elsewhere.',
    'If evidence is already sufficient, you may answer.',
    'Return JSON only.',
    'Allowed outputs:',
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

const requestSectionSelection = (
  repository: PageIndexRepository,
  question: string,
  evidence: readonly PageIndexEvidence[],
  branchNode: PageIndexNode,
  visitedNodeIds: ReadonlySet<string>,
  options: LocalModelOptions,
): Effect.Effect<InspectChoice, PageIndexAppError> => {
  const subtreeNodes = collectSubtreeNodes(branchNode);
  const availableNodes = subtreeNodes.filter((node) => !visitedNodeIds.has(node.nodeId));

  if (availableNodes.length === 0) {
    return Effect.fail(
      new PageIndexActionInvalid({ reason: `selected branch ${branchNode.nodeId} has no unvisited nodes` }),
    );
  }

  if (availableNodes.length === 1) {
    const [onlyNode] = availableNodes;

    if (!onlyNode) {
      return Effect.fail(
        new PageIndexActionInvalid({ reason: `selected branch ${branchNode.nodeId} has no inspectable node` }),
      );
    }

    return Effect.succeed({
      nodeId: onlyNode.nodeId,
      rationale: 'only unvisited node remains inside the selected branch',
    });
  }

  const systemPrompt = [
    'You are a PageIndex-style reasoning retriever.',
    'Stage 2: choose the best exact node to inspect inside the selected branch.',
    'Prefer the most specific coherent section that can answer the question.',
    'If the branch node itself is best, you may choose it.',
    'Avoid nodes already inspected.',
    'Return JSON only in the form {"node_id":"0002","rationale":"..."}.',
  ].join(' ');
  const input = [
    `Question:\n${question}`,
    '',
    `Selected branch: ${branchNode.nodeId} | ${branchNode.title}`,
    `Available node ids in branch: ${availableNodes.map((node) => node.nodeId).join(', ')}`,
    '',
    'Branch subtree:',
    renderSubtree(branchNode),
    '',
    'Already inspected evidence:',
    renderEvidence(evidence),
  ].join('\n');

  return Effect.flatMap(
    callLocalModel(
      { endpoint: defaultEndpoint, model: defaultModel, systemPrompt, input },
      options,
    ),
    (rawText) => Effect.sync(() => parseInspectChoice(rawText)),
  );
};

const selectNextInspection = (
  repository: PageIndexRepository,
  question: string,
  evidence: readonly PageIndexEvidence[],
  visitedNodeIds: ReadonlySet<string>,
  options: LocalModelOptions,
): Effect.Effect<RetrievalAction, PageIndexAppError> => {
  return Effect.gen(function* () {
    const branchAction = yield* requestBranchSelection(repository, question, evidence, options);

    if (branchAction.action === 'answer') {
      return branchAction;
    }

    const branchNode = repository.treeById.get(branchAction.nodeId);

    if (!branchNode) {
      return yield* Effect.fail(new PageIndexNodeMissing({ nodeId: branchAction.nodeId }));
    }

    const sectionChoice = yield* requestSectionSelection(
      repository,
      question,
      evidence,
      branchNode,
      visitedNodeIds,
      options,
    );
    const rationale = [
      `Branch ${branchNode.nodeId} (${branchNode.title}) selected because ${asSentence(branchAction.rationale)}`,
      `Section ${sectionChoice.nodeId} selected because ${asSentence(sectionChoice.rationale)}`,
    ].join(' ');

    return {
      action: 'inspect',
      nodeId: sectionChoice.nodeId,
      rationale,
    } satisfies RetrievalAction;
  });
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
    const steps: PageIndexRetrievalStep[] = [];

    for (let step = 1; step <= maxSteps; step += 1) {
      const action = yield* selectNextInspection(
        repository,
        trimmedQuestion,
        evidence,
        visitedNodeIds,
        options,
      );

      if (action.action === 'answer') {
        steps.push({
          step,
          action: 'answer',
          rationale: action.rationale,
          answerPlan: action.answerPlan,
        });

        return {
          question: trimmedQuestion,
          status: 'complete',
          steps,
          evidence,
          answerPlan: action.answerPlan,
        };
      }

      if (visitedNodeIds.has(action.nodeId)) {
        return yield* Effect.fail(
          new PageIndexActionInvalid({ reason: `model selected already inspected node ${action.nodeId}` }),
        );
      }

      const selected = repository.contentsById.get(action.nodeId);

      if (!selected) {
        return yield* Effect.fail(new PageIndexNodeMissing({ nodeId: action.nodeId }));
      }

      const autoExpansion = collectAutoExpansionNodes(repository, selected, visitedNodeIds);
      const inspectedNodes = [selected, ...autoExpansion.nodes];

      for (const inspectedNode of inspectedNodes) {
        visitedNodeIds.add(inspectedNode.nodeId);
        evidence.push({
          nodeId: inspectedNode.nodeId,
          title: inspectedNode.title,
          lineSpan: inspectedNode.lineSpan,
          summary: inspectedNode.summary,
          content: inspectedNode.content,
        });
      }

      const expandedNodeIds = autoExpansion.nodes.map((item) => item.nodeId);
      const rationale =
        expandedNodeIds.length === 0
          ? action.rationale
          : `${action.rationale} Auto-expanded ${expandedNodeIds.join(', ')} via ${autoExpansion.reasons.join(', ')}.`;

      steps.push({
        step,
        action: 'inspect',
        nodeId: selected.nodeId,
        title: selected.title,
        rationale,
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
    const finalCitationIds = citationIds.length > 0 ? citationIds : retrieval.evidence.map((item) => item.nodeId);
    const citations = finalCitationIds
      .map((nodeId) => retrieval.evidence.find((item) => item.nodeId === nodeId))
      .filter((item): item is PageIndexEvidence => item !== undefined)
      .map((item) => {
        return {
          nodeId: item.nodeId,
          title: item.title,
          lineSpan: item.lineSpan,
        } satisfies PageIndexAnswerCitation;
      });

    return {
      question: retrieval.question,
      answer: answerPayload.answer,
      citations,
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
