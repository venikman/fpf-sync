export type SyncConfig = {
  cwd: string;
  owner: string;
  repo: string;
  ref: string;
  sourcePath: string;
  targetPath: string;
  statePath: string;
};

export type SyncState = {
  owner: string;
  repo: string;
  ref: string;
  sourcePath: string;
  targetPath: string;
  lastCommitSha: string;
  lastCommitDate: string;
  sourceHtmlUrl: string;
  sourceRawUrl: string;
  syncedAt: string;
};

export type UpstreamCommit = {
  sha: string;
  date: string;
};

export type SyncSummary = {
  changed: boolean;
  commitSha: string;
  reason: 'upstream-changed' | 'upstream-unchanged';
  status: 'noop' | 'synced';
  targetPath: string;
};

export type SyncDependencies = {
  fetchLatestCommit(config: SyncConfig): Promise<UpstreamCommit>;
  fetchSourceText(config: SyncConfig, commit: UpstreamCommit): Promise<string>;
  now(): string;
};
