# Contributing to fpf-sync

Thanks for contributing! This guide covers the workflow.

## Getting Started

**Prerequisites:** Bun 1.3+, Git, basic TypeScript knowledge

**Setup:**
```bash
git clone https://github.com/YOUR_USERNAME/fpf-sync.git
cd fpf-sync
bun install
bun run typecheck
```

**Key docs:** [ARCHITECTURE.md](ARCHITECTURE.md) (how it works) • [DEVELOPERS.md](DEVELOPERS.md) (technical details)

## How to Contribute

### Bug Reports
Include: Clear description, steps to reproduce, expected vs actual behavior, environment details, logs

### Feature Requests
Include: Description, use case, example usage, implementation ideas (optional)

### Code Contributions
- **Small fixes** (typos, docs): Just fork → edit → submit PR
- **New features**: Open issue first → discuss → implement → submit PR

## Development Workflow

### 1. Create Branch
```bash
git checkout -b feat/your-feature    # Features
git checkout -b fix/bug-description  # Fixes
git checkout -b docs/topic           # Docs
```

### 2. Make Changes
- Write clear code with descriptive names
- Add JSDoc comments for exported functions
- Extract constants, follow existing patterns
- One feature/fix per PR

**Code style:** TypeScript strict mode, JSDoc for exports, named constants

### 3. Test
```bash
bun run typecheck                    # Type check
bun run yadisk:sync --public-url "URL" --verbose true  # Test sync
bun run mcp:fpf                      # Test MCP
```

### 4. Commit
```bash
git commit -m "feat: add retry logic"
git commit -m "fix: handle Unicode filenames"
git commit -m "docs: improve MCP setup"
```

**Format:** `type: short description` where type = feat/fix/docs/refactor/test/ci/chore

### 5. Submit PR
```bash
git push origin feat/your-feature
```

Open PR on GitHub with: description, why needed, how tested, related issues

## PR Guidelines

**Good PRs:** Small, focused, clear title, passes typecheck, includes docs, references issues, tested

**Review process:** Automated checks → Code review → Feedback → Approval → Merge

## Common Tasks

**Add MCP tool:** Edit `scripts/mcp/server.ts`, use `mcp.tool()` pattern, test, update [docs/MCP.md](docs/MCP.md)

**Modify sync:** Edit `scripts/yadisk-lib.ts` (validation) or `scripts/yadisk-sync.mjs` (workflow), test locally

**Update docs:**
- README.md - User setup
- ARCHITECTURE.md - System design
- DEVELOPERS.md - Technical config
- docs/MCP.md - MCP details

## Need Help?

- Unclear docs? → Open issue
- Stuck? → Open draft PR
- Feature idea? → Discuss in issue first

## Code of Conduct

Be respectful: Welcome newcomers, provide constructive feedback, focus on code not person, assume good intentions

---

**Thanks for contributing!**
