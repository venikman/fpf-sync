import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

type EvalCase = {
  id: string;
  question: string;
  targetCanonicalId: string;
  category: 'ability' | 'performance' | 'promise';
};

type PageIndexContentRecord = {
  canonicalIds: string[];
};

describe('pageindex eval pack', () => {
  test('covers canonical FPF ids present in the current repo spec', async () => {
    const evalCases = JSON.parse(
      await readFile(join(process.cwd(), 'test/fixtures/pageindex-eval.json'), 'utf8'),
    ) as EvalCase[];
    const rawContents = await readFile(
      join(process.cwd(), '.memory/pageindex-content.jsonl'),
      'utf8',
    );
    const contents = rawContents
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as PageIndexContentRecord);
    const canonicalIds = new Set(contents.flatMap((item) => item.canonicalIds));

    expect(evalCases.length).toBeGreaterThanOrEqual(8);

    for (const evalCase of evalCases) {
      expect(evalCase.question.length).toBeGreaterThan(0);
      expect(['ability', 'performance', 'promise']).toContain(evalCase.category);
      expect(canonicalIds.has(evalCase.targetCanonicalId)).toBe(true);
    }
  });
});
