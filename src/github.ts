import ky, { HTTPError, TimeoutError } from 'ky';

import type { SyncDependencies, UpstreamCommit } from './contracts.ts';

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type GitHubCommitResponse = {
  sha?: string;
  commit?: {
    author?: {
      date?: string;
    };
    committer?: {
      date?: string;
    };
  };
};

type GitHubClientOptions = {
  fetchImpl?: FetchLike;
  requestTimeoutMs?: number;
  token?: string;
};

const defaultTimeoutMs = 15_000;

const encodePath = (path: string): string => {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
};

const buildHeaders = (token?: string): HeadersInit => {
  return {
    Accept: 'application/vnd.github+json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    'User-Agent': 'fpf-sync',
  };
};

const buildClient = (
  fetchImpl: FetchLike,
  requestTimeoutMs: number,
  headers: HeadersInit,
): ReturnType<typeof ky.create> => {
  return ky.create({
    fetch: fetchImpl as typeof fetch,
    headers,
    retry: 0,
    timeout: requestTimeoutMs,
  });
};

const formatHttpError = async (
  error: unknown,
  label: 'latest commit request' | 'source fetch',
  requestTimeoutMs: number,
): Promise<never> => {
  if (error instanceof HTTPError) {
    const responseBody = await error.response.text();

    throw new Error(`${label} failed with ${error.response.status}: ${responseBody}`);
  }

  if (error instanceof TimeoutError) {
    throw new Error(`${label} timed out after ${requestTimeoutMs}ms`);
  }

  throw error;
};

const parseLatestCommit = (payload: unknown): UpstreamCommit => {
  if (!Array.isArray(payload) || payload.length === 0) {
    throw new Error('upstream commit lookup returned no results');
  }

  const [firstCommit] = payload;
  const commit = firstCommit as GitHubCommitResponse;
  const sha = commit.sha?.trim();
  const date = commit.commit?.committer?.date ?? commit.commit?.author?.date;

  if (!sha) {
    throw new Error('upstream commit response is missing sha');
  }

  if (!date) {
    throw new Error('upstream commit response is missing date');
  }

  return { date, sha };
};

export const createGitHubDependencies = (options: GitHubClientOptions = {}): SyncDependencies => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const requestTimeoutMs = options.requestTimeoutMs ?? defaultTimeoutMs;
  const apiClient = buildClient(fetchImpl, requestTimeoutMs, buildHeaders(options.token));
  const rawClient = buildClient(
    fetchImpl,
    requestTimeoutMs,
    options.token
      ? {
          Authorization: `Bearer ${options.token}`,
          'User-Agent': 'fpf-sync',
        }
      : {
          'User-Agent': 'fpf-sync',
        },
  );

  return {
    fetchLatestCommit: async (config) => {
      try {
        return parseLatestCommit(
          await apiClient
            .get(`https://api.github.com/repos/${config.owner}/${config.repo}/commits`, {
              searchParams: {
                path: config.sourcePath,
                per_page: '1',
                sha: config.ref,
              },
            })
            .json<unknown>(),
        );
      } catch (error) {
        return formatHttpError(error, 'latest commit request', requestTimeoutMs);
      }
    },
    fetchSourceText: async (config, commit) => {
      const encodedPath = encodePath(config.sourcePath);
      const url = `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${commit.sha}/${encodedPath}`;

      try {
        return await rawClient.get(url).text();
      } catch (error) {
        return formatHttpError(error, 'source fetch', requestTimeoutMs);
      }
    },
    now: () => new Date().toISOString(),
  };
};
