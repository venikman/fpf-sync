import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { sanitizeFilename, envArg, enforceSizeCap } from '../scripts/yadisk-lib.ts';

describe('sanitizeFilename', () => {
  it('keeps basename and strips directories', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('folder/sub/evil.txt')).toBe('evil.txt');
  });

  it('replaces illegal characters', () => {
    expect(sanitizeFilename('a:b*?"<>|.md')).toBe('a_b______.md');
  });

  it('handles unicode and dot-only names', () => {
    expect(sanitizeFilename('Файл — spec.md')).toBe('Файл — spec.md');
    expect(sanitizeFilename('..')).toBe('_');
  });
});

describe('envArg', () => {
  it('prefers CLI flag over env', () => {
    const argv = ['node', 'script', '--public-url', 'x'];
    const env = { PUBLIC_URL: 'y' } as Record<string, string | undefined>;
    expect(envArg(argv, env, 'public-url')).toBe('x');
  });

  it('reads underscore env var when no flag', () => {
    const argv = ['node', 'script'];
    const env = { PUBLIC_URL: 'y' } as Record<string, string | undefined>;
    expect(envArg(argv, env, 'public-url')).toBe('y');
  });

  it('falls back to default', () => {
    const argv = ['node', 'script'];
    const env = {} as Record<string, string | undefined>;
    expect(envArg(argv, env, 'public-url', 'def')).toBe('def');
  });
});

describe('enforceSizeCap', () => {
  it('throws when reported size exceeds cap', () => {
    expect(() => enforceSizeCap({ reportedSize: 11, maxBytes: 10 })).toThrow();
  });

  it('throws when downloaded bytes exceed cap', () => {
    expect(() => enforceSizeCap({ downloadedBytes: 11, maxBytes: 10 })).toThrow();
  });

  it('does not throw when within cap', () => {
    expect(() => enforceSizeCap({ reportedSize: 9, downloadedBytes: 9, maxBytes: 10 })).not.toThrow();
  });

  it('does not throw when cap is disabled (maxBytes: 0)', () => {
    expect(() => enforceSizeCap({ reportedSize: 100, downloadedBytes: 100, maxBytes: 0 })).not.toThrow();
  });
});

