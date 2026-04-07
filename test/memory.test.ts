import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ensurePageIndex } from '../src/memory.ts';

type PageIndexState = {
  kind: 'pageindex-state';
  schemaVersion: 1;
  sourcePath: string;
  maxHeadingDepth: number;
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
  subNodes: PageIndexNode[];
};

type PageIndexContentRecord = {
  nodeId: string;
  title: string;
  depth: number;
  summary: string;
  references: string[];
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
  test('writes a PageIndex tree and node-content mapping for markdown headings', async () => {
    const content = [
      '# Part A',
      '',
      'Overview text.',
      '',
      '## A.1.1 - U.BoundedContext',
      '',
      'Bounded context defines local meaning.',
      'See Appendix G and A.10.',
      '',
      '### A.1.1.a - Local boundary note',
      '',
      'Nested detail for local interpretation.',
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
      nodeCount: 3,
    });
    expect(state).toMatchObject({
      kind: 'pageindex-state',
      schemaVersion: 1,
      sourcePath: 'FPF-Spec.md',
      maxHeadingDepth: 3,
      generatedAt: '2026-04-07T12:00:00.000Z',
      nodeCount: 3,
    });
    expect(tree).toEqual([
      {
        nodeId: '0001',
        title: 'Part A',
        depth: 1,
        startLine: 1,
        endLine: 4,
        summary: 'Part A Overview text.',
        references: [],
        subNodes: [
          {
            nodeId: '0002',
            title: 'A.1.1 - U.BoundedContext',
            depth: 2,
            startLine: 5,
            endLine: 9,
            summary: 'A.1.1 - U.BoundedContext Bounded context defines local meaning. See Appendix G and A.10.',
            references: ['A.1.1', 'A.10', 'Appendix G'],
            subNodes: [
              {
                nodeId: '0003',
                title: 'A.1.1.a - Local boundary note',
                depth: 3,
                startLine: 10,
                endLine: 12,
                summary: 'A.1.1.a - Local boundary note Nested detail for local interpretation.',
                references: ['A.1.1'],
                subNodes: [],
              },
            ],
          },
        ],
      },
    ]);
    expect(branches).toEqual([
      {
        branchId: 'A',
        nodeId: '0001',
        title: 'Part A',
        lineSpan: { start: 1, end: 4 },
        summary: 'Part A Overview text.',
        patternPrefixes: ['A.'],
        focusAreas: ['kernel', 'bounded context', 'roles', 'methods', 'evidence', 'extension layering'],
      },
    ]);
    expect(contents).toEqual([
      {
        nodeId: '0001',
        title: 'Part A',
        depth: 1,
        summary: 'Part A Overview text.',
        references: [],
        parentNodeId: null,
        childNodeIds: ['0002'],
        lineSpan: { start: 1, end: 4 },
        content: '# Part A\n\nOverview text.',
      },
      {
        nodeId: '0002',
        title: 'A.1.1 - U.BoundedContext',
        depth: 2,
        summary: 'A.1.1 - U.BoundedContext Bounded context defines local meaning. See Appendix G and A.10.',
        references: ['A.1.1', 'A.10', 'Appendix G'],
        parentNodeId: '0001',
        childNodeIds: ['0003'],
        lineSpan: { start: 5, end: 9 },
        content:
          '## A.1.1 - U.BoundedContext\n\nBounded context defines local meaning.\nSee Appendix G and A.10.',
      },
      {
        nodeId: '0003',
        title: 'A.1.1.a - Local boundary note',
        depth: 3,
        summary: 'A.1.1.a - Local boundary note Nested detail for local interpretation.',
        references: ['A.1.1'],
        parentNodeId: '0002',
        childNodeIds: [],
        lineSpan: { start: 10, end: 12 },
        content: '### A.1.1.a - Local boundary note\n\nNested detail for local interpretation.',
      },
    ]);
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
