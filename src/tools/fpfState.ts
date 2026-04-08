import { Effect, Schema } from 'effect';

import { type ToolDef, defineTool } from '../contracts/tool.ts';
import { PageIndexStateSchema } from '../memory-schema.ts';
import { loadFpfStateEffect, type FpfArtifactError } from './support.ts';

export const FpfStateInputSchema = Schema.Struct({});
export type FpfStateInput = Schema.Schema.Type<typeof FpfStateInputSchema>;

export const FpfStateOutputSchema = Schema.Struct({
  ok: Schema.Literal(true),
  state: PageIndexStateSchema,
});
export type FpfStateOutput = Schema.Schema.Type<typeof FpfStateOutputSchema>;

export const createFpfStateTool = (
  cwd: string,
): ToolDef<'fpf_state', FpfStateInput, FpfStateOutput, FpfArtifactError> => {
  return defineTool({
    name: 'fpf_state',
    description: 'Return the current PageIndex state metadata from committed .memory artifacts.',
    input: FpfStateInputSchema,
    output: FpfStateOutputSchema,
    run: () =>
      Effect.map(loadFpfStateEffect(cwd), (state) => {
        return {
          ok: true as const,
          state,
        };
      }),
  });
};
