# fpf-sync

Sync files from Yandex Disk to GitHub + MCP Server for First Principles Framework + GPT-Powered Automation

## What This Does

1. **Yandex Sync** - Daily automated sync from Yandex Disk → GitHub PR
2. **MCP Server** - Exposes FPF spec to AI tools (VS Code, Claude Desktop)
3. **GPT Automation** - AI-powered code review and task automation via OpenAI GPT models

## Quick Links

- 📖 [FPF Document](yadisk/First%20Principles%20Framework%20%E2%80%94%20Core%20Conceptual%20Specification%20(holonic).md)
- 👨‍💻 [Developer Guide](DEVELOPERS.md) - Setup, config, contributing
- 🔌 [MCP Setup](docs/MCP.md) - Connect AI tools
- 🤖 [GPT Automation](docs/GPT-AUTOMATION.md) - AI-powered code review and tasks
  - [Examples](docs/GPT-EXAMPLES.md) - Practical usage examples

## For Users

**Daily sync runs at 20:00 MSK**
1. Check "Pull requests" tab
2. Review "Sync: Yandex Disk update" PR
3. Merge to update repository

**Manual sync:** Actions → "Sync Yandex Disk to PR" → Run workflow

**GPT Automation:** Actions → "GPT Task Automation" → Select task type → Run workflow

## For Developers

```bash
bun install                     # Install dependencies
bun run yadisk:sync --public-url "URL" --verbose true  # Test sync
bun run mcp:fpf                 # Start MCP server
```

See [DEVELOPERS.md](DEVELOPERS.md) for details.

## Setup (One-Time)

**Enable Actions:** Settings → Actions → General → Workflow permissions
- ✓ "Read and write permissions"
- ✓ "Allow GitHub Actions to create and approve pull requests"

**Configure sync:** See [DEVELOPERS.md](DEVELOPERS.md#github-actions-configuration)

**Configure GPT:** Settings → Secrets and variables → Actions → New secret
- Add `OPENAI_API_KEY` with your OpenAI API key (GPT Pro subscription)

## Troubleshooting

- No PR created? → Check Actions logs and permissions
- Wrong file? → Configure `YANDEX_PUBLIC_PATH` or `YANDEX_TARGET_NAME`
- File too large? → Increase `YANDEX_MAX_BYTES` (default 10MB)

See [DEVELOPERS.md](DEVELOPERS.md#troubleshooting) for more help.
