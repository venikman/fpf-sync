import { parseConfig } from './config.ts';
import { createGitHubDependencies } from './github.ts';
import { runSync } from './sync.ts';

const main = async (): Promise<void> => {
  const config = parseConfig({
    argv: process.argv.slice(2),
    cwd: process.cwd(),
    env: process.env,
  });
  const deps = createGitHubDependencies(
    process.env.GITHUB_TOKEN ? { token: process.env.GITHUB_TOKEN } : {},
  );
  const summary = await runSync(config, deps);

  process.stdout.write(`${JSON.stringify(summary)}\n`);
};

await main();
