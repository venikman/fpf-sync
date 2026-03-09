import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type {
  SyncConfig,
  SyncDependencies,
  SyncState,
  SyncSummary,
  UpstreamCommit,
} from './contracts.ts';

type ObservedSync = {
  commit: UpstreamCommit;
  localState: SyncState | null;
  statePathAbs: string;
  targetExists: boolean;
  targetPathAbs: string;
};

const encodePath = (path: string): string => {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
};

const readLocalState = async (statePathAbs: string): Promise<SyncState | null> => {
  const stateFile = Bun.file(statePathAbs);

  if (!(await stateFile.exists())) {
    return null;
  }

  const rawState = await stateFile.text();
  const parsed = JSON.parse(rawState) as Partial<SyncState>;

  if (!parsed.lastCommitSha || !parsed.targetPath || !parsed.sourcePath) {
    throw new Error('state file is missing required fields');
  }

  return parsed as SyncState;
};

const readTargetExists = async (targetPathAbs: string): Promise<boolean> => {
  return Bun.file(targetPathAbs).exists();
};

const observeSync = async (config: SyncConfig, deps: SyncDependencies): Promise<ObservedSync> => {
  const targetPathAbs = join(config.cwd, config.targetPath);
  const statePathAbs = join(config.cwd, config.statePath);
  const [commit, localState, targetExists] = await Promise.all([
    deps.fetchLatestCommit(config),
    readLocalState(statePathAbs),
    readTargetExists(targetPathAbs),
  ]);

  return {
    commit,
    localState,
    statePathAbs,
    targetExists,
    targetPathAbs,
  };
};

const shouldSync = (observed: ObservedSync): boolean => {
  if (!observed.targetExists) {
    return true;
  }

  if (!observed.localState) {
    return true;
  }

  return observed.localState.lastCommitSha !== observed.commit.sha;
};

const buildState = (config: SyncConfig, commit: UpstreamCommit, syncedAt: string): SyncState => {
  const encodedPath = encodePath(config.sourcePath);

  return {
    lastCommitDate: commit.date,
    lastCommitSha: commit.sha,
    owner: config.owner,
    ref: config.ref,
    repo: config.repo,
    sourceHtmlUrl: `https://github.com/${config.owner}/${config.repo}/blob/${commit.sha}/${encodedPath}`,
    sourcePath: config.sourcePath,
    sourceRawUrl: `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${commit.sha}/${encodedPath}`,
    syncedAt,
    targetPath: config.targetPath,
  };
};

const verifyWrite = async (pathAbs: string, label: 'state' | 'target'): Promise<void> => {
  if (!(await Bun.file(pathAbs).exists())) {
    throw new Error(`${label} write verification failed`);
  }
};

const writeOutputs = async (
  observed: ObservedSync,
  config: SyncConfig,
  deps: SyncDependencies,
): Promise<void> => {
  const sourceText = await deps.fetchSourceText(config, observed.commit);

  if (!sourceText.trim()) {
    throw new Error('source content must be non-empty');
  }

  const nextState = buildState(config, observed.commit, deps.now());

  await mkdir(dirname(observed.targetPathAbs), { recursive: true });
  await mkdir(dirname(observed.statePathAbs), { recursive: true });
  await Bun.write(observed.targetPathAbs, sourceText);
  await Bun.write(observed.statePathAbs, `${JSON.stringify(nextState, null, 2)}\n`);

  await verifyWrite(observed.targetPathAbs, 'target');
  await verifyWrite(observed.statePathAbs, 'state');
};

const buildSummary = (
  config: SyncConfig,
  commit: UpstreamCommit,
  status: SyncSummary['status'],
  changed: boolean,
): SyncSummary => {
  return {
    changed,
    commitSha: commit.sha,
    reason: changed ? 'upstream-changed' : 'upstream-unchanged',
    status,
    targetPath: config.targetPath,
  };
};

export const runSync = async (config: SyncConfig, deps: SyncDependencies): Promise<SyncSummary> => {
  const observed = await observeSync(config, deps);
  const nextSyncRequired = shouldSync(observed);

  if (!nextSyncRequired) {
    return buildSummary(config, observed.commit, 'noop', false);
  }

  await writeOutputs(observed, config, deps);

  return buildSummary(config, observed.commit, 'synced', true);
};
