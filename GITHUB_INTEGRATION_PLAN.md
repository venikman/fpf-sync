# GitHub Integration Plan for FPF

**Date**: 2025-12-13  
**Issue**: New target to pull - FPF has been put on GitHub at https://github.com/ailev/FPF  
**Current State**: This repository syncs FPF from Yandex Disk  
**Goal**: Plan how to integrate with the GitHub-hosted FPF repository

## Executive Summary

Now that the First Principles Framework (FPF) is available on GitHub at https://github.com/ailev/FPF, this repository can serve as an integration hub that:
1. Syncs from multiple sources (Yandex Disk and GitHub)
2. Provides automated diff analysis for changes from either source
3. Acts as a unified interface for FPF document management
4. Enables cross-source comparison and validation

## Current Architecture

### What This Repository Does Now
- **Yandex Sync**: Downloads FPF document from Yandex Disk (scheduled daily at 17:00 UTC)
- **Diff Analysis**: Runs agentic analysis on document changes via Warp CLI or local LLM
- **PR Automation**: Creates pull requests when source document changes
- **Local Testing**: Supports local workflow execution with `act`

### Current Workflows
1. **yadisk-sync.yml**: Syncs from Yandex Disk → opens PR on changes
2. **diff-eval.yml**: Analyzes diffs in PRs touching `yadisk/**` files

## Integration Strategy Options

### Option 1: Dual-Source Sync (Recommended)
**Description**: Add GitHub as a second sync source alongside Yandex Disk

**Benefits**:
- Maintains backward compatibility with existing Yandex sync
- Enables comparison between Yandex and GitHub versions
- Provides redundancy if one source becomes unavailable
- Can detect divergence between sources

**Implementation**:
- Create new workflow: `github-sync.yml`
- Sync to separate directory: `github/` (parallel to `yadisk/`)
- Both workflows trigger diff analysis on changes
- Optional: Add cross-source comparison workflow

**Structure**:
```
fpf-sync/
├── yadisk/
│   └── First Principles Framework — Core Conceptual Specification (holonic).md
├── github/
│   └── First Principles Framework — Core Conceptual Specification (holonic).md
└── .github/workflows/
    ├── yadisk-sync.yml (existing)
    ├── github-sync.yml (new)
    ├── diff-eval.yml (existing, expanded scope)
    └── cross-source-compare.yml (optional)
```

### Option 2: GitHub-Only Sync
**Description**: Replace Yandex Disk sync with GitHub sync

**Benefits**:
- Simpler architecture (single source of truth)
- Native GitHub integration (webhooks, API)
- Faster sync (no external API dependency)
- Better reliability

**Drawbacks**:
- Loses Yandex Disk as source
- Breaking change for existing workflow
- May not align with project goals if Yandex is authoritative

**Implementation**:
- Deprecate `yadisk-sync.yml`
- Replace with `github-sync.yml`
- Update directory structure to remove `yadisk/` folder
- Migrate to `fpf/` or keep as `yadisk/` for backward compatibility

### Option 3: GitHub as Primary, Yandex as Backup
**Description**: Prefer GitHub sync, fallback to Yandex if GitHub fails

**Benefits**:
- GitHub becomes primary source (likely more reliable)
- Yandex provides backup if GitHub repo goes down
- Single output directory (no duplication)

**Implementation**:
- Modify sync workflow to try GitHub first
- Fall back to Yandex if GitHub sync fails
- Add metadata to track which source was used
- Monitor source health

## Recommended Approach: Option 1 (Dual-Source Sync)

### Rationale
1. **Non-breaking**: Preserves existing Yandex sync functionality
2. **Flexibility**: Allows comparison and validation between sources
3. **Reliability**: Redundancy if one source has issues
4. **Observability**: Can detect when sources diverge

### Implementation Plan

#### Phase 1: Add GitHub Sync Workflow
Create `.github/workflows/github-sync.yml`:
- Fetches FPF document from https://github.com/ailev/FPF
- Downloads to `github/` directory
- Opens PR on changes (similar to Yandex sync)
- Runs on same schedule as Yandex sync (17:00 UTC daily)
- Can also trigger on GitHub webhook (optional)

#### Phase 2: Extend Diff Analysis
Update `.github/workflows/diff-eval.yml`:
- Expand `paths` to include both `yadisk/**` and `github/**`
- Tag PRs with source indicator (yadisk-sync vs github-sync)
- Use same agentic analysis for both sources

#### Phase 3: Add Cross-Source Comparison (Optional)
Create `.github/workflows/cross-source-compare.yml`:
- Runs periodically (e.g., daily)
- Compares content of `yadisk/` vs `github/`
- Reports if sources have diverged
- Opens issue if significant divergence detected

#### Phase 4: Documentation Updates
Update documentation to explain:
- Dual-source architecture
- Which source is authoritative (if defined)
- How to handle divergence
- When to use each source

### Technical Details for GitHub Sync

