import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Effect } from 'effect';

import { createAgentApi } from '../src/agentApi.ts';
import { ensurePageIndex } from '../src/memory.ts';

const content = `# Part A

## A.1.1 - U.BoundedContext: The Semantic Frame

Bounded context defines local meaning.

## A.10 - Evidence Graph Referring

Evidence links claims to anchors and keeps retrieval auditable.
`;

let cwd = '';

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'fpf-agent-api-'));
  await mkdir(join(cwd, 'FPF'), { recursive: true });
  await Bun.write(join(cwd, 'FPF', 'FPF-Spec.md'), content);
  await ensurePageIndex({
    cwd,
    targetPath: 'FPF/FPF-Spec.md',
    content,
    generatedAt: '2026-04-08T12:00:00.000Z',
  });
  await rm(join(cwd, 'FPF', 'FPF-Spec.md'));
});

afterEach(async () => {
  if (cwd) {
    await rm(cwd, { force: true, recursive: true });
  }
});

describe('agentApi', () => {
  test('exposes read-only tool calls with structured outputs', async () => {
    const api = createAgentApi(cwd);
    const branches = await Effect.runPromise(api.fpfListBranches({}));
    const node = await Effect.runPromise(api.fpfGetNode({ nodeId: '0002' }));

    expect(branches.ok).toBe(true);
    expect(branches.branches[0]?.branchId).toBe('A');
    expect(node).toMatchObject({
      ok: true,
      nodeId: '0002',
      title: 'A.1.1 - U.BoundedContext: The Semantic Frame',
    });
  });
});
