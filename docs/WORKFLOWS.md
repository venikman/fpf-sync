# GitHub Actions Workflows Documentation

This document provides comprehensive documentation for all GitHub Actions workflows in the fpf-sync repository.

## Table of Contents

1. [CI Workflow](#ci-workflow)
2. [FPF Pattern Research](#fpf-pattern-research)
3. [Sync Yandex Disk to PR](#sync-yandex-disk-to-pr)
4. [Deploy to Fly.io](#deploy-to-flyio)

---

## CI Workflow

**File:** `.github/workflows/ci.yml`

### Purpose
Continuous integration workflow that runs type checking, linting, formatting, and security checks on every push and pull request to the main branch.

### Triggers
- Push to `main` branch
- Pull requests targeting `main` branch
- Manual workflow dispatch

### Jobs

#### 1. **Test Job** (`test`)
- **Purpose:** Validates TypeScript code compiles without errors
- **Timeout:** 10 minutes
- **Steps:**
  1. Checkout repository
  2. Setup Bun (latest version)
  3. Install dependencies (`bun install`)
  4. Run type check (`bun run typecheck`)

**Exit Criteria:** Fails if TypeScript compilation has errors

#### 2. **Lint Job** (`lint`)
- **Purpose:** Checks code quality and formatting standards
- **Timeout:** 5 minutes
- **Steps:**
  1. Checkout repository
  2. Setup Bun (latest version)
  3. Install dependencies
  4. Run linting (`bun run lint`) - non-blocking
  5. Run format check (`bun run fmt`) - non-blocking

**Exit Criteria:** Currently set to `continue-on-error: true` (warnings only)

#### 3. **Security Job** (`security`)
- **Purpose:** Performs basic security checks
- **Timeout:** 5 minutes
- **Checks:**
  - Ensures `.env` files are not committed
  - Basic secret scanning

**Exit Criteria:** Fails if `.env` file found in repository

#### 4. **Summary Job** (`summary`)
- **Purpose:** Aggregates results from all jobs
- **Dependencies:** `test`, `security`
- **Timeout:** 2 minutes
- **Steps:**
  - Checks status of test and security jobs
  - Fails if either test or security failed
  - Prints success message if all passed

**Exit Criteria:** Fails if test OR security jobs failed

### Permissions
- `contents: read` - Read-only access to repository code

### Usage
```bash
# Automatically runs on push/PR to main
git push origin main

# Manual trigger
gh workflow run ci.yml
```

---

## FPF Pattern Research

**File:** `.github/workflows/fpf-pattern-research.yml`

### Purpose
Automated analysis of the First Principles Framework specification to track pattern evolution over time. Uses AI (Claude Sonnet 4.5) to provide deep architectural insights.

### Triggers
- **Scheduled:** Daily at 17:00 UTC (cron: `0 17 * * *`)
- **Manual:** workflow_dispatch

### Environment Variables
- `SPEC_PATH`: Path to FPF specification file
- `CHANGELOG_DIR`: Directory for individual report files
- `CHANGELOG_INDEX`: Path to changelog index file

### Job: `scan`

**Timeout:** 60 minutes (default)

**Permissions:**
- `contents: write` - Required to commit generated reports

#### Steps

##### 1. **Checkout Repository**
Uses `actions/checkout@v4` to clone the repository.

##### 2. **Setup Bun**
Installs latest Bun runtime using `oven-sh/setup-bun@v2`.

##### 3. **Install Dependencies**
Runs `bun install --no-progress` to install Node packages.

##### 4. **Run Pattern Scanner**
Executes `scripts/pattern-research.ts` with environment variables:
- `GITHUB_RUN_ID`: Unique workflow run identifier
- `GITHUB_SHA`: Commit hash being analyzed
- `GITHUB_TOKEN`: Automatic token for GitHub Copilot API access

**What the scanner does:**
1. Parses FPF specification for pattern headings
2. Detects changes (added/modified/removed patterns)
3. Discovers pattern clusters via cross-references
4. Analyzes changes using Claude Sonnet 4.5
5. Generates multiple output formats:
   - Individual changelog report (Markdown)
   - Changelog index (`CHANGELOG.md`)
   - JSON output with full data
   - Mermaid dependency graphs
   - Historical snapshot (JSON)

##### 5. **Check for Updates**
Determines if any outputs changed:
- Checks `changelog/`, `CHANGELOG.md`, `pattern-history/`, `pattern-outputs/`
- Extracts alert level from latest JSON output
- Sets `changed` and `alert_level` outputs

##### 6. **Commit Pattern Research Reports** (conditional)
**Condition:** Only runs if changes detected

**Actions:**
1. Stages all report files
2. Determines alert emoji based on level:
   - 🚨 High
   - ⚠️ Medium
   - ℹ️ Low
   - ✓ None
3. Creates descriptive commit message with:
   - Alert level
   - Run ID and commit hash
   - Date
   - Summary of included files
4. Commits using `github-actions[bot]` identity
5. Pushes directly to current branch

**Commit Message Format:**
```
${EMOJI} chore: update FPF pattern research reports [YYYY-MM-DD]

Alert level: ${LEVEL}
Run ID: ${RUN_ID}
Commit: ${COMMIT_HASH}

This automated commit includes:
- New changelog report in reports/changelog/
- Updated CHANGELOG.md index
- JSON output for programmatic analysis
- Dependency graphs (Mermaid diagrams)
- Historical snapshot for trend analysis
- AI-powered insights (Claude Sonnet 4.5)
```

##### 7. **No-op Summary** (conditional)
**Condition:** Runs if no changes detected

Simply logs that no changes were found.

### AI Analysis Features

**Model:** Claude Sonnet 4.5 (via GitHub Copilot)

**Analysis Includes:**
- Architectural implications of pattern changes
- Emerging themes and evolution trends
- Integration points and potential tensions
- Strategic recommendations

**API Access:**
- Uses GitHub Copilot API (`https://models.inference.ai.azure.com/chat/completions`)
- Authenticated via automatic `github.token`
- No separate API keys required
- Included with GitHub Copilot subscription

### Output Structure

```
reports/
├── CHANGELOG.md                        # Auto-generated index
├── changelog/                          # Individual reports
│   ├── YYYY-MM-DD_HH-MM-SS-runid.md
│   └── ...
├── pattern-history/                    # Historical snapshots
│   ├── YYYY-MM-DD_HH-MM-SS-runid.json
│   └── ...
└── pattern-outputs/                    # Detailed outputs
    ├── patterns-YYYY-MM-DD_HH-MM-SS.json
    ├── dependency-graph-YYYY-MM-DD_HH-MM-SS.md
    └── ...
```

### Alert Levels

**High (🚨):**
- Core patterns changed (A.1, A.2, A.3, A.4, A.5, E.2)
- 5+ new patterns added

**Medium (⚠️):**
- 3+ patterns changed

**Low (ℹ️):**
- 1-2 patterns updated

**None (✓):**
- No changes detected

### Usage

```bash
# Wait for daily automatic run at 17:00 UTC

# Or trigger manually
gh workflow run fpf-pattern-research.yml

# View results
cat reports/CHANGELOG.md
cat reports/changelog/$(ls -t reports/changelog | head -1)
```

---

## Sync Yandex Disk to PR

**File:** `.github/workflows/yadisk-sync.yml`

### Purpose
Automatically synchronizes content from a Yandex Disk public share to the repository, creating pull requests when changes are detected.

### Triggers
- **Scheduled:** Daily at 20:00 MSK / 17:00 UTC (cron: `0 17 * * *`)
- **Manual:** workflow_dispatch

### Permissions
- `contents: write` - Create branches and commits
- `pull-requests: write` - Create pull requests

### Environment Variables (Configurable)

All can be set via Repository Variables or Secrets:

- `PUBLIC_URL` - Yandex Disk public share URL
  - Default: `https://disk.yandex.ru/d/N2xaJZWo-hhFYw`
  - Fallback chain: Variable → Secret → Default

- `PUBLIC_PATH` - Specific path within the share (optional)
  - No default, uses root if not set

- `TARGET_NAME` - Specific file/folder to download (optional)
  - No default, downloads all if not set

- `DEST_PATH` - Local destination directory
  - Fixed: `yadisk`

- `DEST_FILENAME` - Target filename for downloaded file
  - Default: `First Principles Framework — Core Conceptual Specification (holonic).md`

- `YANDEX_MAX_BYTES` - Maximum download size in bytes
  - Default: `10485760` (10 MB)
  - Configurable via Variable

### Job: `sync`

**Concurrency:**
- Group: `sync-yadisk`
- Cancel in progress: `true` (prevents multiple simultaneous syncs)

**Timeout:** 60 minutes

#### Steps

##### 1. **Checkout**
Uses `actions/checkout@v4` with `persist-credentials: false` for security.

##### 2. **Setup Bun**
Installs latest Bun runtime.

##### 3. **Install Dependencies**
Runs `bun install`.

##### 4. **Download from Yandex Disk**
Executes `scripts/yadisk-sync.mjs` with max size limit.

**Script Actions:**
- Connects to Yandex Disk public share
- Downloads specified file(s) to `yadisk/` directory
- Respects `YANDEX_MAX_BYTES` size limit
- Updates local files if changes detected

##### 5. **Create Pull Request**
Uses `peter-evans/create-pull-request@v6` to create PR.

**PR Configuration:**
- **Commit Message:** `chore(sync): Yandex Disk update`
- **Title:** `Sync: Yandex Disk update`
- **Body Template:**
  ```markdown
  Automated sync from Yandex Disk public share.
  - Source: [URL] [path if specified]
  - Main FPF document: [GitHub link]
  - Review the diff in the "Files changed" tab.
  ```
- **Branch:** `sync/yadisk`
- **Delete Branch:** `true` (cleaned up after merge)
- **Labels:** `sync:auto-merge`
- **Files Tracked:** Only the FPF specification file

**PR Behavior:**
- Creates new PR if changes detected
- Updates existing PR if already open
- Does nothing if no changes

### Usage

```bash
# Wait for daily automatic sync at 20:00 MSK

# Or trigger manually
gh workflow run yadisk-sync.yml

# View pending sync PRs
gh pr list --label sync:auto-merge
```

### Configuration

**To change Yandex Disk URL:**
```bash
# Via GitHub Settings → Variables → Actions
Variable: YANDEX_PUBLIC_URL
Value: https://disk.yandex.ru/d/YOUR_SHARE_ID

# Or via Secrets if URL should be private
Secret: YANDEX_PUBLIC_URL
```

**To change download size limit:**
```bash
# Via GitHub Settings → Variables → Actions
Variable: YANDEX_MAX_BYTES
Value: 20971520  # 20 MB
```

---

## Deploy to Fly.io

**File:** `.github/workflows/fly-deploy.yml`

### Purpose
Automatically deploys the MCP SSE Server application to Fly.io hosting platform when code is pushed to main branch.

### Triggers
- **Push to `main`:** Automatic deployment on every push
- **Manual:** workflow_dispatch

### Permissions
- `contents: read` - Read-only access to repository code

### Job: `deploy`

**Name:** Deploy MCP SSE Server
**Timeout:** 15 minutes

#### Steps

##### 1. **Checkout**
Uses `actions/checkout@v4` to get repository code.

##### 2. **Setup Flyctl**
Installs Fly.io CLI using `superfly/flyctl-actions/setup-flyctl@master`.

##### 3. **Deploy to Fly.io**
Runs `flyctl deploy --remote-only`.

**Flags:**
- `--remote-only` - Builds on Fly.io's servers (not locally)

**Authentication:**
Uses `FLY_API_TOKEN` secret for authentication.

**Deployment Process:**
1. Reads `fly.toml` configuration
2. Builds Docker image on Fly.io servers
3. Deploys to configured Fly.io app
4. Performs health checks
5. Routes traffic to new deployment

### Required Secrets

**`FLY_IO_TOKEN`** (required)
- Fly.io API token for authentication
- Set in: Settings → Secrets and variables → Actions
- Get token from: `flyctl auth token`

### Fly.io Configuration

Application configuration is in `fly.toml` at repository root.

**Typical Configuration:**
```toml
app = "your-app-name"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 3333
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0
```

### Usage

```bash
# Automatic deployment on push to main
git push origin main

# Manual deployment
gh workflow run fly-deploy.yml

# Check deployment status
flyctl status -a your-app-name

# View logs
flyctl logs -a your-app-name
```

### Troubleshooting

**If deployment fails:**

1. Check Fly.io token is valid:
   ```bash
   flyctl auth token
   ```

2. Verify `fly.toml` configuration:
   ```bash
   flyctl config validate
   ```

3. Check build logs in GitHub Actions

4. Manually deploy to test:
   ```bash
   flyctl deploy --remote-only
   ```

---

## Summary Table

| Workflow | Trigger | Frequency | Purpose | Outputs |
|----------|---------|-----------|---------|---------|
| **CI** | Push/PR to main, manual | On-demand | Code quality checks | Pass/Fail status |
| **FPF Pattern Research** | Daily, manual | Daily 17:00 UTC | AI-powered pattern analysis | Changelog reports, JSON, graphs |
| **Sync Yandex Disk** | Daily, manual | Daily 17:00 UTC | Sync external docs | Pull request with updates |
| **Deploy to Fly.io** | Push to main, manual | On every push | Production deployment | Live application |

---

## Common Tasks

### View All Workflows
```bash
gh workflow list
```

### Trigger a Workflow Manually
```bash
gh workflow run <workflow-name>.yml
```

### View Workflow Runs
```bash
gh run list --workflow=<workflow-name>.yml
```

### View Specific Run Details
```bash
gh run view <run-id>
```

### View Workflow Logs
```bash
gh run view <run-id> --log
```

### Re-run Failed Workflow
```bash
gh run rerun <run-id>
```

---

## Secrets and Variables

### Required Secrets

- **`FLY_IO_TOKEN`** - Fly.io API token (for Deploy workflow)

### Optional Variables

- **`YANDEX_PUBLIC_URL`** - Yandex Disk share URL
- **`YANDEX_PUBLIC_PATH`** - Path within share
- **`YANDEX_TARGET_NAME`** - Specific file name
- **`YANDEX_DEST_FILENAME`** - Local filename
- **`YANDEX_MAX_BYTES`** - Download size limit

### No Secrets Needed

- **FPF Pattern Research** - Uses automatic `github.token`
- **CI** - No external services

---

## Maintenance

### Updating Workflow Triggers

Edit the `on:` section in workflow files:

```yaml
on:
  push:
    branches: [main]
  schedule:
    - cron: '0 17 * * *'  # Daily at 17:00 UTC
  workflow_dispatch: {}   # Manual trigger
```

### Modifying Permissions

Edit the `permissions:` section:

```yaml
permissions:
  contents: write        # Commit access
  pull-requests: write   # PR access
```

### Changing Job Timeouts

Edit timeout in job configuration:

```yaml
jobs:
  my-job:
    timeout-minutes: 30  # Default: 360 (6 hours)
```

---

## Troubleshooting

### CI Failing on Type Check

```bash
# Run locally to see errors
bun run typecheck

# Fix errors in TypeScript files
# Then commit and push
```

### Pattern Research Not Creating Reports

1. Check if specification file changed
2. View workflow logs: `gh run view --log`
3. Verify GitHub token has correct permissions
4. Check reports/ directory for output

### Yandex Disk Sync Failing

1. Verify PUBLIC_URL is accessible
2. Check file size under YANDEX_MAX_BYTES limit
3. Test script locally: `bun run scripts/yadisk-sync.mjs`

### Fly.io Deployment Failing

1. Verify FLY_IO_TOKEN secret is set
2. Check fly.toml configuration
3. Test locally: `flyctl deploy --local-only`
4. Review build logs in Actions

---

## Contributing

When modifying workflows:

1. Test changes in a feature branch first
2. Use `workflow_dispatch` for manual testing
3. Check logs for any errors
4. Update this documentation
5. Create PR with workflow changes

---

## Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Fly.io Documentation](https://fly.io/docs/)
- [Bun Documentation](https://bun.sh/docs)
- [GitHub Copilot Models](https://docs.github.com/en/copilot)
