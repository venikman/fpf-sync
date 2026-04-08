import { describe, expect, test } from 'bun:test';

import { parseMarkdownHeadings } from '../src/memory-markdown.ts';
import {
  collectAppendixLabelValues,
  collectCanonicalIdValues,
} from '../src/memory-tokens.ts';

describe('memory markdown adapter', () => {
  test('parses mdast headings through depth 6 and ignores fenced headings', () => {
    const content = [
      '# Part A',
      '',
      '```md',
      '## Fake heading',
      '```',
      '',
      '## **Preface** (non-normative)',
      '',
      '### A.1.1 - U.BoundedContext',
      '',
      '###### A.1.1:4.3.a.1 - Sixth level note',
    ].join('\n');

    expect(parseMarkdownHeadings(content, 6)).toEqual([
      { depth: 1, line: 1, title: 'Part A' },
      { depth: 2, line: 7, title: 'Preface (non-normative)' },
      { depth: 3, line: 9, title: 'A.1.1 - U.BoundedContext' },
      { depth: 6, line: 11, title: 'A.1.1:4.3.a.1 - Sixth level note' },
    ]);
  });

  test('respects the requested max heading depth', () => {
    const content = [
      '# Root',
      '',
      '## Child',
      '',
      '### Grandchild',
    ].join('\n');

    expect(parseMarkdownHeadings(content, 2)).toEqual([
      { depth: 1, line: 1, title: 'Root' },
      { depth: 2, line: 3, title: 'Child' },
    ]);
  });
});

describe('memory token helper', () => {
  test('preserves canonical FPF ids exactly, including colon scopes and mixed segments', () => {
    const input = [
      'A.1.1:4.3',
      'A.6.B',
      'A.19.CHR',
      'A.1:End',
      'C.3.A:10',
    ].join(' ');

    expect(collectCanonicalIdValues(input)).toEqual([
      'A.1.1:4.3',
      'A.6.B',
      'A.19.CHR',
      'A.1:End',
      'C.3.A:10',
    ]);
  });

  test('rejects malformed ids and partial matches inside larger words', () => {
    const input = [
      'U.BoundedContext should not match.',
      'Malformed A.1: should not match.',
      'Partial xa.10 or xA.10y should not match.',
      'Valid A.6.B and C.3.A:10 should match.',
    ].join(' ');

    expect(collectCanonicalIdValues(input)).toEqual(['A.6.B', 'C.3.A:10']);
  });

  test('normalizes appendix labels from mixed-case text', () => {
    expect(
      collectAppendixLabelValues('See appendix g, APPENDIX 12, and Appendix z for context.'),
    ).toEqual(['Appendix G', 'Appendix 12', 'Appendix Z']);
  });
});
