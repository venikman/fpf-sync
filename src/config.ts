import { posix as pathPosix } from 'node:path';

import type { SyncConfig } from './contracts.ts';

type ParseConfigInput = {
  argv: string[];
  cwd: string;
  env: Record<string, string | undefined>;
};

type MutableConfig = {
  dryRun: boolean;
  owner: string;
  repo: string;
  ref: string;
  sourcePath: string;
  targetPath: string;
  statePath: string;
};

type MutableConfigPatch = Partial<MutableConfig>;

const defaultConfig: MutableConfig = {
  dryRun: false,
  owner: 'ailev',
  repo: 'FPF',
  ref: 'main',
  sourcePath: 'FPF-Spec.md',
  targetPath: 'FPF-Spec.md',
  statePath: '.fpf-sync.json',
};

const envKeyByField = {
  owner: 'FPF_SYNC_OWNER',
  repo: 'FPF_SYNC_REPO',
  ref: 'FPF_SYNC_REF',
  sourcePath: 'FPF_SYNC_SOURCE_PATH',
  targetPath: 'FPF_SYNC_TARGET_PATH',
  statePath: 'FPF_SYNC_STATE_PATH',
} as const;

const trimNonEmpty = (value: string, fieldName: string): string => {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(`${fieldName} must be non-empty`);
  }

  return trimmed;
};

const normalizeSourcePath = (value: string): string => {
  const normalized = pathPosix.normalize(trimNonEmpty(value, 'sourcePath'));

  if (normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    throw new Error('sourcePath must stay inside the upstream repository');
  }

  if (normalized.startsWith('/')) {
    throw new Error('sourcePath must be relative');
  }

  return normalized;
};

const normalizeLocalPath = (value: string, fieldName: 'statePath' | 'targetPath'): string => {
  const normalized = pathPosix.normalize(trimNonEmpty(value, fieldName));

  if (normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    throw new Error(`${fieldName} must stay inside the repository`);
  }

  if (normalized.startsWith('/')) {
    throw new Error(`${fieldName} must stay inside the repository`);
  }

  return normalized;
};

const parseCliArgs = (argv: string[]): MutableConfigPatch => {
  const config: MutableConfigPatch = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--dry-run') {
      config.dryRun = true;
      continue;
    }

    const nextValue = argv[index + 1];

    if (!nextValue) {
      throw new Error(`missing value for ${arg}`);
    }

    switch (arg) {
      case '--owner':
        config.owner = nextValue;
        break;
      case '--repo':
        config.repo = nextValue;
        break;
      case '--ref':
        config.ref = nextValue;
        break;
      case '--source-path':
        config.sourcePath = nextValue;
        break;
      case '--target-path':
        config.targetPath = nextValue;
        break;
      case '--state-path':
        config.statePath = nextValue;
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }

    index += 1;
  }

  return config;
};

const applyEnvOverrides = (
  config: MutableConfig,
  env: Record<string, string | undefined>,
): MutableConfig => {
  const nextConfig = { ...config };

  for (const [fieldName, envKey] of Object.entries(envKeyByField)) {
    const value = env[envKey];

    if (!value) {
      continue;
    }

    if (fieldName === 'owner' || fieldName === 'repo' || fieldName === 'ref') {
      nextConfig[fieldName] = value;
      continue;
    }

    if (fieldName === 'sourcePath' || fieldName === 'targetPath' || fieldName === 'statePath') {
      nextConfig[fieldName] = value;
    }
  }

  return nextConfig;
};

export const parseConfig = (input: ParseConfigInput): SyncConfig => {
  const cliConfig = parseCliArgs(input.argv);
  const envConfig = applyEnvOverrides(defaultConfig, input.env);
  const merged = {
    ...defaultConfig,
    ...envConfig,
    ...cliConfig,
    dryRun: defaultConfig.dryRun || envConfig.dryRun || cliConfig.dryRun || false,
  };

  return {
    cwd: input.cwd,
    dryRun: merged.dryRun,
    owner: trimNonEmpty(merged.owner, 'owner'),
    repo: trimNonEmpty(merged.repo, 'repo'),
    ref: trimNonEmpty(merged.ref, 'ref'),
    sourcePath: normalizeSourcePath(merged.sourcePath),
    targetPath: normalizeLocalPath(merged.targetPath, 'targetPath'),
    statePath: normalizeLocalPath(merged.statePath, 'statePath'),
  };
};
