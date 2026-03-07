import type { SyncDependencies, UpstreamCommit } from './contracts.ts';

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
  fetchImpl?: typeof fetch;
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

const readResponseBody = async (response: Response): Promise<string> => {
  return response.text();
};

const request = async (
  url: string,
  init: RequestInit,
  requestTimeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    return await fetchImpl(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
};

const buildHeaders = (token?: string): HeadersInit => {
  return {
    Accept: 'application/vnd.github+json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    'User-Agent': 'fpf-sync',
  };
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
  const headers = buildHeaders(options.token);

  return {
    fetchLatestCommit: async (config) => {
      const params = new URLSearchParams({
        path: config.sourcePath,
        per_page: '1',
        sha: config.ref,
      });
      const url = `https://api.github.com/repos/${config.owner}/${config.repo}/commits?${params.toString()}`;
      const response = await request(url, { headers, method: 'GET' }, requestTimeoutMs, fetchImpl);

      if (!response.ok) {
        throw new Error(
          `latest commit request failed with ${response.status}: ${await readResponseBody(response)}`,
        );
      }

      return parseLatestCommit(await response.json());
    },
    fetchSourceText: async (config, commit) => {
      const encodedPath = encodePath(config.sourcePath);
      const url = `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${commit.sha}/${encodedPath}`;
      const response = await request(
        url,
        {
          headers: {
            ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
            'User-Agent': 'fpf-sync',
          },
          method: 'GET',
        },
        requestTimeoutMs,
        fetchImpl,
      );

      if (!response.ok) {
        throw new Error(
          `source fetch failed with ${response.status}: ${await readResponseBody(response)}`,
        );
      }

      return response.text();
    },
    now: () => new Date().toISOString(),
  };
};
