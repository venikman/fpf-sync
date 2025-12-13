# Dual-Source Sync Quick Start Guide

**For**: Repository users and maintainers  
**Updated**: 2025-12-13

## What This Means for You

The FPF document is now synced from **two sources**:
1. **Yandex Disk** (original source) → `yadisk/` directory
2. **GitHub** (https://github.com/ailev/FPF) → `github/` directory

Both sources are automatically synced daily and analyzed for changes.

## Quick Reference

### 📁 Directory Structure
```
fpf-sync/
├── yadisk/       ← Synced from Yandex Disk
└── github/       ← Synced from GitHub (ailev/FPF)
```

### ⏰ Sync Schedule
- **Both sources**: Daily at 17:00 UTC
- **Comparison**: Daily at 18:00 UTC (after both syncs)

### 🏷️ PR Labels
- `source:yadisk` - Changes from Yandex Disk
- `source:github` - Changes from GitHub
- `sync:auto-merge` - Automated sync PR
- `source:divergence` - Sources have diverged significantly

## For Users

### Viewing the FPF Document

Both sources contain the same document with potentially different versions:

**Yandex Disk version**:
```
yadisk/First Principles Framework — Core Conceptual Specification (holonic).md
```

**GitHub version**:
```
github/First Principles Framework — Core Conceptual Specification (holonic).md
```

### Which Source Should I Use?

**For most users**: Either source is fine - they're kept in sync automatically.

**If sources diverge**: A GitHub issue will be opened with details. Check the issue for guidance on which version to use.

### How Do I Know If Sources Differ?

1. Check for open issues labeled `source:divergence`
2. Look at the most recent PR comments from sync workflows
3. Compare file sizes: `ls -lh yadisk/ github/`

## For Maintainers

### Manual Sync Trigger

Trigger a sync manually via GitHub Actions:

1. Go to **Actions** tab
2. Select workflow:
   - `Sync Yandex Disk to PR` for Yandex sync
   - `Sync GitHub FPF to PR` for GitHub sync
3. Click **Run workflow**

### Handling Divergence

If sources diverge significantly (>100 lines difference):

1. **Check the divergence issue** - automatically created with details
2. **Review both files** - compare changes manually
3. **Determine authoritative source** - which version is correct?
4. **Options**:
   - Wait for sources to naturally converge
   - Manually update one source to match the other
   - Document why divergence is expected
5. **Close issue** - once resolved

### Monitoring

**Workflow runs**:
```
Actions → Workflows → [Select workflow] → Recent runs
```

**Failed syncs**: Check workflow logs for error messages

**Divergence alerts**: Check Issues for `source:divergence` label

### Troubleshooting

**Sync failed**:
1. Check workflow logs for error details
2. Verify source is accessible (Yandex Disk link, GitHub repo)
3. Re-run workflow if transient failure
4. Check GitHub Actions status

**Divergence false positive**:
1. Review actual differences (may be formatting only)
2. Adjust threshold in `cross-source-compare.yml` (default: 100 lines)
3. Close issue if divergence is acceptable

**Analysis failed**:
1. Check if diff-eval workflow ran
2. Verify PR has changes in `yadisk/` or `github/` directories
3. Check Warp CLI availability or local testing setup

## Local Testing

### Prerequisites
- Docker Desktop
- `act` CLI tool
- `.secrets` file with credentials

### Test Yandex Sync
```bash
ACT=true act schedule \
  -W .github/workflows/yadisk-sync.yml \
  -j sync \
  --secret-file .secrets
```

### Test GitHub Sync
```bash
ACT=true act schedule \
  -W .github/workflows/github-sync.yml \
  -j sync \
  --secret-file .secrets
```

### Test Cross-Source Comparison
```bash
ACT=true act schedule \
  -W .github/workflows/cross-source-compare.yml \
  -j compare \
  --secret-file .secrets
```

## Common Scenarios

### Scenario 1: First Time Seeing Dual-Source
**What to do**: Nothing! The system works automatically. Both sources are synced and monitored.

### Scenario 2: Divergence Issue Created
**What to do**: 
1. Read the issue description
2. Compare the files manually if needed
3. Wait for sources to converge, or
4. Manually resolve if urgent

### Scenario 3: Want to Use Only One Source
**What to do**: 
1. See [GITHUB_INTEGRATION_PLAN.md](./GITHUB_INTEGRATION_PLAN.md) Option 2 or 3
2. Disable one sync workflow
3. Update documentation

### Scenario 4: Sync Failing Repeatedly
**What to do**:
1. Check source availability
2. Review error logs
3. Open GitHub issue for assistance
4. Temporarily disable failing workflow if needed

## FAQ

**Q: Why two sources?**  
A: Redundancy and flexibility. We can compare versions and continue if one source has issues.

**Q: Which source is "official"?**  
A: To be determined. Currently, both are treated equally. Check divergence issues for guidance.

**Q: Will this change my workflow?**  
A: No. If you were using the Yandex version, it still works the same way.

**Q: What if GitHub source goes away?**  
A: Yandex sync continues working independently. No impact.

**Q: What if Yandex source goes away?**  
A: GitHub sync continues working independently. No impact.

**Q: Can I disable one source?**  
A: Yes. Edit the workflow file and change the schedule, or disable the workflow in GitHub Actions UI.

**Q: How do I know which source a PR came from?**  
A: Check the PR labels (`source:yadisk` or `source:github`) and the PR description.

**Q: What happens if both sources update at the same time?**  
A: Two separate PRs are created, one for each source. They can be merged independently.

## Advanced Configuration

### Change Sync Schedule

Edit the workflow file:
```yaml
on:
  schedule:
    - cron: '0 17 * * *'  # Change this line
```

### Adjust Divergence Threshold

Edit `cross-source-compare.yml`:
```bash
if [ "$TOTAL_CHANGES" -gt 100 ]; then  # Change 100 to desired threshold
```

### Disable a Source

**Option 1**: Comment out the schedule in workflow:
```yaml
# on:
#   schedule:
#     - cron: '0 17 * * *'
```

**Option 2**: Disable workflow in GitHub Actions UI:
1. Actions → Workflows → [Select workflow]
2. Click "..." → Disable workflow

## Documentation

- **Full Integration Plan**: [GITHUB_INTEGRATION_PLAN.md](./GITHUB_INTEGRATION_PLAN.md)
- **Implementation Details**: [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)
- **Security Review**: [SECURITY_REVIEW.md](./SECURITY_REVIEW.md)
- **Main README**: [README.md](./README.md)

## Support

**Issues**: Open a GitHub issue with:
- Description of problem
- Workflow name and run ID
- Error messages from logs
- Steps to reproduce

**Questions**: Check existing issues or documentation first, then open a new issue if needed.

---

**Last Updated**: 2025-12-13  
**Questions?** Open an issue on GitHub
