import type { SyncConfig } from './contracts.ts';
import { createGitHubDependencies } from './github.ts';
import { runSync } from './sync.ts';

const fixedSyncConfig = {
  owner: 'ailev',
  repo: 'FPF',
  ref: 'main',
  sourcePath: 'FPF-Spec.md',
  targetPath: 'FPF-Spec.md',
  statePath: '.fpf-sync.json',
} as const satisfies Omit<SyncConfig, 'cwd'>;

export const createConfig = (cwd: string): SyncConfig => {
  return {
    cwd,
    ...fixedSyncConfig,
  };
};

const main = async (): Promise<void> => {
  const config = createConfig(process.cwd());
  const deps = createGitHubDependencies(
    process.env.GITHUB_TOKEN ? { token: process.env.GITHUB_TOKEN } : {},
  );
  const summary = await runSync(config, deps);

  process.stdout.write(`${JSON.stringify(summary)}\n`);
};

if (import.meta.main) {
  await main();
}
