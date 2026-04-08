import { Effect, Schema } from 'effect';

import { type ToolDef, defineTool } from '../contracts/tool.ts';
import { PageIndexContentRecordSchema } from '../memory-schema.ts';
import { findFpfNodeEffect, type FpfArtifactError } from './support.ts';

export const FpfGetNodeInputSchema = Schema.Struct({
  nodeId: Schema.String,
});
export type FpfGetNodeInput = Schema.Schema.Type<typeof FpfGetNodeInputSchema>;

export const FpfGetNodeSuccessSchema = Schema.extend(
  PageIndexContentRecordSchema,
  Schema.Struct({
    ok: Schema.Literal(true),
  }),
);

export const FpfGetNodeNotFoundSchema = Schema.Struct({
  ok: Schema.Literal(false),
  code: Schema.Literal('not_found'),
  message: Schema.String,
  nodeId: Schema.String,
});

export const FpfGetNodeOutputSchema = Schema.Union(
  FpfGetNodeSuccessSchema,
  FpfGetNodeNotFoundSchema,
);
export type FpfGetNodeOutput = Schema.Schema.Type<typeof FpfGetNodeOutputSchema>;

export const createFpfGetNodeTool = (
  cwd: string,
): ToolDef<'fpf_get_node', FpfGetNodeInput, FpfGetNodeOutput, FpfArtifactError> => {
  return defineTool({
    name: 'fpf_get_node',
    description: 'Load a single FPF PageIndex node and its coherent content by node id.',
    input: FpfGetNodeInputSchema,
    output: FpfGetNodeOutputSchema,
    run: ({ nodeId }) =>
      Effect.map(findFpfNodeEffect(cwd, nodeId), (node) => {
        if (!node) {
          return {
            ok: false as const,
            code: 'not_found' as const,
            message: `No PageIndex node exists for nodeId ${nodeId}.`,
            nodeId,
          };
        }

        return {
          ok: true as const,
          nodeId: node.nodeId,
          title: node.title,
          depth: node.depth,
          lineSpan: node.lineSpan,
          summary: node.summary,
          references: node.references,
          canonicalIds: node.canonicalIds,
          parentNodeId: node.parentNodeId,
          childNodeIds: node.childNodeIds,
          content: node.content,
        };
      }),
  });
};
