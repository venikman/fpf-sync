import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { SyncConfig, SyncState, UpstreamCommit } from '../src/contracts.ts';
import { runSync } from '../src/sync.ts';
import { createConfig } from '../src/sync-fpf.ts';

type MockUpstream = {
  commit: UpstreamCommit;
  content: string;
  fetchSourceCalls: number;
  failFetch?: Error;
};

const readFixture = async (): Promise<string> => {
  return readFile(new URL('./fixtures/upstream-fpf-spec.md', import.meta.url), 'utf8');
};

const buildConfig = (cwd: string): SyncConfig => {
  return createConfig(cwd);
};

const createUpstream = (content: string, sha = 'abc123def456'): MockUpstream => {
  return {
    commit: {
      sha,
      date: '2026-03-01T12:00:00.000Z',
    },
    content,
    fetchSourceCalls: 0,
  };
};

const createDeps = (upstream: MockUpstream) => {
  return {
    fetchLatestCommit: async () => upstream.commit,
    fetchSourceText: async () => {
      upstream.fetchSourceCalls += 1;

      if (upstream.failFetch) {
        throw upstream.failFetch;
      }

      return upstream.content;
    },
    now: () => '2026-03-07T15:00:00.000Z',
  };
};

let cwd = '';

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'fpf-sync-'));
});

afterEach(async () => {
  if (cwd) {
    await rm(cwd, { force: true, recursive: true });
  }
});

describe('createConfig', () => {
  test('returns the hardcoded sync contract', () => {
    const config = createConfig('/repo');

    expect(config).toEqual({
      cwd: '/repo',
      owner: 'ailev',
      repo: 'FPF',
      ref: 'main',
      sourcePath: 'FPF-Spec.md',
      targetPath: 'FPF-Spec.md',
      statePath: '.fpf-sync.json',
    });
  });
});

