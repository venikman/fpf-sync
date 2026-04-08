import { runMcpServer } from './adapters/mcp.ts';

const main = async (): Promise<void> => {
  await runMcpServer(process.cwd());
};

if (import.meta.main) {
  await main();
}
