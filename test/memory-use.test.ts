import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Effect } from 'effect';

import { ensurePageIndex } from '../src/memory.ts';
import {
  answerWithPageIndex,
  answerWithPageIndexEffect,
  PageIndexActionInvalid,
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
      maxHeadingDepth: 6,
      nodeCount: 4,
      sourcePath: 'FPF/FPF-Spec.md',
    });
    expect(result.tree[0]?.title).toBe('Part A');
    expect(result.tree[0]?.subNodes[0]?.nodeId).toBe('0002');
    expect(result.tree[0]?.subNodes[0]?.canonicalIds).toEqual(['A.1.1']);
  });

  test('retrievePageIndex performs lawful multi-node frontier retrieval', async () => {
    const scripted = createScriptedChat([
      JSON.stringify({
        action: 'inspect',
        node_list: ['0001'],
        rationale: 'Part A is the branch that contains the bounded context material.',
      }),
      JSON.stringify({
        action: 'inspect',
        node_list: ['0002'],
        rationale: 'A.1.1 is the direct bounded context section.',
      }),
      JSON.stringify({
        action: 'answer',
        rationale: 'The gathered bounded context section is sufficient.',
        answer_plan: 'Answer from node 0002 and cite it.',
      }),
    ]);

    const result = await retrievePageIndex(cwd, 'What is bounded context?', {
      chat: scripted.chat,
      maxSteps: 4,
    });

    expect(result.question).toBe('What is bounded context?');
    expect(result.status).toBe('complete');
    expect(result.steps[0]).toMatchObject({
      step: 1,
      action: 'inspect',
      nodeId: '0002',
      nodeIds: ['0002'],
      title: 'A.1.1 - U.BoundedContext: The Semantic Frame',
      titles: ['A.1.1 - U.BoundedContext: The Semantic Frame'],
    });
    expect(result.steps[0]?.rationale).toContain('Branches 0001 selected because');
    expect(result.steps[0]?.rationale).toContain('Seeded 0002, 0003, 0004 via child-of-routing');
    expect(result.steps[0]?.rationale).toContain('Seeded 0003, 0004 via reference-follow from 0002');
    expect(result.evidence).toEqual([
      {
        nodeId: '0002',
        title: 'A.1.1 - U.BoundedContext: The Semantic Frame',
        lineSpan: { start: 3, end: 6 },
        summary:
          'A.1.1 - U.BoundedContext: The Semantic Frame Bounded context defines local meaning. It coordinates with A.10 and F.9.',
        content:
          '## A.1.1 - U.BoundedContext: The Semantic Frame\n\nBounded context defines local meaning. It coordinates with A.10 and F.9.',
      },
    ]);
    expect(result.answerPlan).toBe('Answer from node 0002 and cite it.');
    expect(scripted.calls).toHaveLength(3);
    expect(scripted.calls[0]?.model).toBe('google/gemma-4-26b-a4b');
    expect(scripted.calls[0]?.endpoint).toBe('http://localhost:1234/api/v1/chat');
  });

  test('retrievePageIndex accepts fenced JSON model actions', async () => {
    const scripted = createScriptedChat([
      '```json\n{"action":"inspect","node_list":["0003"],"rationale":"A.10 is explicitly named in the question."}\n```',
      JSON.stringify({
        action: 'answer',
        rationale: 'The exact A.10 node is sufficient.',
        answer_plan: 'Use node 0003 directly.',
      }),
    ]);

    const result = await retrievePageIndex(cwd, 'What does A.10 say?', {
      chat: scripted.chat,
      maxSteps: 3,
    });

    expect(result.status).toBe('complete');
    expect(result.evidence[0]?.nodeId).toBe('0003');
    expect(result.answerPlan).toBe('Use node 0003 directly.');
  });

  test('answerWithPageIndex synthesizes a cited answer from exact question-id matches', async () => {
    const scripted = createScriptedChat([
      JSON.stringify({
        action: 'inspect',
        node_list: ['0003'],
        rationale: 'A.10 is explicitly named in the question.',
      }),
      JSON.stringify({
        action: 'answer',
        rationale: 'The exact A.10 node is sufficient.',
        answer_plan: 'Use node 0003 directly.',
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
        label: 'A.10 - Evidence Graph Referring (lines 7-10)',
      },
    ]);
    expect(result.rendered).toContain('Sources:');
    expect(result.retrieval.steps[0]?.rationale).toContain('question-id matches');
  });

  test('answerWithPageIndex accepts balanced JSON wrapped in prose', async () => {
    const scripted = createScriptedChat([
      JSON.stringify({
        action: 'inspect',
        node_list: ['0003'],
        rationale: 'A.10 is explicitly named in the question.',
      }),
      'Best next step: {"action":"answer","rationale":"The exact A.10 node is sufficient.","answer_plan":"Use node 0003 directly."}',
      'Result: {"answer":"A.10 says evidence links claims to anchors and keeps retrieval auditable.","citations":["0003"]}',
    ]);

    const result = await answerWithPageIndex(cwd, 'What does A.10 say?', {
      chat: scripted.chat,
      maxSteps: 4,
    });

    expect(result.answer).toBe(
      'A.10 says evidence links claims to anchors and keeps retrieval auditable.',
    );
    expect(result.citations[0]?.nodeId).toBe('0003');
  });

  test('retrievePageIndex expands oversized routing nodes instead of treating them as evidence', async () => {
    const nestedCwd = await mkdtemp(join(tmpdir(), 'fpf-pageindex-routing-'));
    const largeBody = Array.from({ length: 180 }, (_, index) => `Line ${index + 1}: routing detail.`).join('\n');
    const nestedContent = `# Part F

## F.5 - Routing Container

${largeBody}

### F.5:4.1 - Naming Rule

Use F.5:4.1 when naming U.Types and roles.
`;

    try {
      await mkdir(join(nestedCwd, 'FPF'), { recursive: true });
      await Bun.write(join(nestedCwd, 'FPF', 'FPF-Spec.md'), nestedContent);
      await ensurePageIndex({
        cwd: nestedCwd,
        targetPath: 'FPF/FPF-Spec.md',
        content: nestedContent,
        generatedAt: '2026-04-07T12:00:00.000Z',
      });
      await rm(join(nestedCwd, 'FPF', 'FPF-Spec.md'));

      const scripted = createScriptedChat([
        JSON.stringify({
          action: 'inspect',
          node_list: ['0001'],
          rationale: 'Part F is the naming branch.',
        }),
        JSON.stringify({
          action: 'inspect',
          node_list: ['0002'],
          rationale: 'Inspect the routing container first.',
        }),
        JSON.stringify({
          action: 'inspect',
          node_list: ['0003'],
          rationale: 'F.5:4.1 is the inspectable leaf section.',
        }),
        JSON.stringify({
          action: 'answer',
          rationale: 'The leaf section is sufficient.',
          answer_plan: 'Answer from node 0003.',
        }),
      ]);

      const result = await retrievePageIndex(nestedCwd, 'Which pattern can be used for naming?', {
        chat: scripted.chat,
        maxSteps: 5,
      });

      expect(result.steps[0]).toMatchObject({
        action: 'inspect',
        nodeId: '0002',
        nodeIds: ['0002'],
      });
      expect(result.steps[0]?.rationale).toContain('Expanded routing node 0002 into 0003 via child-of-routing.');
      expect(result.evidence).toEqual([
        {
          nodeId: '0003',
          title: 'F.5:4.1 - Naming Rule',
          lineSpan: { start: 186, end: 189 },
          summary: 'F.5:4.1 - Naming Rule Use F.5:4.1 when naming U.Types and roles.',
          content: '### F.5:4.1 - Naming Rule\n\nUse F.5:4.1 when naming U.Types and roles.',
        },
      ]);
    } finally {
      await rm(nestedCwd, { force: true, recursive: true });
    }
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

  test('retrievePageIndexEffect rejects node ids outside the offered frontier set', async () => {
    const scripted = createScriptedChat([
      JSON.stringify({
        action: 'inspect',
        node_list: ['9999'],
        rationale: 'Choose an invalid node.',
      }),
    ]);

    const result = await Effect.runPromise(
      Effect.either(
        retrievePageIndexEffect(cwd, 'What does A.10 say?', {
          chat: scripted.chat,
          maxSteps: 1,
        }),
      ),
    );

    expect(result._tag).toBe('Left');

    if (result._tag !== 'Left') {
      throw new Error('expected Left');
    }

    expect(result.left).toBeInstanceOf(PageIndexActionInvalid);
  });

  test('answerWithPageIndexEffect rejects answer-before-evidence responses', async () => {
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

    expect(result.left).toBeInstanceOf(PageIndexActionInvalid);
  });
});
