import { Effect } from 'effect';

import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { invokeTool, toMcpJsonSchema, ToolContractError, type ToolDef } from '../contracts/tool.ts';
import { createToolRegistry, type ToolName, type ToolRegistry } from '../tools/index.ts';

const stderr = (message: string): void => {
  process.stderr.write(`${message}\n`);
};

const toJsonTextContent = (value: unknown) => {
  return {
    type: 'text' as const,
    text: JSON.stringify(value, null, 2),
  };
};

const toMcpToolDescriptor = (tool: ToolDef<string, any, any, any, any>) => {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: toMcpJsonSchema(tool.input),
    outputSchema: toMcpJsonSchema(tool.output),
  } as const;
};

const isKnownToolName = (registry: ToolRegistry, name: string): name is ToolName => {
  return name in registry;
};

const formatToolError = (error: unknown): string => {
  if (error instanceof ToolContractError) {
    return `${error.tool} ${error.stage}: ${error.message}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

export const createMcpServer = (cwd = process.cwd()) => {
  const registry = createToolRegistry(cwd);
  const server = new Server(
    {
      name: 'fpf-sync-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
      instructions:
        'Read-only FPF PageIndex runtime. Prefer structuredContent. Business failures are returned in structured outputs.',
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: Object.values(registry).map((tool) => toMcpToolDescriptor(tool)) as any,
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;

    if (!isKnownToolName(registry, name)) {
      const error = { ok: false, code: 'unknown_tool', message: `Unknown tool: ${name}` };
      stderr(`[mcp] unknown tool requested: ${name}`);

      return {
        isError: true,
        structuredContent: error,
        content: [toJsonTextContent(error)],
      };
    }

    const tool = registry[name];

    try {
      const result = await Effect.runPromise(invokeTool(tool, request.params.arguments ?? {}));

      return {
        structuredContent: result as Record<string, unknown>,
        content: [toJsonTextContent(result)],
      };
    } catch (error) {
      const payload = {
        ok: false,
        code: 'tool_infrastructure_error',
        message: formatToolError(error),
      };
      stderr(`[mcp] tool failure for ${name}: ${payload.message}`);

      return {
        isError: true,
        structuredContent: payload,
        content: [toJsonTextContent(payload)],
      };
    }
  });

  return {
    server,
    registry,
  } as const;
};

export const runMcpServer = async (cwd = process.cwd()): Promise<void> => {
  const { server } = createMcpServer(cwd);
  const transport = new StdioServerTransport();

  await server.connect(transport);
};