#### API Approach
Use GitHub API to fetch file content:
```bash
REPO="ailev/FPF"
FILE_PATH="First Principles Framework — Core Conceptual Specification (holonic).md"
API_URL="https://api.github.com/repos/$REPO/contents/$FILE_PATH"

# Fetch file metadata
FILE_INFO=$(curl -fsSL -H "Accept: application/vnd.github.v3+json" "$API_URL")

# Extract download URL and SHA
DOWNLOAD_URL=$(echo "$FILE_INFO" | jq -r '.download_url')
FILE_SHA=$(echo "$FILE_INFO" | jq -r '.sha')

# Download file
curl -fsSL -o "github/$DEST_FILENAME" "$DOWNLOAD_URL"
```

#### Git Submodule Approach (Alternative)
Could add ailev/FPF as a git submodule:
```bash
git submodule add https://github.com/ailev/FPF fpf-upstream
```
- Pro: Native git integration, tracks commits
- Con: More complex for users, requires submodule updates

#### Webhook Integration (Future Enhancement)
Configure GitHub webhook from ailev/FPF to trigger sync:
- Sync happens immediately on upstream changes
- No need to wait for scheduled run
- Requires webhook secret configuration

### Security Considerations

1. **Rate Limiting**: GitHub API has rate limits (60 req/hour unauthenticated, 5000 with token)
   - Solution: Use `GITHUB_TOKEN` for authenticated requests
   - Add exponential backoff and retry logic

2. **Input Validation**: Validate GitHub API responses
   - Verify JSON structure
   - Check file size before download
   - Validate content type

3. **Access Control**: GitHub sync doesn't require secrets (public repo)
   - More secure than Yandex which uses public share URL
   - Still validate all downloaded content

4. **Supply Chain**: Pin GitHub Actions to commit SHAs (already done)
   - Apply same security standards as existing workflows

### Monitoring and Alerting

1. **Workflow Status**: Monitor both sync workflows
   - Alert if either fails repeatedly
   - Track sync success rate

2. **Source Health**: Compare sync results
   - Alert if sources diverge significantly
   - Track which source is more up-to-date

3. **Analysis Quality**: Monitor diff analysis outputs
   - Track analysis completion rate
   - Alert on timeout or errors

## Migration Path

### Week 1: Development and Testing
- [ ] Create `github-sync.yml` workflow
- [ ] Test with `act` locally
- [ ] Verify file downloads correctly
- [ ] Ensure diff analysis triggers

### Week 2: Deployment and Validation
- [ ] Deploy GitHub sync workflow to production
- [ ] Monitor first few sync runs
- [ ] Verify PRs open correctly
- [ ] Validate diff analysis runs

### Week 3: Enhancement and Documentation
- [ ] Add cross-source comparison (if desired)
- [ ] Update README with dual-source architecture
- [ ] Document troubleshooting steps
- [ ] Create runbook for handling divergence

### Week 4: Stabilization
- [ ] Monitor both sources for stability
- [ ] Tune sync schedule if needed
- [ ] Gather feedback from users
- [ ] Plan future improvements

## Alternative Uses for This Repository

Beyond syncing, this repository can provide additional value:

### 1. FPF Change Tracking
- Maintain history of all FPF changes from both sources
- Provide git-based diff and blame functionality
- Enable time-travel to previous versions

### 2. Quality Assurance
- Automated validation of FPF document structure
- Link checking and reference validation
- Terminology consistency checks

### 3. Distribution Hub
- Generate multiple formats (PDF, EPUB, HTML)
- Create versioned releases
- Provide stable URLs for specific versions

### 4. Integration Testing
- Test tools and applications that consume FPF
- Validate against document schema
- Ensure backward compatibility

### 5. Community Hub
- Discussions about FPF changes
- Propose improvements via issues
- Collect feedback from users

## Questions to Resolve

1. **Which source is authoritative?**
   - Is Yandex or GitHub the primary source?
   - What happens if they diverge?

2. **Sync frequency?**
   - Should GitHub sync match Yandex schedule (daily)?
   - Should we use webhooks for real-time sync?

3. **Directory structure?**
   - Keep separate directories (`yadisk/`, `github/`)?
   - Or consolidate to single location with metadata?

4. **Divergence handling?**
   - Manual intervention required?
   - Automated conflict resolution?
   - Priority order (GitHub over Yandex)?

5. **Long-term strategy?**
   - Eventually deprecate one source?
   - Maintain dual sources indefinitely?
   - Transform this into a general FPF sync hub?

## Success Criteria

The integration will be successful when:
- [x] GitHub sync workflow is operational and reliable
- [x] Both sources sync without conflicts
- [x] Diff analysis works for both sources
- [x] Documentation clearly explains dual-source architecture
- [x] Team has runbook for handling divergence
- [x] Monitoring alerts on sync failures or divergence

## Next Steps

1. **Immediate**: Review this plan with stakeholders
2. **Short-term**: Implement GitHub sync workflow (Phase 1)
3. **Medium-term**: Add cross-source comparison (Phase 3)
4. **Long-term**: Evaluate additional use cases (Alternative Uses)

## References

- FPF on GitHub: https://github.com/ailev/FPF
- Current repository: https://github.com/venikman/fpf-sync
- GitHub API docs: https://docs.github.com/en/rest
- Existing audit report: [AUDIT_REPORT.md](./AUDIT_REPORT.md)
- Security improvements: [IMPROVEMENTS_SUMMARY.md](./IMPROVEMENTS_SUMMARY.md)
