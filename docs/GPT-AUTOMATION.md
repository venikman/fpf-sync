# GPT-Powered Automation

This document describes the GPT/Codex integration for automated code review and task automation using OpenAI's GPT models.

## Overview

The fpf-sync repository includes GPT-powered automation features that leverage your OpenAI API key (GPT Pro subscription) to provide:

1. **Automatic Code Reviews** - AI-powered analysis of pull requests
2. **Manual Task Automation** - On-demand GPT assistance for various tasks

## Setup

### 1. OpenAI API Key

Get your API key from [OpenAI Platform](https://platform.openai.com/api-keys).

### 2. Configure Repository Secret

1. Go to your repository Settings
2. Navigate to **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `OPENAI_API_KEY`
5. Value: Your OpenAI API key
6. Click **Add secret**

### 3. Enable Workflow Permissions

Ensure GitHub Actions has the necessary permissions:

1. Go to **Settings** → **Actions** → **General**
2. Under "Workflow permissions":
   - ✓ Check "Read and write permissions"
   - ✓ Check "Allow GitHub Actions to create and approve pull requests"

## Features

### Automatic Code Review

**Workflow:** `.github/workflows/gpt-code-review.yml`

Automatically reviews pull requests using GPT-4 when:
- A new PR is opened
- New commits are pushed to an existing PR
- The PR is reopened

**What it analyzes:**
- Code quality and maintainability
- Potential bugs or edge cases
- Security vulnerabilities
- Performance implications
- Best practices and coding standards
- Documentation clarity

**Output:** Posts a comment on the PR with:
- Overall assessment
- Identified strengths
- Concerns and potential issues
- Suggestions for improvement
- Line-specific comments

**Manual trigger:**
```bash
# Via GitHub UI:
Actions → GPT Code Review → Run workflow → Enter PR number
```

### Task Automation

**Workflow:** `.github/workflows/gpt-task-automation.yml`

Manually triggered GPT assistance for various tasks.

**Available tasks:**

#### 1. Code Review
Reviews code changes with GPT analysis.
```
Task: code_review
Target: HEAD~5..HEAD (commit range) or PR number
```

#### 2. Documentation Check
Reviews documentation for clarity and completeness.
```
Task: documentation_check
Target: (optional) specific files or directories
```

#### 3. Commit Analysis
Analyzes commit patterns and provides insights.
```
Task: commit_analysis
Target: HEAD~20..HEAD (commit range)
```

#### 4. Issue Triage
Helps triage issues with suggested labels and next steps.
```
Task: issue_triage
Target: Issue number (required)
```

**How to run:**
1. Go to **Actions** tab
2. Select "GPT Task Automation"
3. Click "Run workflow"
4. Select task type
5. Enter target (if applicable)
6. Optionally add context/instructions
7. Click "Run workflow"

## Scripts

### `scripts/gpt-code-review.ts`

Performs GPT-powered code review on pull requests.

**Usage:**
```bash
export OPENAI_API_KEY="your-key"
export PR_NUMBER="123"
bun run scripts/gpt-code-review.ts
```

**Environment variables:**
- `OPENAI_API_KEY` (required) - Your OpenAI API key
- `PR_NUMBER` (required) - Pull request number
- `BASE_SHA` (optional) - Base commit SHA
- `HEAD_SHA` (optional) - Head commit SHA
- `GITHUB_TOKEN` (optional) - GitHub token for API access

### `scripts/gpt-task-runner.ts`

Flexible GPT-powered task runner.

**Usage:**
```bash
export OPENAI_API_KEY="your-key"
export TASK_TYPE="code_review"
export TASK_TARGET="HEAD~5..HEAD"
bun run scripts/gpt-task-runner.ts
```

**Environment variables:**
- `OPENAI_API_KEY` (required) - Your OpenAI API key
- `TASK_TYPE` (required) - One of: code_review, documentation_check, commit_analysis, issue_triage
- `TASK_TARGET` (optional) - Target for the task (varies by task type)
- `ADDITIONAL_CONTEXT` (optional) - Extra context for GPT
- `GITHUB_TOKEN` (optional) - GitHub token for API access

## Models Used

The scripts use **gpt-4o-mini** by default for cost-effectiveness and speed. This model provides:
- High-quality code analysis
- Fast response times
- Cost-efficient operation

You can modify the model in the script files if needed (e.g., to use `gpt-4` for more complex analysis).

## Cost Considerations

- **gpt-4o-mini**: ~$0.15 per 1M input tokens, ~$0.60 per 1M output tokens
- Typical PR review: ~2,000-5,000 tokens input, ~500-1,500 tokens output
- Estimated cost per review: $0.001-$0.005 (less than 1 cent)

Monitor your usage at [OpenAI Platform](https://platform.openai.com/usage).

## Limitations

1. **Token limits**: Large diffs are truncated to ~8,000 characters
2. **Rate limits**: OpenAI API rate limits apply (typically 500 RPM for paid tiers)
3. **Accuracy**: GPT reviews are supplementary; human review is still recommended
4. **Context**: GPT doesn't have full repository context beyond the diff

## Best Practices

1. **Use as supplementary tool**: Don't replace human code review entirely
2. **Review GPT suggestions**: Not all suggestions may be applicable
3. **Provide context**: Add PR descriptions to help GPT understand changes
4. **Monitor costs**: Keep track of API usage and costs
5. **Set budget limits**: Configure spending limits in OpenAI dashboard

## Troubleshooting

### API Key Issues

**Error**: "Missing required environment variable: OPENAI_API_KEY"

**Solution**: 
1. Verify secret is named exactly `OPENAI_API_KEY`
2. Check the secret is set in the repository (not organization-level only)
3. Re-run the workflow after adding the secret

### Rate Limit Errors

**Error**: "OpenAI API call failed: 429"

**Solution**:
1. Wait a few minutes and re-run
2. Check your OpenAI rate limits: [platform.openai.com/account/limits](https://platform.openai.com/account/limits)
3. Upgrade your OpenAI plan if needed

### Permission Errors

**Error**: "Resource not accessible by integration"

**Solution**:
1. Check workflow permissions (Settings → Actions → General)
2. Ensure "Read and write permissions" is enabled
3. Ensure "Allow GitHub Actions to create and approve pull requests" is enabled

### No Output/Review

**Check**:
1. Review workflow logs in Actions tab
2. Verify PR has actual code changes (not just merge commits)
3. Check if API call succeeded in logs

## Examples

### Example 1: Review a specific PR
```bash
# Via GitHub UI
Actions → GPT Code Review → Run workflow
- PR number: 42
- Run workflow
```

### Example 2: Analyze recent commits
```bash
# Via GitHub UI
Actions → GPT Task Automation → Run workflow
- Task type: commit_analysis
- Target: HEAD~10..HEAD
- Run workflow
```

### Example 3: Check documentation
```bash
# Via GitHub UI
Actions → GPT Task Automation → Run workflow
- Task type: documentation_check
- Target: (leave empty for all docs)
- Run workflow
```

## Security Notes

- API keys are stored securely as GitHub secrets
- Keys are not exposed in logs or outputs
- GPT only receives code diffs, not full repository access
- All API communication uses HTTPS
- Review [OpenAI's data usage policies](https://openai.com/policies/api-data-usage-policies)

## Further Reading

- [OpenAI API Documentation](https://platform.openai.com/docs)
- [GPT-4 Documentation](https://platform.openai.com/docs/models/gpt-4)
- [GitHub Actions Security](https://docs.github.com/en/actions/security-guides)
