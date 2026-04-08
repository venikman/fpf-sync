import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ensurePageIndex } from '../src/memory.ts';

type PageIndexState = {
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

type PageIndexNode = {
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

type PageIndexContentRecord = {
  nodeId: string;
  title: string;
  depth: number;
  summary: string;
  references: string[];
  canonicalIds: string[];
  parentNodeId: string | null;
  childNodeIds: string[];
  lineSpan: {
    start: number;
    end: number;
  };
  content: string;
};

type FpfBranchRecord = {
  branchId: string;
  nodeId: string;
  title: string;
  lineSpan: {
    start: number;
    end: number;
  };
  summary: string;
  patternPrefixes: string[];
  focusAreas: string[];
};

const readJsonl = async <T>(path: string): Promise<T[]> => {
  const raw = await readFile(path, 'utf8');

  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as T);
};

let cwd = '';

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'fpf-pageindex-'));
});

afterEach(async () => {
  if (cwd) {
    await rm(cwd, { force: true, recursive: true });
  }
});

describe('ensurePageIndex', () => {
  test('writes schema-v2 artifacts with canonical ids and deep heading coverage', async () => {
    const content = [
      '# Part A',
      '',
      'Overview text.',
      '',
      '## A.1.1 - `U.BoundedContext`',
      '',
      'Bounded context defines local meaning.',
      '',
      '### A.1.1:4 - Solution',
      '',
      'See Appendix G and A.1.1:4.3.',
      '',
      '#### A.1.1:4.3 - Context interactions',
      '',
      'Normative detail.',
      '',
      '##### A.1.1:4.3.a - Lower detail',
      '',
      'Even more detail.',
      '',
      '###### A.1.1:4.3.a.1 - Sixth level note',
      '',
      'Leaf detail.',
    ].join('\n');

    const result = await ensurePageIndex({
      cwd,
      targetPath: 'FPF-Spec.md',
      content,
      generatedAt: '2026-04-07T12:00:00.000Z',
    });

    const state = JSON.parse(
      await readFile(join(cwd, '.memory/pageindex-state.json'), 'utf8'),
    ) as PageIndexState;
    const tree = JSON.parse(
      await readFile(join(cwd, '.memory/pageindex-tree.json'), 'utf8'),
    ) as PageIndexNode[];
    const branches = JSON.parse(
      await readFile(join(cwd, '.memory/fpf-branches.json'), 'utf8'),
    ) as FpfBranchRecord[];
    const contents = await readJsonl<PageIndexContentRecord>(
      join(cwd, '.memory/pageindex-content.jsonl'),
    );

    expect(result).toEqual({
      artifactRoot: '.memory',
      changed: true,
      nodeCount: 6,
    });
    expect(state).toMatchObject({
      kind: 'pageindex-state',
      schemaVersion: 2,
      sourcePath: 'FPF-Spec.md',
      maxHeadingDepth: 6,
      inspectLineBudget: 140,
      inspectCharBudget: 6000,
      generatedAt: '2026-04-07T12:00:00.000Z',
      nodeCount: 6,
    });
    expect(tree[0]?.canonicalIds).toEqual([]);
    expect(tree[0]?.subNodes[0]?.canonicalIds).toEqual(['A.1.1']);
    expect(tree[0]?.subNodes[0]?.subNodes[0]?.canonicalIds).toEqual(['A.1.1:4']);
    expect(tree[0]?.subNodes[0]?.subNodes[0]?.subNodes[0]?.canonicalIds).toEqual(['A.1.1:4.3']);
    expect(
      tree[0]?.subNodes[0]?.subNodes[0]?.subNodes[0]?.subNodes[0]?.canonicalIds,
    ).toEqual(['A.1.1:4.3.a']);
    expect(
      tree[0]?.subNodes[0]?.subNodes[0]?.subNodes[0]?.subNodes[0]?.subNodes[0]?.canonicalIds,
    ).toEqual(['A.1.1:4.3.a.1']);
    expect(tree[0]?.subNodes[0]?.subNodes[0]?.references).toEqual(['A.1.1:4', 'A.1.1:4.3', 'Appendix G']);
    expect(branches.map((branch) => branch.branchId)).toEqual(['A']);
    expect(contents.map((item) => item.canonicalIds)).toEqual([
      [],
      ['A.1.1'],
      ['A.1.1:4'],
      ['A.1.1:4.3'],
      ['A.1.1:4.3.a'],
      ['A.1.1:4.3.a.1'],
    ]);
  });

  test('derives canonical FPF branches without synthetic ROOT records', async () => {
    const content = [
      '# First Principles Framework (FPF) — Core Conceptual Specification',
      '',
      '# Table of Content',
      '',
      '# **Preface** (non-normative)',
      '',
      'Overview.',
      '',
      '# Part A – Kernel Architecture Cluster',
      '',
      'Part A overview.',
      '',
      '## **Cluster A.IV.A - Signature Stack & Boundary Discipline (A.6.\\*)**',
      '',
      'Internal cluster detail.',
      '',
      '# Part B – Reasoning Architecture Cluster',
      '',
      'Part B overview.',
    ].join('\n');

    await ensurePageIndex({
      cwd,
      targetPath: 'FPF-Spec.md',
      content,
      generatedAt: '2026-04-07T12:00:00.000Z',
    });

    const branches = JSON.parse(
      await readFile(join(cwd, '.memory/fpf-branches.json'), 'utf8'),
    ) as FpfBranchRecord[];

    expect(branches.map((branch) => branch.branchId)).toEqual(['PREFACE', 'A', 'B']);
    expect(branches.some((branch) => branch.branchId.startsWith('ROOT-'))).toBe(false);
    expect(branches.some((branch) => branch.branchId.startsWith('SECTION-'))).toBe(false);
  });

  test('does not rewrite local pageindex artifacts when source content is unchanged', async () => {
    const content = '# Root\n\n## Child\n\nSame content every run.\n';

    const first = await ensurePageIndex({
      cwd,
      targetPath: 'FPF-Spec.md',
      content,
      generatedAt: '2026-04-07T12:00:00.000Z',
    });
    const second = await ensurePageIndex({
      cwd,
      targetPath: 'FPF-Spec.md',
      content,
      generatedAt: '2026-04-08T12:00:00.000Z',
    });
    const state = JSON.parse(
      await readFile(join(cwd, '.memory/pageindex-state.json'), 'utf8'),
    ) as PageIndexState;

    expect(first.changed).toBe(true);
    expect(second).toEqual({
      artifactRoot: '.memory',
      changed: false,
      nodeCount: 2,
    });
    expect(state.generatedAt).toBe('2026-04-07T12:00:00.000Z');
  });
});
