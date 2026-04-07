import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Effect } from 'effect';

import { ensurePageIndex } from '../src/memory.ts';
import {
  answerWithPageIndex,
  answerWithPageIndexEffect,
  PageIndexEvidenceMissing,
  PageIndexMissing,
  readPageIndexTree,
  retrievePageIndex,
  retrievePageIndexEffect,
  type LocalModelRequest,
} from '../src/memory-use.ts';

const content = `# Part A

## A.1.1 - U.BoundedContext: The Semantic Frame

Bounded context defines local meaning. It coordinates with A.10 and F.9.

## A.10 - Evidence Graph Referring

Evidence links claims to anchors and keeps retrieval auditable.

## F.9 - Alignment & Bridge across Contexts

Bridge across contexts through explicit bridge cards and loss-aware interpretation.
`;

const createScriptedChat = (responses: readonly string[]) => {
  const calls: LocalModelRequest[] = [];

  return {
    calls,
    chat: async (request: LocalModelRequest): Promise<string> => {
      calls.push(request);
      const response = responses[calls.length - 1];

      if (!response) {
        throw new Error(`unexpected model call ${calls.length}`);
      }

      return response;
    },
  };
};

let cwd = '';

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'fpf-pageindex-use-'));
  await mkdir(join(cwd, 'FPF'), { recursive: true });
  await Bun.write(join(cwd, 'FPF', 'FPF-Spec.md'), content);
  await ensurePageIndex({
    cwd,
    targetPath: 'FPF/FPF-Spec.md',
    content,
    generatedAt: '2026-04-07T12:00:00.000Z',
  });
  await rm(join(cwd, 'FPF', 'FPF-Spec.md'));
});

afterEach(async () => {
  if (cwd) {
    await rm(cwd, { force: true, recursive: true });
  }
});

describe('pageindex use', () => {
  test('readPageIndexTree loads the local PageIndex tree', async () => {
    const result = await readPageIndexTree(cwd);

    expect(result).toMatchObject({
      maxHeadingDepth: 3,
      nodeCount: 4,
      sourcePath: 'FPF/FPF-Spec.md',
    });
    expect(result.tree[0]?.title).toBe('Part A');
    expect(result.tree[0]?.subNodes[0]?.nodeId).toBe('0002');
  });

  test('retrievePageIndex performs iterative reasoning over the tree and evidence', async () => {
    const scripted = createScriptedChat([
      JSON.stringify({
        action: 'inspect',
        node_id: '0001',
        rationale: 'Part A is the broad branch that contains the bounded context section.',
      }),
      JSON.stringify({
        node_id: '0002',
        rationale: 'Inside Part A, the bounded context section is the most specific match.',
      }),
      JSON.stringify({
        action: 'answer',
        rationale: 'One coherent section is enough for this question.',
        answer_plan: 'Answer from node 0002 and cite it.',
      }),
    ]);

    const result = await retrievePageIndex(cwd, 'What is bounded context?', {
      chat: scripted.chat,
      maxSteps: 4,
    });

    expect(result).toEqual({
      question: 'What is bounded context?',
      status: 'complete',
      steps: [
        {
          step: 1,
          action: 'inspect',
          nodeId: '0002',
          title: 'A.1.1 - U.BoundedContext: The Semantic Frame',
          rationale:
            'Branch 0001 (Part A) selected because Part A is the broad branch that contains the bounded context section. Section 0002 selected because Inside Part A, the bounded context section is the most specific match. Auto-expanded 0003 via sibling-neighbor.',
        },
        {
          step: 2,
          action: 'answer',
          rationale: 'One coherent section is enough for this question.',
          answerPlan: 'Answer from node 0002 and cite it.',
        },
      ],
      evidence: [
        {
          nodeId: '0002',
          title: 'A.1.1 - U.BoundedContext: The Semantic Frame',
          lineSpan: { start: 3, end: 6 },
          summary:
            'A.1.1 - U.BoundedContext: The Semantic Frame Bounded context defines local meaning. It coordinates with A.10 and F.9.',
          content:
            '## A.1.1 - U.BoundedContext: The Semantic Frame\n\nBounded context defines local meaning. It coordinates with A.10 and F.9.',
        },
        {
          nodeId: '0003',
          title: 'A.10 - Evidence Graph Referring',
          lineSpan: { start: 7, end: 10 },
          summary:
            'A.10 - Evidence Graph Referring Evidence links claims to anchors and keeps retrieval auditable.',
          content:
            '## A.10 - Evidence Graph Referring\n\nEvidence links claims to anchors and keeps retrieval auditable.',
        },
      ],
      answerPlan: 'Answer from node 0002 and cite it.',
    });
    expect(scripted.calls).toHaveLength(3);
    expect(scripted.calls[0]?.model).toBe('google/gemma-4-26b-a4b');
    expect(scripted.calls[0]?.endpoint).toBe('http://localhost:1234/api/v1/chat');
  });

  test('answerWithPageIndex synthesizes a cited answer from retrieved evidence', async () => {
    const scripted = createScriptedChat([
      JSON.stringify({
        action: 'inspect',
        node_id: '0001',
        rationale: 'Part A is the branch containing the evidence graph section.',
      }),
      JSON.stringify({
        node_id: '0003',
        rationale: 'Inside Part A, A.10 is the exact evidence section.',
      }),
      JSON.stringify({
        action: 'answer',
        rationale: 'The inspected node is sufficient.',
        answer_plan: 'Use the evidence section directly.',
      }),
      JSON.stringify({
        answer: 'A.10 says evidence links claims to anchors and keeps retrieval auditable.',
        citations: ['0003'],
      }),
    ]);

    const result = await answerWithPageIndex(cwd, 'What does A.10 say?', {
      chat: scripted.chat,
      maxSteps: 4,
    });

    expect(result.answer).toBe(
      'A.10 says evidence links claims to anchors and keeps retrieval auditable.',
    );
    expect(result.citations).toEqual([
      {
        nodeId: '0003',
        title: 'A.10 - Evidence Graph Referring',
        lineSpan: { start: 7, end: 10 },
      },
    ]);
    expect(result.retrieval.evidence[0]?.nodeId).toBe('0003');
  });

  test('retrievePageIndexEffect fails with a typed error when the index is missing', async () => {
    await rm(join(cwd, '.memory'), { force: true, recursive: true });

    const result = await Effect.runPromise(
      Effect.either(retrievePageIndexEffect(cwd, 'bounded context')),
    );

    expect(result._tag).toBe('Left');

    if (result._tag !== 'Left') {
      throw new Error('expected Left');
    }

    expect(result.left).toBeInstanceOf(PageIndexMissing);
  });

  test('answerWithPageIndexEffect fails with a typed error when no evidence can be gathered', async () => {
    const scripted = createScriptedChat([
      JSON.stringify({
        action: 'answer',
        rationale: 'No retrieval was performed.',
        answer_plan: 'Nothing to cite.',
      }),
    ]);

    const result = await Effect.runPromise(
      Effect.either(
        answerWithPageIndexEffect(cwd, 'What is bounded context?', {
          chat: scripted.chat,
          maxSteps: 1,
        }),
      ),
    );

    expect(result._tag).toBe('Left');

    if (result._tag !== 'Left') {
      throw new Error('expected Left');
    }

    expect(result.left).toBeInstanceOf(PageIndexEvidenceMissing);
  });
});