describe('runSync', () => {
  test('writes target and state on first sync', async () => {
    const content = await readFixture();
    const upstream = createUpstream(content);
    const result = await runSync(buildConfig(cwd), createDeps(upstream));

    expect(result).toEqual({
      changed: true,
      commitSha: upstream.commit.sha,
      reason: 'upstream-changed',
      status: 'synced',
      targetPath: 'FPF-Spec.md',
    });
    expect(await readFile(join(cwd, 'FPF-Spec.md'), 'utf8')).toBe(content);

    const state = JSON.parse(await readFile(join(cwd, '.fpf-sync.json'), 'utf8')) as SyncState;

    expect(state).toEqual({
      owner: 'ailev',
      repo: 'FPF',
      ref: 'main',
      sourcePath: 'FPF-Spec.md',
      targetPath: 'FPF-Spec.md',
      lastCommitSha: upstream.commit.sha,
      lastCommitDate: upstream.commit.date,
      sourceHtmlUrl: `https://github.com/ailev/FPF/blob/${upstream.commit.sha}/FPF-Spec.md`,
      sourceRawUrl: `https://raw.githubusercontent.com/ailev/FPF/${upstream.commit.sha}/FPF-Spec.md`,
      syncedAt: '2026-03-07T15:00:00.000Z',
    });
  });

  test('returns a no-op when the upstream sha matches local state and target exists', async () => {
    const content = await readFixture();
    const upstream = createUpstream(content);
    const config = buildConfig(cwd);
    const state: SyncState = {
      lastCommitDate: upstream.commit.date,
      lastCommitSha: upstream.commit.sha,
      owner: config.owner,
      ref: config.ref,
      repo: config.repo,
      sourceHtmlUrl: `https://github.com/${config.owner}/${config.repo}/blob/${upstream.commit.sha}/${config.sourcePath}`,
      sourceRawUrl: `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${upstream.commit.sha}/${config.sourcePath}`,
      sourcePath: config.sourcePath,
      syncedAt: '2026-03-05T12:00:00.000Z',
      targetPath: config.targetPath,
    };

    await Bun.write(join(cwd, config.targetPath), content);
    await Bun.write(join(cwd, config.statePath), JSON.stringify(state, null, 2));

    const result = await runSync(config, createDeps(upstream));

    expect(result).toEqual({
      changed: false,
      commitSha: upstream.commit.sha,
      reason: 'upstream-unchanged',
      status: 'noop',
      targetPath: 'FPF-Spec.md',
    });
    expect(upstream.fetchSourceCalls).toBe(0);
  });

  test('rewrites target and state when the upstream sha changes', async () => {
    const original = 'old spec\n';
    const content = await readFixture();
    const upstream = createUpstream(content, 'next789sha');
    const config = buildConfig(cwd);

    await Bun.write(join(cwd, config.targetPath), original);
    await Bun.write(
      join(cwd, config.statePath),
      JSON.stringify(
        {
          lastCommitDate: '2026-02-01T00:00:00.000Z',
          lastCommitSha: 'previous-sha',
          owner: config.owner,
          ref: config.ref,
          repo: config.repo,
          sourceHtmlUrl: 'https://example.com/blob',
          sourceRawUrl: 'https://example.com/raw',
          sourcePath: config.sourcePath,
          syncedAt: '2026-02-01T00:00:00.000Z',
          targetPath: config.targetPath,
        } satisfies SyncState,
        null,
        2,
      ),
    );

    const result = await runSync(config, createDeps(upstream));

    expect(result.status).toBe('synced');
    expect(await readFile(join(cwd, config.targetPath), 'utf8')).toBe(content);
    expect(upstream.fetchSourceCalls).toBe(1);
  });

  test('returns a no-op when the upstream sha is unchanged even if local content drifts', async () => {
    const content = await readFixture();
    const driftedContent = 'manual drift\n';
    const upstream = createUpstream(content);
    const config = buildConfig(cwd);

    await Bun.write(join(cwd, config.targetPath), driftedContent);
    await Bun.write(
      join(cwd, config.statePath),
      JSON.stringify(
        {
          lastCommitDate: upstream.commit.date,
          lastCommitSha: upstream.commit.sha,
          owner: config.owner,
          ref: config.ref,
          repo: config.repo,
          sourceHtmlUrl: `https://github.com/${config.owner}/${config.repo}/blob/${upstream.commit.sha}/${config.sourcePath}`,
          sourceRawUrl: `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${upstream.commit.sha}/${config.sourcePath}`,
          sourcePath: config.sourcePath,
          syncedAt: '2026-03-05T12:00:00.000Z',
          targetPath: config.targetPath,
        } satisfies SyncState,
        null,
        2,
      ),
    );

    const result = await runSync(config, createDeps(upstream));

    expect(result).toEqual({
      changed: false,
      commitSha: upstream.commit.sha,
      reason: 'upstream-unchanged',
      status: 'noop',
      targetPath: 'FPF-Spec.md',
    });
    expect(await readFile(join(cwd, config.targetPath), 'utf8')).toBe(driftedContent);
    expect(upstream.fetchSourceCalls).toBe(0);
  });

  test('fails hard when the fetched source content is empty', async () => {
    const upstream = createUpstream('');

    await expect(runSync(buildConfig(cwd), createDeps(upstream))).rejects.toThrow(
      'source content must be non-empty',
    );
  });

  test('fails hard when the source fetch throws', async () => {
    const upstream = createUpstream('unused');
    upstream.failFetch = new Error('bad gateway');

    await expect(runSync(buildConfig(cwd), createDeps(upstream))).rejects.toThrow('bad gateway');
  });

  test('writes mirrored content without rewriting it', async () => {
    const upstream = createUpstream('time-warp\n');

    await runSync(buildConfig(cwd), createDeps(upstream));

    const written = await readFile(join(cwd, 'FPF-Spec.md'), 'utf8');

    expect(written).toBe('time-warp\n');
  });
});
