import { Effect } from 'effect';

import {
  answerWithPageIndexEffect,
  indexPageIndexEffect,
  readPageIndexTreeEffect,
  retrievePageIndexEffect,
  type LocalModelRequest,
  type PageIndexAppError,
  type PageIndexTraceEvent,
} from './memory-use.ts';

type ParsedCommand =
  | { command: 'index' }
  | { command: 'tree' }
  | { command: 'retrieve'; question: string }
  | { command: 'answer'; question: string };

type MemoryCliIo = {
  cwd: string;
  now?: () => string;
  chat?: (request: LocalModelRequest) => Promise<string>;
  trace?: (event: PageIndexTraceEvent) => void;
  stderr(text: string): void;
  stdout(text: string): void;
};

export type MemoryCliResult = {
  exitCode: number;
};

const helpText = `Usage:
  bun run memory index
  bun run memory tree
  bun run memory retrieve <question>
  bun run memory answer <question>
`;

const parseQuestion = (command: 'answer' | 'retrieve', rest: readonly string[]): ParsedCommand => {
  const question = rest.join(' ').trim();

  if (!question) {
    throw new Error(`missing question for ${command}`);
  }

  return {
    command,
    question,
  };
};

const parseCommand = (args: readonly string[]): ParsedCommand => {
  const [rawCommand, ...rest] = args;

  switch (rawCommand) {
    case 'index':
      return { command: 'index' };
    case 'tree':
      return { command: 'tree' };
    case 'retrieve':
      return parseQuestion('retrieve', rest);
    case 'answer':
      return parseQuestion('answer', rest);
    default:
      throw new Error(`unknown command: ${rawCommand ?? 'undefined'}`);
  }
};

const executeCommand = (parsed: ParsedCommand, io: MemoryCliIo): Effect.Effect<unknown, PageIndexAppError> => {
  const options = {
    ...(io.chat ? { chat: io.chat } : {}),
    ...(io.trace ? { trace: io.trace } : {}),
  };

  switch (parsed.command) {
    case 'index':
      return indexPageIndexEffect(io.cwd, 'FPF/FPF-Spec.md', io.now ?? (() => new Date().toISOString()));
    case 'tree':
      return readPageIndexTreeEffect(io.cwd);
    case 'retrieve':
      return retrievePageIndexEffect(io.cwd, parsed.question, options);
    case 'answer':
      return answerWithPageIndexEffect(io.cwd, parsed.question, options);
  }
};

const formatTraceEvent = (event: PageIndexTraceEvent): string => {
  switch (event.stage) {
    case 'retrieve-start':
      return `start | ${event.message}`;
    case 'question-match':
      return `step ${event.step} | exact-match | ${event.message}`;
    case 'branch-request':
      return `step ${event.step} | branch-request | ${event.message}`;
    case 'branch-selected':
      return `step ${event.step} | branch-${event.action} | ${event.message}`;
    case 'frontier-request':
      return `step ${event.step} | frontier-request | ${event.message}`;
    case 'frontier-selected':
      return `step ${event.step} | frontier-${event.action} | ${event.message}`;
    case 'step-finish':
      return `step ${event.step} | ${event.action}-finish | ${event.message}`;
    case 'answer-deferred':
      return `step ${event.step} | answer-deferred | ${event.message}`;
    case 'retrieve-complete':
      return `retrieve-complete | ${event.message}`;
    case 'retrieve-step-limit':
      return `step-limit | ${event.message}`;
    case 'answer-request':
      return `answer-request | ${event.message}`;
    case 'answer-complete':
      return `answer-complete | ${event.message}`;
    case 'model-usage':
      return `model-usage | ${event.message}`;
  }
};

const formatAppError = (error: PageIndexAppError): string => {
  switch (error._tag) {
    case 'PageIndexMissing':
      return `missing pageindex artifact: ${error.path}`;
    case 'PageIndexIoError':
      return `pageindex io error at ${error.path}: ${error.reason}`;
    case 'PageIndexQuestionEmpty':
      return `question is empty: ${error.question}`;
    case 'PageIndexNodeMissing':
      return `pageindex node missing: ${error.nodeId}`;
    case 'PageIndexModelError':
      return `model error: ${error.reason}`;
    case 'PageIndexActionInvalid':
      return `invalid model action: ${error.reason}`;
    case 'PageIndexEvidenceMissing':
      return `no evidence gathered for question: ${error.question}`;
  }
};

export const runMemoryCli = async (
  args: readonly string[],
  io: MemoryCliIo,
): Promise<MemoryCliResult> => {
  try {
    const command = parseCommand(args);
    const result = await Effect.runPromise(Effect.either(executeCommand(command, io)));

    if (result._tag === 'Left') {
      io.stderr(`${formatAppError(result.left)}\n\n${helpText}`);

      return { exitCode: 1 };
    }

    io.stdout(`${JSON.stringify(result.right, null, 2)}\n`);

    return { exitCode: 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    io.stderr(`${message}\n\n${helpText}`);

    return { exitCode: 1 };
  }
};

const main = async (): Promise<void> => {
  const result = await runMemoryCli(Bun.argv.slice(2), {
    cwd: process.cwd(),
    now: () => new Date().toISOString(),
    trace: (event) => process.stderr.write(`[trace] ${formatTraceEvent(event)}\n`),
    stderr: (text) => process.stderr.write(text),
    stdout: (text) => process.stdout.write(text),
  });

  process.exit(result.exitCode);
};

if (import.meta.main) {
  await main();
}
