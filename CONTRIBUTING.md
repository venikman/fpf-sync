# Contributing to fpf-sync

Thank you for your interest in contributing! This guide will help you get started.

## Getting Started

### Prerequisites
- **Bun 1.3+** - [Install Bun](https://bun.sh)
- **Git** - For version control
- Basic knowledge of TypeScript/JavaScript

### Setup
1. Fork and clone the repository
   ```bash
   git clone https://github.com/YOUR_USERNAME/fpf-sync.git
   cd fpf-sync
   ```

2. Install dependencies
   ```bash
   bun install
   ```

3. Run type checking
   ```bash
   bun run typecheck
   ```

## Project Structure

Understanding where things are:

```
fpf-sync/
├── scripts/
│   ├── yadisk-sync.mjs       # Sync script (start here for sync changes)
│   ├── yadisk-lib.ts         # Helper functions
│   └── mcp/
│       ├── server.ts         # MCP server (start here for MCP changes)
│       ├── domain/           # Business logic and models
│       ├── services/         # Service layer
│       └── storage/          # Data persistence
├── .github/workflows/        # GitHub Actions (automation)
├── docs/                     # Documentation
└── yadisk/                   # Synced files (don't edit directly)
```

**Key documents to read:**
- [ARCHITECTURE.md](ARCHITECTURE.md) - How the system works
- [DEVELOPERS.md](DEVELOPERS.md) - Technical details and configuration

## How to Contribute

### 1. Bug Reports
Found a bug? Help us fix it!

**Before reporting:**
- Check existing issues to avoid duplicates
- Test on the latest version
- Gather relevant information (error messages, logs, steps to reproduce)

**Create an issue with:**
- Clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Environment details (Bun version, OS, etc.)
- Relevant logs or error messages

### 2. Feature Requests
Have an idea? We'd love to hear it!

**Create an issue with:**
- Clear description of the feature
- Use case: why is this useful?
- Example usage or mockup
- Any implementation ideas (optional)

### 3. Code Contributions

#### Small Fixes (typos, documentation)
For minor changes, just:
1. Fork the repository
2. Make your changes
3. Submit a pull request

#### New Features or Significant Changes
For larger contributions:
1. **Discuss first** - Open an issue to discuss your idea
2. **Get alignment** - Wait for maintainer feedback
3. **Implement** - Follow the steps below
4. **Submit PR** - Reference the original issue

## Development Workflow

### Step 1: Create a Branch
Use descriptive branch names:
```bash
# For new features
git checkout -b feat/add-retry-logic

# For bug fixes
git checkout -b fix/sanitize-unicode-filenames

# For documentation
git checkout -b docs/improve-mcp-setup

# For CI/testing
git checkout -b ci/add-integration-tests
```

### Step 2: Make Your Changes
- **Write clear code** - Use descriptive variable names
- **Add comments** - Explain "why", not "what"
- **Keep it simple** - Follow existing patterns
- **Stay focused** - One feature/fix per PR

#### Code Style Guidelines
- Use TypeScript strict mode
- Add JSDoc comments for exported functions
- Extract magic numbers to named constants
- Follow existing naming conventions
- Keep functions small and focused

**Example:**
```typescript
/**
 * Validates file size against a maximum limit.
 * @param size - File size in bytes
 * @param maxSize - Maximum allowed size in bytes
 * @throws {Error} If size exceeds maximum
 */
function validateFileSize(size: number, maxSize: number): void {
  if (size > maxSize) {
    throw new Error(`File too large: ${size} bytes exceeds ${maxSize}`);
  }
}
```

### Step 3: Test Your Changes

#### Manual Testing
```bash
# Test sync locally
bun run yadisk:sync \
  --public-url "YOUR_TEST_URL" \
  --dest-path "test-output" \
  --verbose true

# Test MCP server
bun run mcp:fpf
# Then connect with an MCP client
```

#### Type Checking
```bash
bun run typecheck
```

#### Testing Checklist
- [ ] Code runs without errors
- [ ] Type checking passes
- [ ] Tested on relevant platforms (if applicable)
- [ ] Documented any new configuration options
- [ ] Updated relevant documentation

### Step 4: Commit Your Changes
Write clear, descriptive commit messages:

```bash
# Good commit messages
git commit -m "feat: add retry logic for Yandex API requests"
git commit -m "fix: handle Unicode characters in filenames"
git commit -m "docs: add examples to MCP setup guide"

# Less helpful commit messages
git commit -m "update code"
git commit -m "fixes"
git commit -m "WIP"
```

**Commit message format:**
```
type: short description

Optional longer description explaining the change and why it was needed.

Closes #123
```

**Types:**
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `refactor:` - Code refactoring (no behavior change)
- `test:` - Adding or updating tests
- `ci:` - CI/CD changes
- `chore:` - Maintenance tasks

### Step 5: Submit a Pull Request

1. Push your branch to your fork
   ```bash
   git push origin feat/your-feature-name
   ```

2. Open a pull request on GitHub

3. Fill out the PR template with:
   - **Description** - What does this change?
   - **Why** - Why is this change needed?
   - **Testing** - How was this tested?
   - **Screenshots** - If UI changes (if applicable)
   - **Related Issues** - Link to related issues

4. Wait for review and address feedback

## Pull Request Guidelines

### Good PRs
- [ ] Small and focused (one feature/fix)
- [ ] Clear title and description
- [ ] Passes type checking
- [ ] Includes examples or documentation updates
- [ ] References related issues
- [ ] Has been tested manually

### PR Review Process
1. **Automated checks** - Type checking runs automatically
2. **Code review** - Maintainer reviews your code
3. **Feedback** - You may be asked to make changes
4. **Approval** - Once approved, PR will be merged
5. **Merge** - Changes are merged into main branch

## Common Tasks

### Adding a New MCP Tool
1. Open `scripts/mcp/server.ts`
2. Add your tool using the `mcp.tool()` pattern:
   ```typescript
   mcp.tool(
     'fpf.my_new_tool',
     { param1: z.string(), param2: z.number().optional() },
     async (args) => {
       // Your implementation here
       return { content: [{ type: 'text', text: 'result' }] };
     }
   );
   ```
3. Test with an MCP client
4. Update [docs/MCP.md](docs/MCP.md) with the new tool

### Modifying Sync Behavior
1. For validation/sanitization - edit `scripts/yadisk-lib.ts`
2. For sync workflow - edit `scripts/yadisk-sync.mjs`
3. For GitHub Actions - edit `.github/workflows/yadisk-sync.yml`
4. Test locally before submitting PR

### Updating Documentation
- **README.md** - User-facing setup and usage
- **ARCHITECTURE.md** - System design and components
- **DEVELOPERS.md** - Technical configuration details
- **docs/MCP.md** - MCP server setup and tools
- **CONTRIBUTING.md** - This file!

## Questions or Need Help?

- **Unclear documentation?** Open an issue asking for clarification
- **Stuck on implementation?** Open a draft PR and ask for guidance
- **Not sure if a feature fits?** Open an issue to discuss first

## Code of Conduct

Be respectful and constructive:
- Be welcoming to newcomers
- Provide constructive feedback
- Focus on the code, not the person
- Assume good intentions
- Be patient with questions

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.

---

Thank you for contributing to fpf-sync! 🎉
