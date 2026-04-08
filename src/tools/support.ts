import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Data, Effect, ParseResult, Schema } from 'effect';

import type { LineSpan } from '../memory.ts';
import {
  FpfBranchRecordArraySchema,
  PageIndexContentRecordArraySchema,
  PageIndexStateSchema,
} from '../memory-schema.ts';

export type LoadedFpfState = Schema.Schema.Type<typeof PageIndexStateSchema>;
export type LoadedFpfBranches = Schema.Schema.Type<typeof FpfBranchRecordArraySchema>;
export type LoadedFpfBranch = LoadedFpfBranches[number];
export type LoadedFpfContents = Schema.Schema.Type<typeof PageIndexContentRecordArraySchema>;
export type LoadedFpfContent = LoadedFpfContents[number];

export class FpfArtifactError extends Data.TaggedError('FpfArtifactError')<{
  readonly path: string;
  readonly reason: string;
}> {}

const formatDecodeError = (error: ParseResult.ParseError): string => {
  return ParseResult.TreeFormatter.formatErrorSync(error);
};

const readJsonEffect = (path: string): Effect.Effect<unknown, FpfArtifactError> => {
  return Effect.tryPromise({
    try: async () => JSON.parse(await readFile(path, 'utf8')) as unknown,
    catch: (cause) =>
      new FpfArtifactError({
        path,
        reason: cause instanceof Error ? cause.message : String(cause),
      }),
  });
};

const readJsonlEffect = (path: string): Effect.Effect<unknown[], FpfArtifactError> => {
  return Effect.tryPromise({
    try: async () => {
      const raw = await readFile(path, 'utf8');

      return raw
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as unknown);
    },
    catch: (cause) =>
      new FpfArtifactError({
        path,
        reason: cause instanceof Error ? cause.message : String(cause),
      }),
  });
};

const decodeArtifact = <A>(
  path: string,
  schema: Schema.Schema<A>,
  value: unknown,
  label: string,
): Effect.Effect<A, FpfArtifactError> => {
  return Schema.decodeUnknown(schema)(value).pipe(
    Effect.mapError(
      (error) =>
        new FpfArtifactError({
          path,
          reason: `invalid ${label}: ${formatDecodeError(error)}`,
        }),
    ),
  );
};

const memoryPath = (cwd: string, fileName: string): string => {
  return join(cwd, '.memory', fileName);
};

export const loadFpfStateEffect = (cwd: string): Effect.Effect<LoadedFpfState, FpfArtifactError> => {
  const path = memoryPath(cwd, 'pageindex-state.json');

  return Effect.flatMap(readJsonEffect(path), (value) =>
    decodeArtifact(path, PageIndexStateSchema, value, 'pageindex state file'),
  );
};

export const loadFpfBranchesEffect = (cwd: string): Effect.Effect<LoadedFpfBranches, FpfArtifactError> => {
  const path = memoryPath(cwd, 'fpf-branches.json');

  return Effect.flatMap(readJsonEffect(path), (value) =>
    decodeArtifact(path, FpfBranchRecordArraySchema, value, 'fpf branch index file'),
  );
};

export const loadFpfContentsEffect = (cwd: string): Effect.Effect<LoadedFpfContents, FpfArtifactError> => {
  const path = memoryPath(cwd, 'pageindex-content.jsonl');

  return Effect.flatMap(readJsonlEffect(path), (value) =>
    decodeArtifact(path, PageIndexContentRecordArraySchema, value, 'pageindex content file'),
  );
};

export const findFpfNodeEffect = (
  cwd: string,
  nodeId: string,
): Effect.Effect<LoadedFpfContent | null, FpfArtifactError> => {
  return Effect.map(loadFpfContentsEffect(cwd), (contents) => {
    return contents.find((item) => item.nodeId === nodeId) ?? null;
  });
};

export const resolveBranchForLineSpan = (
  branches: readonly LoadedFpfBranch[],
  lineSpan: LineSpan,
): LoadedFpfBranch | null => {
  return branches.find((branch) => lineSpan.start >= branch.lineSpan.start && lineSpan.start <= branch.lineSpan.end) ?? null;
};

export const toExcerpt = (content: string, maxChars = 320): string => {
  const collapsed = content.replace(/\s+/g, ' ').trim();

  if (collapsed.length <= maxChars) {
    return collapsed;
  }

  return `${collapsed.slice(0, maxChars - 1).trimEnd()}…`;
};
