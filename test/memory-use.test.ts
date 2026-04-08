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
  PageIndexModelError,
  readPageIndexTree,
  retrievePageIndex,
  retrievePageIndexEffect,
  type LocalModelRequest,
  type PageIndexTraceEvent,
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

const restoreEnvValue = (key: string, value: string | undefined): void => {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
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
    expect(result.steps[0]?.rationale).toContain('Seeded 0002, 0003, 0004 into the frontier from the selected branch sections.');
    expect(result.steps[0]?.rationale).toContain('via reference-follow from 0002');
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
    expect(scripted.calls[0]?.model).toBe('minimax/minimax-m2.7');
    expect(scripted.calls[0]?.endpoint).toBe('https://openrouter.ai/api/v1/chat/completions');
  });

  test('retrievePageIndex accepts branch ids from branch selection output', async () => {
    const scripted = createScriptedChat([
      JSON.stringify({
        action: 'expand',
        node_list: ['A'],
        rationale: 'Part A is the correct branch id.',
      }),
      JSON.stringify({
        action: 'inspect',
        node_list: ['0002'],
        rationale: 'A.1.1 is the direct bounded context section.',
      }),
      JSON.stringify({
        action: 'answer',
        rationale: 'The gathered bounded context section is sufficient.',
        answer_plan: 'Answer from node 0002.',
      }),
    ]);

    const result = await retrievePageIndex(cwd, 'What is bounded context?', {
      chat: scripted.chat,
      maxSteps: 4,
    });

    expect(result.status).toBe('complete');
    expect(result.evidence[0]?.nodeId).toBe('0002');
    expect(result.steps[0]?.rationale).toContain('Branches 0001 expanded because');
  });

  test('retrievePageIndex accepts canonical ids from frontier selection output', async () => {
    const scripted = createScriptedChat([
      JSON.stringify({
        action: 'expand',
        node_list: ['A'],
        rationale: 'Part A is the correct branch id.',
      }),
      JSON.stringify({
        action: 'inspect',
        node_list: ['A.1.1'],
        rationale: 'The canonical id points at the direct bounded context section.',
      }),
      JSON.stringify({
        action: 'answer',
        rationale: 'The gathered bounded context section is sufficient.',
        answer_plan: 'Answer from node 0002.',
      }),
    ]);

    const result = await retrievePageIndex(cwd, 'What is bounded context?', {
      chat: scripted.chat,
      maxSteps: 4,
    });

    expect(result.status).toBe('complete');
    expect(result.evidence[0]?.nodeId).toBe('0002');
    expect(result.steps[0]).toMatchObject({
      action: 'inspect',
      nodeIds: ['0002'],
    });
  });

  test('retrievePageIndex seeds acronym literal matches before branch routing', async () => {
    const adrCwd = await mkdtemp(join(tmpdir(), 'fpf-pageindex-adr-literal-'));
    const adrContent = `# Part E

## E.8 - Authoring Conventions

Authoring rules live here.

### E.8:4.2.3 - Reader-role discipline

Keep package-architecture material in a separate companion note or ADR-like architecture surface.

# Part G

## G.9 - Parity / Benchmark Harness

StandardisationLevel is de facto for ADR/ATAM patterns.

# Part A

## A.1 - Foundation

General architecture foundation.
`;

    let firstFrontierInput = '';
    const extractCandidateNodeId = (input: string, titleFragment: string): string | null => {
      const line = input
        .split('\n')
        .find((value) => value.startsWith('- ') && value.includes(titleFragment));

      if (!line) {
        return null;
      }

      const match = /^-\s+([^\s|]+)\s+\|/.exec(line);

      return match?.[1] ?? null;
    };

    try {
      await mkdir(join(adrCwd, 'FPF'), { recursive: true });
      await Bun.write(join(adrCwd, 'FPF', 'FPF-Spec.md'), adrContent);
      await ensurePageIndex({
        cwd: adrCwd,
        targetPath: 'FPF/FPF-Spec.md',
        content: adrContent,
        generatedAt: '2026-04-07T12:00:00.000Z',
      });
      await rm(join(adrCwd, 'FPF', 'FPF-Spec.md'));

      const scripted = createScriptedChat([
        JSON.stringify({
          action: 'inspect',
          node_list: [],
          rationale: 'Inspect the ADR-bearing patterns first.',
        }),
        JSON.stringify({
          action: 'answer',
          rationale: 'The ADR-bearing patterns are sufficient.',
          answer_plan: 'Answer from the ADR-bearing patterns.',
        }),
      ]);

      scripted.chat = async (request: LocalModelRequest): Promise<string> => {
        scripted.calls.push(request);

        if (!firstFrontierInput) {
          if (request.purpose !== 'frontier-selection') {
            throw new Error(`unexpected first model purpose: ${request.purpose ?? 'unknown'}`);
          }

          firstFrontierInput = request.input;
          const e8NodeId = extractCandidateNodeId(request.input, 'E.8:4.2.3 - Reader-role discipline');
          const g9NodeId = extractCandidateNodeId(request.input, 'G.9 - Parity / Benchmark Harness');

          return JSON.stringify({
            action: 'inspect',
            node_list: [e8NodeId, g9NodeId].filter((value): value is string => value !== null),
            rationale: 'Inspect the ADR-bearing patterns first.',
          });
        }

        return JSON.stringify({
          action: 'answer',
          rationale: 'The ADR-bearing patterns are sufficient.',
          answer_plan: 'Answer from the ADR-bearing patterns.',
        });
      };

      const result = await retrievePageIndex(adrCwd, 'Which patterns use ADR?', {
        chat: scripted.chat,
        maxSteps: 3,
      });
      const frontierLines = firstFrontierInput.split('\n').filter((line) => line.startsWith('- '));

      expect(result.status).toBe('complete');
      expect(scripted.calls[0]?.purpose).toBe('frontier-selection');
      expect(frontierLines.some((line) => line.includes('ADR-like architecture surface'))).toBe(true);
      expect(frontierLines.some((line) => line.includes('ADR/ATAM patterns'))).toBe(true);
      expect(result.evidence.some((item) => item.content.includes('ADR'))).toBe(true);
    } finally {
      await rm(adrCwd, { force: true, recursive: true });
    }
  });

  test('retrievePageIndex uses OpenRouter env config, timeout env, and usage tracing when no chat override is provided', async () => {
    type OpenRouterRequestBody = {
      model: string;
      temperature: number;
      messages: Array<{ role: string; content: string }>;
    };

    const originalApiKey = process.env.OPENROUTER_API_KEY;
    const originalEndpoint = process.env.OPENROUTER_ENDPOINT;
    const originalModel = process.env.OPENROUTER_MODEL;
    const originalTimeout = process.env.OPENROUTER_TIMEOUT_MS;
    const requests: Array<{ url: string; body: OpenRouterRequestBody; headers: Headers; signal: AbortSignal | null }> = [];
    const traceEvents: PageIndexTraceEvent[] = [];

    process.env.OPENROUTER_API_KEY = 'test-key';
    process.env.OPENROUTER_ENDPOINT = 'https://openrouter.example/api/v1/chat/completions';
    process.env.OPENROUTER_MODEL = 'minimax/minimax-m2.7';
    process.env.OPENROUTER_TIMEOUT_MS = '25';

    try {
      const result = await retrievePageIndex(cwd, 'What does A.10 say?', {
        fetchImpl: (async (input, init) => {
          requests.push({
            url:
              typeof input === 'string'
                ? input
                : input instanceof URL
                  ? input.toString()
                  : input.url,
            body: JSON.parse(String(init?.body ?? '{}')) as OpenRouterRequestBody,
            headers: new Headers(init?.headers),
            signal: init?.signal instanceof AbortSignal ? init.signal : null,
          });

          return new Response(
            JSON.stringify({
              usage: {
                prompt_tokens: 120,
                completion_tokens: 30,
                total_tokens: 150,
                cost: 0.00123,
              },
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      action: 'inspect',
                      node_list: ['0003'],
                      rationale: 'A.10 is explicitly named in the question.',
                    }),
                  },
                },
              ],
            }),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
              },
            },
          );
        }) as typeof fetch,
        maxSteps: 1,
        trace: (event) => traceEvents.push(event),
      });

      const request = requests[0];
      const usageEvent = traceEvents.find((event) => event.stage === 'model-usage');

      expect(requests).toHaveLength(1);
      expect(request?.url).toBe('https://openrouter.example/api/v1/chat/completions');
      expect(request?.body.model).toBe('minimax/minimax-m2.7');
      expect(request?.body.temperature).toBe(0);
      expect(request?.body.messages.map((message) => message.role)).toEqual(['system', 'user']);
      expect(request?.headers.get('Authorization')).toBe('Bearer test-key');
      expect(result.evidence[0]?.nodeId).toBe('0003');
      expect(usageEvent).toMatchObject({
        stage: 'model-usage',
        purpose: 'frontier-selection',
        model: 'minimax/minimax-m2.7',
        promptTokens: 120,
        completionTokens: 30,
        totalTokens: 150,
        estimatedCostUsd: 0.00123,
      });
      expect(usageEvent?.message).toContain('tokens prompt=120 completion=30 total=150');

      await new Promise((resolve) => setTimeout(resolve, 40));
      expect(request?.signal?.aborted).toBe(true);
    } finally {
      restoreEnvValue('OPENROUTER_API_KEY', originalApiKey);
      restoreEnvValue('OPENROUTER_ENDPOINT', originalEndpoint);
      restoreEnvValue('OPENROUTER_MODEL', originalModel);
      restoreEnvValue('OPENROUTER_TIMEOUT_MS', originalTimeout);
    }
  });

  test('retrievePageIndex emits trace events during retrieval progress', async () => {
    const scripted = createScriptedChat([
      JSON.stringify({
        action: 'expand',
        node_list: ['0001'],
        rationale: 'Part A is the relevant branch.',
      }),
      JSON.stringify({
        action: 'inspect',
        node_list: ['0002'],
        rationale: 'A.1.1 is the direct bounded context section.',
      }),
      JSON.stringify({
        action: 'answer',
        rationale: 'The gathered bounded context section is sufficient.',
        answer_plan: 'Answer from node 0002.',
      }),
    ]);
    const traceEvents: PageIndexTraceEvent[] = [];

    const result = await retrievePageIndex(cwd, 'What is bounded context?', {
      chat: scripted.chat,
      maxSteps: 4,
      trace: (event) => traceEvents.push(event),
    });

    expect(result.status).toBe('complete');
    expect(traceEvents.map((event) => event.stage)).toEqual([
      'retrieve-start',
      'branch-request',
      'branch-selected',
      'frontier-request',
      'frontier-selected',
      'step-finish',
      'frontier-request',
      'retrieve-complete',
    ]);
    expect(traceEvents[1]?.message).toContain('asking the model to route');
    expect(traceEvents[5]?.message).toContain('inspected 0002');
  });

  test('retrievePageIndex falls back to deterministic reduced-branch ranking when branch routing times out', async () => {
    const traceEvents: PageIndexTraceEvent[] = [];
    let callCount = 0;

    const result = await retrievePageIndex(cwd, 'How should a beginner approach naming?', {
      chat: async () => {
        callCount += 1;

        if (callCount === 1) {
          throw new Error('OpenRouter request timed out after 60000ms');
        }

        if (callCount === 2) {
          return JSON.stringify({
            action: 'inspect',
            node_list: ['0002'],
            rationale: 'The bounded context section is the best seeded evidence node.',
          });
        }

        return JSON.stringify({
          action: 'answer',
          rationale: 'The selected evidence is sufficient.',
          answer_plan: 'Answer from node 0002.',
        });
      },
      maxSteps: 4,
      trace: (event) => traceEvents.push(event),
    });

    expect(result.status).toBe('complete');
    expect(result.evidence[0]?.nodeId).toBe('0002');
    expect(result.steps[0]?.rationale).toContain('fell back to deterministic reduced-branch ranking');
    expect(traceEvents.find((event) => event.stage === 'branch-selected')?.message).toContain('fell back to deterministic reduced-branch ranking');
    expect(callCount).toBeGreaterThanOrEqual(3);
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

  test('retrievePageIndex defers a premature answer when stronger naming evidence remains', async () => {
    const namingCwd = await mkdtemp(join(tmpdir(), 'fpf-pageindex-naming-'));
    const namingContent = `# Part E

## E.10 - Unified Lexical Rules for FPF

Use E.10 for lexical and naming rules.

# Part F

## F.5 - Naming Discipline for U.Types & Roles

Use F.5 when naming U.Types and roles.

# Part G

## G.Core - Part G Core Invariants

Primary hooks E.10 and F.5.
This section is a routing hub for the Part G pattern kit.
`;

    try {
      await mkdir(join(namingCwd, 'FPF'), { recursive: true });
      await Bun.write(join(namingCwd, 'FPF', 'FPF-Spec.md'), namingContent);
      await ensurePageIndex({
        cwd: namingCwd,
        targetPath: 'FPF/FPF-Spec.md',
        content: namingContent,
        generatedAt: '2026-04-07T12:00:00.000Z',
      });
      await rm(join(namingCwd, 'FPF', 'FPF-Spec.md'));

      const traceEvents: PageIndexTraceEvent[] = [];
      const scripted = createScriptedChat([
        JSON.stringify({
          action: 'expand',
          node_list: ['0005'],
          rationale: 'Start in the Part G pattern area first.',
        }),
        JSON.stringify({
          action: 'inspect',
          node_list: ['0006'],
          rationale: 'Inspect G.Core before deciding.',
        }),
        JSON.stringify({
          action: 'answer',
          rationale: 'G.Core already mentions naming hooks.',
          answer_plan: 'Answer from G.Core only.',
        }),
        JSON.stringify({
          action: 'answer',
          rationale: 'F.5 is now sufficient for the naming question.',
          answer_plan: 'Answer from F.5.',
        }),
        JSON.stringify({
          action: 'answer',
          rationale: 'F.5 remains the strongest naming evidence.',
          answer_plan: 'Answer from F.5.',
        }),
      ]);

      const result = await retrievePageIndex(namingCwd, 'Which pattern governs naming U.Types and roles?', {
        chat: scripted.chat,
        maxSteps: 5,
        trace: (event) => traceEvents.push(event),
      });

      expect(scripted.calls[0]?.input).toContain('Reduced FPF branch index:');
      expect(scripted.calls[0]?.input).toContain('F.5 - Naming Discipline for U.Types & Roles');
      expect(scripted.calls[0]?.input).toContain('E.10 - Unified Lexical Rules for FPF');
      expect(result.steps.length).toBeGreaterThanOrEqual(3);
      expect(result.steps[1]).toMatchObject({
        action: 'inspect',
        nodeId: '0004',
        title: 'F.5 - Naming Discipline for U.Types & Roles',
      });
      expect(result.evidence.map((item) => item.nodeId)).toContain('0004');
      expect(traceEvents.some((event) => event.stage === 'answer-deferred')).toBe(true);
    } finally {
      await rm(namingCwd, { force: true, recursive: true });
    }
  });

  test('retrievePageIndex surfaces Part F first in branch routing for broad naming questions', async () => {
    const routingCwd = await mkdtemp(join(tmpdir(), 'fpf-pageindex-branch-order-'));
    const routingContent = `# Part C

## C.1 - Extension note

Kernel extension placeholder.

# Part E

## E.10 - Lexical rules

Use E.10 for lexical discipline and authoring rules.

# Part F

## F.18 - Local-First Naming Protocol

Use F.18 for naming and unified publication.

### F.18:21 - Acceptance Harness (SCR/RSCR)

Checklist for F.18 naming decisions.

# Part H

## H.1 - Glossary

Glossary entries and definitional index.
`;

    try {
      await mkdir(join(routingCwd, 'FPF'), { recursive: true });
      await Bun.write(join(routingCwd, 'FPF', 'FPF-Spec.md'), routingContent);
      await ensurePageIndex({
        cwd: routingCwd,
        targetPath: 'FPF/FPF-Spec.md',
        content: routingContent,
        generatedAt: '2026-04-07T12:00:00.000Z',
      });
      await rm(join(routingCwd, 'FPF', 'FPF-Spec.md'));

      const scripted = createScriptedChat([
        JSON.stringify({
          action: 'expand',
          node_list: ['F'],
          rationale: 'Part F is the relevant naming branch.',
        }),
        JSON.stringify({
          action: 'inspect',
          node_list: ['0006'],
          rationale: 'Inspect the Part F naming protocol root first.',
        }),
        JSON.stringify({
          action: 'answer',
          rationale: 'The naming protocol root is sufficient.',
          answer_plan: 'Answer from F.18.',
        }),
        JSON.stringify({
          action: 'answer',
          rationale: 'The naming protocol root remains sufficient.',
          answer_plan: 'Answer from F.18.',
        }),
      ]);

      const result = await retrievePageIndex(routingCwd, 'Which pattern should I use for naming, and is there a checklist template?', {
        chat: scripted.chat,
        maxSteps: 4,
      });
      const branchLines = (scripted.calls[0]?.input ?? '').split('\n').filter((line) => line.startsWith('- node '));

      expect(result.status).toBe('complete');
      expect(branchLines[0]).toContain('branch F');
      expect(branchLines.findIndex((line) => line.includes('branch F'))).toBeLessThan(branchLines.findIndex((line) => line.includes('branch C')));
      expect(branchLines.findIndex((line) => line.includes('branch F'))).toBeLessThan(branchLines.findIndex((line) => line.includes('branch H')));
    } finally {
      await rm(routingCwd, { force: true, recursive: true });
    }
  });

  test('retrievePageIndex keeps the preferred owner branch in play for broad naming questions', async () => {
    const anchorCwd = await mkdtemp(join(tmpdir(), 'fpf-pageindex-branch-anchor-'));
    const anchorContent = `# Part E

## E.17 - Authoring template

Use E.17 for authoring templates.

# Part F

## F.18 - Local-First Naming Protocol

Use F.18 for naming and unified publication.

### F.18:21 - Acceptance Harness (SCR/RSCR)

Checklist for F.18 naming decisions.

# Part H

## H.1 - Glossary

Glossary entries and definitional index.
`;

    const traceEvents: PageIndexTraceEvent[] = [];
    const extractCandidateNodeId = (input: string, titleFragment: string): string | null => {
      const line = input
        .split('\n')
        .find((value) => value.startsWith('- ') && value.includes(titleFragment));

      if (!line) {
        return null;
      }

      const match = /^-\s+([^\s|]+)\s+\|/.exec(line);

      return match?.[1] ?? null;
    };

    let frontierCallCount = 0;
    let firstFrontierInput = '';

    try {
      await mkdir(join(anchorCwd, 'FPF'), { recursive: true });
      await Bun.write(join(anchorCwd, 'FPF', 'FPF-Spec.md'), anchorContent);
      await ensurePageIndex({
        cwd: anchorCwd,
        targetPath: 'FPF/FPF-Spec.md',
        content: anchorContent,
        generatedAt: '2026-04-07T12:00:00.000Z',
      });
      await rm(join(anchorCwd, 'FPF', 'FPF-Spec.md'));

      const result = await retrievePageIndex(anchorCwd, 'Which pattern should I use for naming, and is there a checklist template?', {
        trace: (event) => traceEvents.push(event),
        chat: async (request) => {
          if (request.purpose === 'branch-selection') {
            return JSON.stringify({
              action: 'expand',
              node_list: ['E', 'H'],
              rationale: 'Template and glossary branches look relevant.',
            });
          }

          if (request.purpose === 'frontier-selection') {
            frontierCallCount += 1;

            if (frontierCallCount === 1) {
              firstFrontierInput = request.input;
              const rootId = extractCandidateNodeId(request.input, 'F.18 - Local-First Naming Protocol');
              const harnessId = extractCandidateNodeId(request.input, 'Acceptance Harness (SCR/RSCR)');
              const nodeList = [rootId, harnessId].filter((value): value is string => value !== null);

              return JSON.stringify({
                action: 'inspect',
                node_list: nodeList,
                rationale: 'Inspect the F.18 owner pattern and its harness.',
              });
            }

            return JSON.stringify({
              action: 'answer',
              rationale: 'The F.18 root and harness are sufficient.',
              answer_plan: 'Answer from F.18 and its harness.',
            });
          }

          throw new Error(`unexpected model purpose: ${request.purpose ?? 'unknown'}`);
        },
        maxSteps: 4,
      });
      const branchSelectedEvent = traceEvents.find((event) => event.stage === 'branch-selected');
      const frontierLines = firstFrontierInput.split('\n').filter((line) => line.startsWith('- '));
      const f18Index = frontierLines.findIndex((line) => line.includes('F.18 - Local-First Naming Protocol'));
      const e17Index = frontierLines.findIndex((line) => line.includes('E.17 - Authoring template'));

      expect(result.status).toBe('complete');
      expect(result.steps[0]?.rationale).toContain('Kept preferred branch');
      expect(result.evidence.some((item) => item.title.includes('F.18'))).toBe(true);
      expect(branchSelectedEvent?.message).toContain('/F');
      expect(f18Index).toBeGreaterThanOrEqual(0);
      expect(e17Index).toBeGreaterThanOrEqual(0);
      expect(f18Index).toBeLessThan(e17Index);
    } finally {
      await rm(anchorCwd, { force: true, recursive: true });
    }
  });

  test('retrievePageIndex ranks root naming patterns and harness nodes above migration leaves', async () => {
    const frontierCwd = await mkdtemp(join(tmpdir(), 'fpf-pageindex-frontier-rank-'));
    const frontierContent = `# Part F

## F.18 - Local-First Naming Protocol

Use F.18 for naming and unified publication.

### F.18:4 - Problem

Naming drift causes confusion.

### F.18:21 - Acceptance Harness (SCR/RSCR)

Checklist for F.18 naming decisions.

### F.18:17.3 - Migration from surface-bound naming

Migration guidance for legacy naming surfaces.
`;

    try {
      await mkdir(join(frontierCwd, 'FPF'), { recursive: true });
      await Bun.write(join(frontierCwd, 'FPF', 'FPF-Spec.md'), frontierContent);
      await ensurePageIndex({
        cwd: frontierCwd,
        targetPath: 'FPF/FPF-Spec.md',
        content: frontierContent,
        generatedAt: '2026-04-07T12:00:00.000Z',
      });
      await rm(join(frontierCwd, 'FPF', 'FPF-Spec.md'));

      const scripted = createScriptedChat([
        JSON.stringify({
          action: 'expand',
          node_list: ['F'],
          rationale: 'Part F is the relevant naming branch.',
        }),
        JSON.stringify({
          action: 'inspect',
          node_list: ['0002', '0004'],
          rationale: 'Inspect the naming root and its harness before migration notes.',
        }),
        JSON.stringify({
          action: 'answer',
          rationale: 'The root and harness together are sufficient.',
          answer_plan: 'Answer from F.18 and its harness.',
        }),
        JSON.stringify({
          action: 'answer',
          rationale: 'The root and harness remain sufficient.',
          answer_plan: 'Answer from F.18 and its harness.',
        }),
      ]);

      const result = await retrievePageIndex(frontierCwd, 'Which naming pattern should I use, and does it have a checklist?', {
        chat: scripted.chat,
        maxSteps: 4,
      });
      const frontierLines = (scripted.calls[1]?.input ?? '').split('\n').filter((line) => line.startsWith('- '));
      const rootIndex = frontierLines.findIndex((line) => line.includes('F.18 - Local-First Naming Protocol'));
      const harnessIndex = frontierLines.findIndex((line) => line.includes('Acceptance Harness (SCR/RSCR)'));
      const migrationIndex = frontierLines.findIndex((line) => line.includes('Migration from surface-bound naming'));

      expect(result.status).toBe('complete');
      expect(rootIndex).toBe(0);
      expect(harnessIndex).toBeGreaterThanOrEqual(0);
      expect(migrationIndex).toBeGreaterThanOrEqual(0);
      expect(harnessIndex).toBeLessThan(migrationIndex);
    } finally {
      await rm(frontierCwd, { force: true, recursive: true });
    }
  });

  test('retrievePageIndex seeds branch-local pattern nodes even when part headings have no tree children', async () => {
    const flatCwd = await mkdtemp(join(tmpdir(), 'fpf-pageindex-flat-branches-'));
    const flatContent = `# Part E

# E.10 - Naming Rule

Use E.10 for lexical naming rules.

# Part F

# F.5 - Naming Discipline for U.Types & Roles

Use F.5 when naming U.Types and roles.

# F.18 - Local-First Unification Naming Protocol

Use F.18 when publishing unified names.
`;

    try {
      await mkdir(join(flatCwd, 'FPF'), { recursive: true });
      await Bun.write(join(flatCwd, 'FPF', 'FPF-Spec.md'), flatContent);
      await ensurePageIndex({
        cwd: flatCwd,
        targetPath: 'FPF/FPF-Spec.md',
        content: flatContent,
        generatedAt: '2026-04-07T12:00:00.000Z',
      });
      await rm(join(flatCwd, 'FPF', 'FPF-Spec.md'));

      const scripted = createScriptedChat([
        JSON.stringify({
          action: 'expand',
          node_list: ['0003'],
          rationale: 'Part F is the relevant branch section.',
        }),
        JSON.stringify({
          action: 'inspect',
          node_list: ['0004'],
          rationale: 'F.5 is the earliest direct naming node in the selected branch section.',
        }),
        JSON.stringify({
          action: 'answer',
          rationale: 'F.5 is sufficient.',
          answer_plan: 'Answer from F.5.',
        }),
        JSON.stringify({
          action: 'answer',
          rationale: 'F.5 remains sufficient.',
          answer_plan: 'Answer from F.5.',
        }),
      ]);

      const result = await retrievePageIndex(flatCwd, 'Which pattern to use for naming?', {
        chat: scripted.chat,
        maxSteps: 4,
      });

      expect(result.status).toBe('complete');
      expect(result.steps[0]).toMatchObject({
        action: 'inspect',
        nodeId: '0004',
        title: 'F.5 - Naming Discipline for U.Types & Roles',
      });
      expect(result.evidence[0]?.nodeId).toBe('0004');
    } finally {
      await rm(flatCwd, { force: true, recursive: true });
    }
  });

  test('retrievePageIndex treats repeated evidence selections as answer attempts and keeps searching when stronger frontier nodes remain', async () => {
    const retryCwd = await mkdtemp(join(tmpdir(), 'fpf-pageindex-repeat-evidence-'));
    const retryContent = `# Part H

## H.1 - Glossary Note

Glossary context only.

# Part K

## K.1 - Debt Note

Debt context only.

## K.2 - Extra Debt Note

More debt context.

# Part E

## E.10 - Naming Rule

Use E.10 for naming.
`;

    try {
      await mkdir(join(retryCwd, 'FPF'), { recursive: true });
      await Bun.write(join(retryCwd, 'FPF', 'FPF-Spec.md'), retryContent);
      await ensurePageIndex({
        cwd: retryCwd,
        targetPath: 'FPF/FPF-Spec.md',
        content: retryContent,
        generatedAt: '2026-04-07T12:00:00.000Z',
      });
      await rm(join(retryCwd, 'FPF', 'FPF-Spec.md'));

      const scripted = createScriptedChat([
        JSON.stringify({
          action: 'expand',
          node_list: ['0001', '0003', '0006'],
          rationale: 'Start with the visible local branches.',
        }),
        JSON.stringify({
          action: 'inspect',
          node_list: ['0002'],
          rationale: 'Read the glossary note first.',
        }),
        JSON.stringify({
          action: 'inspect',
          node_list: ['0004'],
          rationale: 'Read the first debt note next.',
        }),
        JSON.stringify({
          action: 'inspect',
          node_list: ['0002'],
          rationale: 'Revisit the already inspected glossary note.',
        }),
        JSON.stringify({
          action: 'answer',
          rationale: 'The naming rule is now sufficient.',
          answer_plan: 'Answer from E.10.',
        }),
      ]);

      const result = await retrievePageIndex(retryCwd, 'Which pattern to use for naming?', {
        chat: scripted.chat,
        maxSteps: 5,
      });

      expect(result.status).toBe('complete');
      expect(result.evidence.map((item) => item.nodeId)).toContain('0007');
      expect(
        result.steps.some((step) => 'nodeId' in step && step.nodeId === '0007'),
      ).toBe(true);
    } finally {
      await rm(retryCwd, { force: true, recursive: true });
    }
  });

  test('retrievePageIndex tolerates expand on a leaf frontier node by inspecting it', async () => {
    const scripted = createScriptedChat([
      JSON.stringify({
        action: 'inspect',
        node_list: ['0001'],
        rationale: 'Part A is the relevant branch.',
      }),
      JSON.stringify({
        action: 'expand',
        node_list: ['0002'],
        rationale: 'Select the direct leaf section.',
      }),
      JSON.stringify({
        action: 'answer',
        rationale: 'The direct section is sufficient.',
        answer_plan: 'Answer from node 0002.',
      }),
    ]);

    const result = await retrievePageIndex(cwd, 'What is bounded context?', {
      chat: scripted.chat,
      maxSteps: 4,
    });

    expect(result.status).toBe('complete');
    expect(result.steps[0]).toMatchObject({
      action: 'inspect',
      nodeId: '0002',
    });
    expect(result.evidence[0]?.nodeId).toBe('0002');
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
          action: 'expand',
          node_list: ['0002'],
          rationale: 'Expand the routing container first.',
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
        action: 'expand',
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

  test('retrievePageIndex retries once when the model returns malformed JSON', async () => {
    const scripted = createScriptedChat([
      'not json',
      JSON.stringify({
        action: 'inspect',
        node_list: ['0003'],
        rationale: 'A.10 is explicitly named in the question.',
      }),
      JSON.stringify({
        action: 'answer',
        rationale: 'The exact A.10 node is sufficient.',
        answer_plan: 'Answer from node 0003.',
      }),
    ]);

    const result = await retrievePageIndex(cwd, 'What does A.10 say?', {
      chat: scripted.chat,
      maxSteps: 2,
    });

    expect(result.status).toBe('complete');
    expect(result.evidence[0]?.nodeId).toBe('0003');
    expect(scripted.calls).toHaveLength(3);
  });

  test('retrievePageIndex falls back to deterministic ranked frontier when malformed JSON persists at frontier stage', async () => {
    const result = await retrievePageIndex(cwd, 'What does A.10 say?', {
      chat: async () => 'not json',
      maxSteps: 1,
    });

    expect(result.status).toBe('step-limit');
    expect(result.evidence[0]?.nodeId).toBe('0003');
    expect(result.steps[0]).toMatchObject({
      action: 'inspect',
      nodeIds: ['0003'],
    });
    expect(result.steps[0]?.rationale).toContain('Frontier selection fell back to deterministic ranked frontier');
  });

  test('retrievePageIndexEffect maps malformed branch-stage JSON into a typed model error', async () => {
    const result = await Effect.runPromise(
      Effect.either(
        retrievePageIndexEffect(cwd, 'What is bounded context?', {
          chat: async () => 'not json',
          maxSteps: 1,
        }),
      ),
    );

    expect(result._tag).toBe('Left');

    if (result._tag !== 'Left') {
      throw new Error('expected Left');
    }

    expect(result.left).toBeInstanceOf(PageIndexModelError);

    if (!(result.left instanceof PageIndexModelError)) {
      throw new Error('expected PageIndexModelError');
    }

    expect(result.left.reason).toContain('model did not return valid JSON');
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
