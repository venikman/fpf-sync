import { createFpfGetNodeTool } from './fpfGetNode.ts';
import { createFpfListBranchesTool } from './fpfListBranches.ts';
import { createFpfRetrieveTool } from './fpfRetrieve.ts';
import { createFpfStateTool } from './fpfState.ts';

export const createToolRegistry = (cwd = process.cwd()) => {
  return {
    fpf_list_branches: createFpfListBranchesTool(cwd),
    fpf_get_node: createFpfGetNodeTool(cwd),
    fpf_retrieve: createFpfRetrieveTool(cwd),
    fpf_state: createFpfStateTool(cwd),
  } as const;
};

export type ToolRegistry = ReturnType<typeof createToolRegistry>;
export type ToolName = keyof ToolRegistry;
