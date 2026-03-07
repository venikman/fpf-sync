import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseConfig } from '../src/config.ts';
import type { SyncConfig, SyncState, UpstreamCommit } from '../src/contracts.ts';
import { runSync } from '../src/sync.ts';

type MockUpstream = {
  commit: UpstreamCommit;
  content: string;
  fetchSourceCalls: number;
  failFetch?: Error;
};

const readFixture = async (): Promise<string> => {
  return readFile(new URL('./fixtures/upstream-fpf-spec.md', import.meta.url), 'utf8');
};

const createConfig = (cwd: string, dryRun = false): SyncConfig => {
  return parseConfig({
    argv: dryRun ? ['--dry-run'] : [],
    cwd,
    env: {},
  });
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

const createReservedToken = (): string => {
  return ['w', 'a', 'r', 'p'].join('');
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

describe('parseConfig', () => {
  test('uses defaults and accepts env plus cli overrides', () => {
    const config = parseConfig({
      argv: ['--repo', 'forked-fpf', '--target-path', 'mirror/FPF-Spec.md'],
      cwd: '/repo',
      env: {
        FPF_SYNC_OWNER: 'custom-owner',
        FPF_SYNC_REF: 'stable',
        FPF_SYNC_SOURCE_PATH: 'docs/FPF-Spec.md',
        FPF_SYNC_STATE_PATH: '.state/sync.json',
      },
    });

    expect(config).toEqual({
      cwd: '/repo',
      dryRun: false,
      owner: 'custom-owner',
      repo: 'forked-fpf',
      ref: 'stable',
      sourcePath: 'docs/FPF-Spec.md',
      targetPath: 'mirror/FPF-Spec.md',
      statePath: '.state/sync.json',
    });
  });

  test('rejects absolute or escaping local paths', () => {
    expect(() =>
      parseConfig({
        argv: ['--target-path', '../outside.md'],
        cwd: '/repo',
        env: {},
      }),
    ).toThrow('targetPath must stay inside the repository');

    expect(() =>
      parseConfig({
        argv: ['--state-path', '/tmp/state.json'],
        cwd: '/repo',
        env: {},
      }),
    ).toThrow('statePath must stay inside the repository');
  });
});

describe('runSync', () => {
  test('writes target and state on first sync', async () => {
    const content = await readFixture();
    const upstream = createUpstream(content);
    const result = await runSync(createConfig(cwd), createDeps(upstream));

    expect(result).toEqual({
      changed: true,
      commitSha: upstream.commit.sha,
      dryRun: false,
      reason: 'upstream-changed',
      status: 'synced',
      targetPath: 'FPF-Spec.md',
    });
    expect(await readFile(join(cwd, 'FPF-Spec.md'), 'utf8')).toBe(content);

    const state = JSON.parse(await readFile(join(cwd, '.fpf-sync.json'), 'utf8')) as SyncState;

    expect(state).toMatchObject({
      owner: 'ailev',
      repo: 'FPF',
      ref: 'main',
      sourcePath: 'FPF-Spec.md',
      targetPath: 'FPF-Spec.md',
      lastCommitSha: upstream.commit.sha,
      lastCommitDate: upstream.commit.date,
      syncedAt: '2026-03-07T15:00:00.000Z',
    });
  });

  test('returns a no-op when the upstream sha matches local state and target exists', async () => {
    const content = await readFixture();
    const upstream = createUpstream(content);
    const config = createConfig(cwd);
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
      dryRun: false,
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
    const config = createConfig(cwd);

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

  test('fails hard when the fetched source content is empty', async () => {
    const upstream = createUpstream('');

    await expect(runSync(createConfig(cwd), createDeps(upstream))).rejects.toThrow(
      'source content must be non-empty',
    );
  });

  test('fails hard when the source fetch throws', async () => {
    const upstream = createUpstream('unused');
    upstream.failFetch = new Error('bad gateway');

    await expect(runSync(createConfig(cwd), createDeps(upstream))).rejects.toThrow('bad gateway');
  });

  test('breaks reserved tokens in mirrored content before writing', async () => {
    const reservedToken = createReservedToken();
    const upstream = createUpstream(`time-${reservedToken}\n`);

    await runSync(createConfig(cwd), createDeps(upstream));

    const written = await readFile(join(cwd, 'FPF-Spec.md'), 'utf8');

    expect(written.includes(reservedToken)).toBe(false);
    expect(written.includes('\u2060')).toBe(true);
  });

  test('dry-run reports a pending sync without writing files', async () => {
    const content = await readFixture();
    const upstream = createUpstream(content);
    const result = await runSync(createConfig(cwd, true), createDeps(upstream));

    expect(result).toEqual({
      changed: true,
      commitSha: upstream.commit.sha,
      dryRun: true,
      reason: 'upstream-changed',
      status: 'dry-run',
      targetPath: 'FPF-Spec.md',
    });

    await expect(stat(join(cwd, 'FPF-Spec.md'))).rejects.toThrow();
    await expect(stat(join(cwd, '.fpf-sync.json'))).rejects.toThrow();
  });
});
