import { Effect } from 'effect';

import { invokeTool, type ToolInput, type ToolOutput } from './contracts/tool.ts';
import { createToolRegistry, type ToolName, type ToolRegistry } from './tools/index.ts';

const getTool = <Name extends ToolName>(registry: ToolRegistry, name: Name): ToolRegistry[Name] => {
  return registry[name];
};

export const createAgentApi = (cwd = process.cwd()) => {
  const tools = createToolRegistry(cwd);

  const invoke = <Name extends ToolName>(name: Name, input: ToolInput<ToolRegistry[Name]>) => {
    return invokeTool(getTool(tools, name), input);
  };

  return {
    cwd,
    tools,
    invoke,
    fpfListBranches: (input: ToolInput<ToolRegistry['fpf_list_branches']> = {}) =>
      invokeTool(tools.fpf_list_branches, input),
    fpfGetNode: (input: ToolInput<ToolRegistry['fpf_get_node']>) =>
      invokeTool(tools.fpf_get_node, input),
    fpfRetrieve: (input: ToolInput<ToolRegistry['fpf_retrieve']>) =>
      invokeTool(tools.fpf_retrieve, input),
    fpfState: (input: ToolInput<ToolRegistry['fpf_state']> = {}) =>
      invokeTool(tools.fpf_state, input),
    fpfListBranchesPromise: (input: ToolInput<ToolRegistry['fpf_list_branches']> = {}) =>
      Effect.runPromise(invokeTool(tools.fpf_list_branches, input)),
    fpfGetNodePromise: (input: ToolInput<ToolRegistry['fpf_get_node']>) =>
      Effect.runPromise(invokeTool(tools.fpf_get_node, input)),
    fpfRetrievePromise: (input: ToolInput<ToolRegistry['fpf_retrieve']>) =>
      Effect.runPromise(invokeTool(tools.fpf_retrieve, input)),
    fpfStatePromise: (input: ToolInput<ToolRegistry['fpf_state']> = {}) =>
      Effect.runPromise(invokeTool(tools.fpf_state, input)),
  } as const;
};

export type AgentApi = ReturnType<typeof createAgentApi>;

export const agentApi = createAgentApi();
