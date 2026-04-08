import { Effect, Schema } from 'effect';

import { type ToolDef, defineTool } from '../contracts/tool.ts';
import type { PageIndexEvidence } from '../memory-use.ts';
import {
  PageIndexActionInvalid,
  PageIndexEvidenceMissing,
  PageIndexModelError,
  PageIndexNodeMissing,
  PageIndexQuestionEmpty,
  retrievePageIndexEffect,
} from '../memory-use.ts';
import { LineSpanSchema } from '../memory-schema.ts';
import { FpfArtifactError, loadFpfBranchesEffect, loadFpfContentsEffect, resolveBranchForLineSpan, toExcerpt } from './support.ts';

export const FpfRetrieveInputSchema = Schema.Struct({
  question: Schema.String,
  maxNodes: Schema.optional(Schema.Number),
});
export type FpfRetrieveInput = Schema.Schema.Type<typeof FpfRetrieveInputSchema>;

export const FpfRetrieveHitSchema = Schema.Struct({
  nodeId: Schema.String,
  title: Schema.String,
  summary: Schema.String,
  excerpt: Schema.String,
  lineSpan: LineSpanSchema,
  canonicalIds: Schema.Array(Schema.String),
  references: Schema.Array(Schema.String),
  branchId: Schema.NullOr(Schema.String),
  branchTitle: Schema.NullOr(Schema.String),
});
export type FpfRetrieveHit = Schema.Schema.Type<typeof FpfRetrieveHitSchema>;

export const FpfRetrieveFailureSchema = Schema.Struct({
  ok: Schema.Literal(false),
  code: Schema.String,
  message: Schema.String,
});

export const FpfRetrieveSuccessSchema = Schema.Struct({
  ok: Schema.Literal(true),
  query: Schema.String,
  hits: Schema.Array(FpfRetrieveHitSchema),
});

export const FpfRetrieveOutputSchema = Schema.Union(
  FpfRetrieveSuccessSchema,
  FpfRetrieveFailureSchema,
);
export type FpfRetrieveOutput = Schema.Schema.Type<typeof FpfRetrieveOutputSchema>;

const failure = (code: string, message: string): FpfRetrieveOutput => {
  return {
    ok: false,
    code,
    message,
  };
};

const toHit = (
  evidence: PageIndexEvidence,
  nodeMeta: {
    canonicalIds: readonly string[];
    references: readonly string[];
  } | null,
  branchMeta: {
    branchId: string;
    title: string;
  } | null,
): FpfRetrieveHit => {
  return {
    nodeId: evidence.nodeId,
    title: evidence.title,
    summary: evidence.summary,
    excerpt: toExcerpt(evidence.content),
    lineSpan: evidence.lineSpan,
    canonicalIds: nodeMeta ? [...nodeMeta.canonicalIds] : [],
    references: nodeMeta ? [...nodeMeta.references] : [],
    branchId: branchMeta?.branchId ?? null,
    branchTitle: branchMeta?.title ?? null,
  };
};

const mapRetrieveFailure = (
  error:
    | PageIndexActionInvalid
    | PageIndexEvidenceMissing
    | PageIndexModelError
    | PageIndexNodeMissing
    | PageIndexQuestionEmpty,
): FpfRetrieveOutput => {
  switch (error._tag) {
    case 'PageIndexQuestionEmpty':
      return failure('question_empty', 'Question must not be empty.');
    case 'PageIndexEvidenceMissing':
      return failure('no_evidence', `No retrieval evidence was gathered for: ${error.question}`);
    case 'PageIndexModelError':
      return failure('model_error', error.reason);
    case 'PageIndexActionInvalid':
      return failure('invalid_action', error.reason);
    case 'PageIndexNodeMissing':
      return failure('node_missing', `Referenced node ${error.nodeId} is missing from the page index.`);
  }
};

export const createFpfRetrieveTool = (
  cwd: string,
): ToolDef<'fpf_retrieve', FpfRetrieveInput, FpfRetrieveOutput, FpfArtifactError> => {
  return defineTool({
    name: 'fpf_retrieve',
    description: 'Run the FPF PageIndex retriever and return structured evidence hits.',
    input: FpfRetrieveInputSchema,
    output: FpfRetrieveOutputSchema,
    run: ({ question, maxNodes }) => {
      const trimmedQuestion = question.trim();

      if (!trimmedQuestion) {
        return Effect.succeed(failure('question_empty', 'Question must not be empty.'));
      }

      if (typeof maxNodes === 'number' && (!Number.isFinite(maxNodes) || maxNodes <= 0)) {
        return Effect.succeed(failure('invalid_max_nodes', 'maxNodes must be a positive finite number when provided.'));
      }

      const limit = typeof maxNodes === 'number' ? Math.floor(maxNodes) : undefined;

      return Effect.gen(function* () {
        const retrievalResult = yield* Effect.either(retrievePageIndexEffect(cwd, trimmedQuestion, {} as const));

        if (retrievalResult._tag === 'Left') {
          switch (retrievalResult.left._tag) {
            case 'PageIndexQuestionEmpty':
            case 'PageIndexEvidenceMissing':
            case 'PageIndexModelError':
            case 'PageIndexActionInvalid':
            case 'PageIndexNodeMissing':
              return mapRetrieveFailure(retrievalResult.left);
            case 'PageIndexMissing':
              return yield* Effect.fail(
                new FpfArtifactError({
                  path: retrievalResult.left.path,
                  reason: `missing pageindex artifact: ${retrievalResult.left.path}`,
                }),
              );
            case 'PageIndexIoError':
              return yield* Effect.fail(
                new FpfArtifactError({
                  path: retrievalResult.left.path,
                  reason: retrievalResult.left.reason,
                }),
              );
          }
        }

        const retrieval = retrievalResult.right;
        const [branches, contents] = yield* Effect.all([
          loadFpfBranchesEffect(cwd),
          loadFpfContentsEffect(cwd),
        ]);
        const contentsById = new Map(contents.map((item) => [item.nodeId, item]));
        const hits = retrieval.evidence
          .slice(0, limit ?? retrieval.evidence.length)
          .map((evidence) => {
            const node = contentsById.get(evidence.nodeId) ?? null;
            const branch = resolveBranchForLineSpan(branches, evidence.lineSpan);

            return toHit(
              evidence,
              node
                ? {
                    canonicalIds: node.canonicalIds,
                    references: node.references,
                  }
                : null,
              branch
                ? {
                    branchId: branch.branchId,
                    title: branch.title,
                  }
                : null,
            );
          });

        return {
          ok: true as const,
          query: retrieval.question,
          hits,
        };
      });
    },
  });
};
