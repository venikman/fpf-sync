import { Effect, Schema } from 'effect';

import { type ToolDef, defineTool } from '../contracts/tool.ts';
import { FpfBranchRecordSchema } from '../memory-schema.ts';
import { loadFpfBranchesEffect, type FpfArtifactError } from './support.ts';

export const FpfListBranchesInputSchema = Schema.Struct({});
export type FpfListBranchesInput = Schema.Schema.Type<typeof FpfListBranchesInputSchema>;

export const FpfListBranchesOutputSchema = Schema.Struct({
  ok: Schema.Literal(true),
  branches: Schema.Array(FpfBranchRecordSchema),
});
export type FpfListBranchesOutput = Schema.Schema.Type<typeof FpfListBranchesOutputSchema>;

export const createFpfListBranchesTool = (
  cwd: string,
): ToolDef<'fpf_list_branches', FpfListBranchesInput, FpfListBranchesOutput, FpfArtifactError> => {
  return defineTool({
    name: 'fpf_list_branches',
    description: 'List the reduced FPF branch index from committed .memory artifacts.',
    input: FpfListBranchesInputSchema,
    output: FpfListBranchesOutputSchema,
    run: () =>
      Effect.map(loadFpfBranchesEffect(cwd), (branches) => {
        return {
          ok: true as const,
          branches,
        };
      }),
  });
};
