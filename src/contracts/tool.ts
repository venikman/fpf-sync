import * as EffectJsonSchema from 'effect/JSONSchema';
import { Data, Effect, ParseResult, Schema } from 'effect';

export type WireSchema<A> = Schema.Schema<A, A, never>;

export interface ToolDef<Name extends string, In, Out, Err = never, Env = never> {
  readonly name: Name;
  readonly description: string;
  readonly input: WireSchema<In>;
  readonly output: WireSchema<Out>;
  readonly run: (input: In) => Effect.Effect<Out, Err, Env>;
}

export class ToolContractError extends Data.TaggedError('ToolContractError')<{
  readonly tool: string;
  readonly stage: 'decode-input' | 'encode-output';
  readonly message: string;
}> {}

export type ToolInput<Tool extends ToolDef<string, any, any, any, any>> = Schema.Schema.Type<Tool['input']>;
export type ToolOutput<Tool extends ToolDef<string, any, any, any, any>> = Schema.Schema.Type<Tool['output']>;
export type ToolError<Tool extends ToolDef<string, any, any, any, any>> = Tool extends ToolDef<string, any, any, infer Err, any>
  ? Err
  : never;
export type ToolEnv<Tool extends ToolDef<string, any, any, any, any>> = Tool extends ToolDef<string, any, any, any, infer Env>
  ? Env
  : never;

export const defineTool = <Name extends string, In, Out, Err = never, Env = never>(
  tool: ToolDef<Name, In, Out, Err, Env>,
): ToolDef<Name, In, Out, Err, Env> => {
  return tool;
};

const formatParseError = (error: ParseResult.ParseError): string => {
  return ParseResult.TreeFormatter.formatErrorSync(error);
};

export const invokeTool = <Tool extends ToolDef<string, any, any, any, any>>(
  tool: Tool,
  input: unknown,
): Effect.Effect<ToolOutput<Tool>, ToolContractError | ToolError<Tool>, ToolEnv<Tool>> => {
  return Effect.gen(function* () {
    const decoded = yield* Schema.decodeUnknown(tool.input)(input).pipe(
      Effect.mapError(
        (error) =>
          new ToolContractError({
            tool: tool.name,
            stage: 'decode-input',
            message: formatParseError(error),
          }),
      ),
    );
    const result = yield* tool.run(decoded);

    return yield* Schema.encodeUnknown(tool.output)(result).pipe(
      Effect.mapError(
        (error) =>
          new ToolContractError({
            tool: tool.name,
            stage: 'encode-output',
            message: formatParseError(error),
          }),
      ),
    );
  });
};

export type ToolJsonSchema = EffectJsonSchema.JsonSchema7Root;

export const toJsonSchema = <A>(schema: WireSchema<A>): ToolJsonSchema => {
  return EffectJsonSchema.make(schema, { target: 'jsonSchema7' });
};

export const toMcpJsonSchema = <A>(schema: WireSchema<A>): ToolJsonSchema => {
  return toJsonSchema(schema);
};
