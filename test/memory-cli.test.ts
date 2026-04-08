import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ensurePageIndex } from '../src/memory.ts';
import { runMemoryCli } from '../src/memory-cli.ts';
import type { LocalModelRequest, PageIndexTraceEvent } from '../src/memory-use.ts';

const content = `# Part A

## A.1.1 - U.BoundedContext: The Semantic Frame

Bounded context defines local meaning.

## A.10 - Evidence Graph Referring

Evidence links claims to anchors and keeps retrieval auditable.
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

const createIo = (
  cwd: string,
  chat?: (request: LocalModelRequest) => Promise<string>,
  trace?: (event: PageIndexTraceEvent) => void,
) => {
  const stdout: string[] = [];
  const stderr: string[] = [];

  return {
    io: {
      ...(chat ? { chat } : {}),
      ...(trace ? { trace } : {}),
      cwd,
      now: () => '2026-04-07T12:34:56.000Z',
      stderr: (text: string) => stderr.push(text),
      stdout: (text: string) => stdout.push(text),
    },
    readStderr: () => stderr.join(''),
    readStdout: () => stdout.join(''),
  };
};

let cwd = '';

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'fpf-pageindex-cli-'));
  await mkdir(join(cwd, 'FPF'), { recursive: true });
  await Bun.write(join(cwd, 'FPF', 'FPF-Spec.md'), content);
  await ensurePageIndex({
    cwd,
    targetPath: 'FPF/FPF-Spec.md',
    content,
    generatedAt: '2026-04-07T12:00:00.000Z',
  });
});

afterEach(async () => {
  if (cwd) {
    await rm(cwd, { force: true, recursive: true });
  }
});

describe('runMemoryCli', () => {
  test('runs index and rebuilds local pageindex artifacts', async () => {
    await rm(join(cwd, '.memory'), { force: true, recursive: true });
    const { io, readStdout } = createIo(cwd);

    const result = await runMemoryCli(['index'], io);
    const payload = JSON.parse(readStdout()) as {
      artifactRoot: string;
      changed: boolean;
      nodeCount: number;
      targetPath: string;
    };

    expect(result.exitCode).toBe(0);
    expect(payload).toEqual({
      artifactRoot: '.memory',
      changed: true,
      nodeCount: 3,
      targetPath: 'FPF/FPF-Spec.md',
    });
  });

  test('runs tree and returns the local PageIndex tree JSON', async () => {
    const { io, readStdout } = createIo(cwd);

    const result = await runMemoryCli(['tree'], io);
    const payload = JSON.parse(readStdout()) as { nodeCount: number; tree: Array<{ nodeId: string }> };

    expect(result.exitCode).toBe(0);
    expect(payload.nodeCount).toBe(3);
    expect(payload.tree[0]?.nodeId).toBe('0001');
  });

  test('runs retrieve with scripted local model reasoning', async () => {
    await rm(join(cwd, 'FPF', 'FPF-Spec.md'));
    const scripted = createScriptedChat([
      JSON.stringify({
        action: 'inspect',
        node_list: ['0003'],
        rationale: 'A.10 is explicitly named in the question.',
      }),
      JSON.stringify({
        action: 'answer',
        rationale: 'The exact A.10 node is sufficient.',
        answer_plan: 'Use node 0003.',
      }),
    ]);
    const { io, readStdout } = createIo(cwd, scripted.chat);

    const result = await runMemoryCli(['retrieve', 'What', 'does', 'A.10', 'say?'], io);
    const payload = JSON.parse(readStdout()) as {
      status: string;
      evidence: Array<{ nodeId: string }>;
      steps: Array<{ nodeIds: string[] }>;
    };

    expect(result.exitCode).toBe(0);
    expect(payload.status).toBe('complete');
    expect(payload.evidence[0]?.nodeId).toBe('0003');
    expect(payload.steps[0]?.nodeIds).toEqual(['0003']);
  });

  test('emits retrieval trace events while running answer', async () => {
    await rm(join(cwd, 'FPF', 'FPF-Spec.md'));
    const traceEvents: PageIndexTraceEvent[] = [];
    const scripted = createScriptedChat([
      JSON.stringify({
        action: 'expand',
        node_list: ['0001'],
        rationale: 'Part A is the relevant branch.',
      }),
      JSON.stringify({
        action: 'inspect',
        node_list: ['0002'],
        rationale: 'A.1.1 is the direct match.',
      }),
      JSON.stringify({
        action: 'answer',
        rationale: 'The selected node is sufficient.',
        answer_plan: 'Use node 0002.',
      }),
      JSON.stringify({
        answer: 'Bounded context defines local meaning.',
        citations: ['0002'],
      }),
    ]);
    const { io } = createIo(cwd, scripted.chat, (event) => traceEvents.push(event));

    const result = await runMemoryCli(['answer', 'What is bounded context?'], io);

    expect(result.exitCode).toBe(0);
    expect(traceEvents.at(-2)?.stage).toBe('answer-request');
    expect(traceEvents.at(-1)?.stage).toBe('answer-complete');
  });

  test('runs answer with scripted local model reasoning and synthesis', async () => {
    await rm(join(cwd, 'FPF', 'FPF-Spec.md'));
    const scripted = createScriptedChat([
      JSON.stringify({
        action: 'inspect',
        node_list: ['0001'],
        rationale: 'Part A is the relevant branch.',
      }),
      JSON.stringify({
        action: 'inspect',
        node_list: ['0002'],
        rationale: 'A.1.1 is the direct match.',
      }),
      JSON.stringify({
        action: 'answer',
        rationale: 'The selected node is sufficient.',
        answer_plan: 'Use node 0002.',
      }),
      JSON.stringify({
        answer: 'Bounded context defines local meaning.',
        citations: ['0002'],
      }),
    ]);
    const { io, readStdout } = createIo(cwd, scripted.chat);

    const result = await runMemoryCli(['answer', 'What is bounded context?'], io);
    const payload = JSON.parse(readStdout()) as {
      answer: string;
      rendered: string;
      citations: Array<{ nodeId: string; label: string }>;
    };

    expect(result.exitCode).toBe(0);
    expect(payload.answer).toBe('Bounded context defines local meaning.');
    expect(payload.rendered).toContain('Sources:');
    expect(payload.citations[0]?.nodeId).toBe('0002');
    expect(payload.citations[0]?.label).toContain('lines');
  });

  test('fails with a helpful message when retrieve is missing a question', async () => {
    const { io, readStderr } = createIo(cwd);

    const result = await runMemoryCli(['retrieve'], io);

    expect(result.exitCode).toBe(1);
    expect(readStderr()).toContain('missing question for retrieve');
  });

  test('surfaces the model error reason instead of a generic effect failure', async () => {
    await rm(join(cwd, 'FPF', 'FPF-Spec.md'));
    const { io, readStderr } = createIo(cwd, async () => {
      throw new Error('LM Studio rejected the requested model');
    });

    const result = await runMemoryCli(['answer', 'Which pattern can be used for naming?'], io);

    expect(result.exitCode).toBe(1);
    expect(readStderr()).toContain('model error: LM Studio rejected the requested model');
    expect(readStderr()).not.toContain('An error has occurred');
  });

  test('surfaces malformed model JSON instead of a generic effect failure', async () => {
    await rm(join(cwd, 'FPF', 'FPF-Spec.md'));
    const { io, readStderr } = createIo(cwd, async () => 'not json');

    const result = await runMemoryCli(['retrieve', 'What', 'is', 'bounded', 'context?'], io);

    expect(result.exitCode).toBe(1);
    expect(readStderr()).toContain('model error: model did not return valid JSON');
    expect(readStderr()).not.toContain('An error has occurred');
  });
});
