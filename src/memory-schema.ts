import { Schema } from 'effect';

export const LineSpanSchema = Schema.Struct({
  start: Schema.Number,
  end: Schema.Number,
});

const StringArraySchema = Schema.Array(Schema.String);

type PageIndexNodeShape = {
  nodeId: string;
  title: string;
  depth: number;
  startLine: number;
  endLine: number;
  summary: string;
  references: readonly string[];
  canonicalIds: readonly string[];
  subNodes: readonly PageIndexNodeShape[];
};

export const PageIndexNodeSchema: Schema.Schema<PageIndexNodeShape> = Schema.Struct({
  nodeId: Schema.String,
  title: Schema.String,
  depth: Schema.Number,
  startLine: Schema.Number,
  endLine: Schema.Number,
  summary: Schema.String,
  references: StringArraySchema,
  canonicalIds: StringArraySchema,
  subNodes: Schema.suspend(() => Schema.Array(PageIndexNodeSchema)),
});

export const PageIndexTreeSchema = Schema.Array(PageIndexNodeSchema);

export const PageIndexContentRecordSchema = Schema.Struct({
  nodeId: Schema.String,
  title: Schema.String,
  depth: Schema.Number,
  lineSpan: LineSpanSchema,
  summary: Schema.String,
  references: StringArraySchema,
  canonicalIds: StringArraySchema,
  parentNodeId: Schema.NullOr(Schema.String),
  childNodeIds: StringArraySchema,
  content: Schema.String,
});

export const PageIndexContentRecordArraySchema = Schema.Array(PageIndexContentRecordSchema);

export const PageIndexStateSchema = Schema.Struct({
  kind: Schema.Literal('pageindex-state'),
  schemaVersion: Schema.Literal(2),
  sourcePath: Schema.String,
  maxHeadingDepth: Schema.Number,
  inspectLineBudget: Schema.Number,
  inspectCharBudget: Schema.Number,
  generatedAt: Schema.String,
  contentHash: Schema.String,
  nodeCount: Schema.Number,
});

export const FpfBranchRecordSchema = Schema.Struct({
  branchId: Schema.String,
  nodeId: Schema.String,
  title: Schema.String,
  lineSpan: LineSpanSchema,
  summary: Schema.String,
  patternPrefixes: StringArraySchema,
  focusAreas: StringArraySchema,
});

export const FpfBranchRecordArraySchema = Schema.Array(FpfBranchRecordSchema);
