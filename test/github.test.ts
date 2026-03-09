import { describe, expect, test } from 'bun:test';

import type { SyncConfig } from '../src/contracts.ts';
import { createGitHubDependencies } from '../src/github.ts';

const createConfig = (sourcePath = 'FPF-Spec.md'): SyncConfig => {
  return {
    cwd: '/repo',
    owner: 'ailev',
    repo: 'FPF',
    ref: 'main',
    sourcePath,
    statePath: '.fpf-sync.json',
    targetPath: 'FPF-Spec.md',
  };
};

const createFetchRecorder = (
  handler: (request: Request) => Promise<Response> | Response,
): {
  fetchImpl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  requests: Request[];
} => {
  const requests: Request[] = [];

  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init);

    requests.push(request);

    return handler(request);
  };

  return {
    fetchImpl,
    requests,
  };
};

describe('createGitHubDependencies', () => {
  test('fetchLatestCommit requests the GitHub commits endpoint with headers and params', async () => {
    const recorder = createFetchRecorder(() => {
      return new Response(
        JSON.stringify([
          {
            commit: {
              committer: {
                date: '2026-03-01T12:00:00.000Z',
              },
            },
            sha: 'abc123def456',
          },
        ]),
        {
          headers: {
            'content-type': 'application/json',
          },
          status: 200,
        },
      );
    });
    const deps = createGitHubDependencies({
      fetchImpl: recorder.fetchImpl,
      requestTimeoutMs: 5_000,
      token: 'secret-token',
    });

    const result = await deps.fetchLatestCommit(createConfig());
    const request = recorder.requests[0];

    if (!request) {
      throw new Error('expected one request');
    }

    const url = new URL(request.url);

    expect(result).toEqual({
      date: '2026-03-01T12:00:00.000Z',
      sha: 'abc123def456',
    });
    expect(url.origin).toBe('https://api.github.com');
    expect(url.pathname).toBe('/repos/ailev/FPF/commits');
    expect(url.searchParams.get('path')).toBe('FPF-Spec.md');
    expect(url.searchParams.get('per_page')).toBe('1');
    expect(url.searchParams.get('sha')).toBe('main');
    expect(request.headers.get('accept')).toBe('application/vnd.github+json');
    expect(request.headers.get('authorization')).toBe('Bearer secret-token');
    expect(request.headers.get('user-agent')).toBe('fpf-sync');
  });

  test('fetchSourceText requests the encoded raw GitHub URL', async () => {
    const recorder = createFetchRecorder(() => {
      return new Response('mirrored content\n', { status: 200 });
    });
    const deps = createGitHubDependencies({
      fetchImpl: recorder.fetchImpl,
      requestTimeoutMs: 5_000,
    });

    const result = await deps.fetchSourceText(createConfig('docs/FPF Spec.md'), {
      date: '2026-03-01T12:00:00.000Z',
      sha: 'abc123def456',
    });
    const request = recorder.requests[0];

    if (!request) {
      throw new Error('expected one request');
    }

    expect(result).toBe('mirrored content\n');
    expect(request.url).toBe(
      'https://raw.githubusercontent.com/ailev/FPF/abc123def456/docs/FPF%20Spec.md',
    );
    expect(request.headers.get('user-agent')).toBe('fpf-sync');
  });

  test('formats HTTP failures with status and body text', async () => {
    const recorder = createFetchRecorder(() => {
      return new Response('missing', { status: 404 });
    });
    const deps = createGitHubDependencies({
      fetchImpl: recorder.fetchImpl,
      requestTimeoutMs: 5_000,
    });

    await expect(deps.fetchLatestCommit(createConfig())).rejects.toThrow(
      'latest commit request failed with 404: missing',
    );
  });
});
