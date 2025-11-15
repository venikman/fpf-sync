# Security and Quality Audit Report

**Date**: 2025-11-15  
**Scope**: GitHub Actions workflows for Yandex Disk sync and diff evaluation  
**Files Audited**:
- `.github/workflows/yadisk-sync.yml`
- `.github/workflows/diff-eval.yml`
- `scripts/kat-dev.ts`

## Executive Summary

This audit identifies security vulnerabilities, reliability issues, and best practice violations in the sync automation workflows. The findings are categorized by severity and include specific recommendations for remediation.

## Critical Findings

### 1. Unpinned Third-Party Actions (HIGH SEVERITY)

**Location**: Both workflow files  
**Issue**: Actions are referenced by tag (`@v4`, `@v6`, `@v7`) instead of commit SHA  
**Risk**: Supply chain attacks, unexpected breaking changes  
**Impact**: Malicious code could be injected via compromised action releases

**Current**:
```yaml
uses: actions/checkout@v4
uses: peter-evans/create-pull-request@v6
```

**Recommendation**: Pin to specific commit SHAs with comments showing version
```yaml
uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
uses: peter-evans/create-pull-request@5e914681df9dc83aa4e4905692ca88beb2f9e91f # v7.0.5
```

### 2. Insufficient Input Validation (MEDIUM SEVERITY)

**Location**: `yadisk-sync.yml` lines 33-61  
**Issue**: Environment variables used directly in shell commands without validation  
**Risk**: Command injection if variables are controlled by attacker  
**Impact**: Arbitrary code execution in workflow environment

**Current**:
```bash
curl -fsSL -o "$DEST_PATH/$DEST_FILENAME" "$HREF"
```

**Recommendation**: Add input validation
```bash
# Validate environment variables
if [[ ! "$TARGET_NAME" =~ ^[a-zA-Z0-9\ \(\)—\-\.]+$ ]]; then
  echo "::error::Invalid TARGET_NAME format"
  exit 1
fi
```

### 3. Missing Error Recovery (MEDIUM SEVERITY)

**Location**: `yadisk-sync.yml` lines 39-61  
**Issue**: No retry logic for network operations  
**Risk**: Transient failures cause workflow failures  
**Impact**: Unnecessary workflow re-runs, delayed syncs

**Recommendation**: Implement retry logic for curl operations
```bash
retry_curl() {
  local max_attempts=3
  local timeout=2
  local attempt=1
  
  while [ $attempt -le $max_attempts ]; do
    if "$@"; then
      return 0
    fi
    echo "::warning::Attempt $attempt failed, retrying..."
    sleep $timeout
    attempt=$((attempt + 1))
    timeout=$((timeout * 2))
  done
  
  echo "::error::All retry attempts failed"
  return 1
}
```

## High Severity Findings

### 4. Secrets in Environment Variables (HIGH SEVERITY)

**Location**: `diff-eval.yml` lines 19-27  
**Issue**: Multiple secrets exposed as environment variables to all steps  
**Risk**: Secrets could leak through logs or error messages  
**Impact**: Credential exposure, unauthorized access

**Recommendation**: Limit secret exposure to specific steps that need them
```yaml
steps:
  - name: Run analysis
    env:
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    run: |
      # Only this step has access to the secret
```

### 5. Unbounded API Response Handling (MEDIUM SEVERITY)

**Location**: `yadisk-sync.yml` line 40  
**Issue**: API response limited to 1000 items but not validated  
**Risk**: Incomplete sync if directory exceeds limit  
**Impact**: Missing files, stale data

**Recommendation**: Add pagination or validate response completeness
```bash
TOTAL_COUNT=$(echo "$LIST_JSON" | jq -r '._embedded.total // 0')
if [ "$TOTAL_COUNT" -gt 1000 ]; then
  echo "::warning::Directory has $TOTAL_COUNT items, only 1000 fetched"
fi
```

### 6. Command Injection Risk in PR Body (MEDIUM SEVERITY)

**Location**: `yadisk-sync.yml` lines 69-73  
**Issue**: Environment variables interpolated in PR body without sanitization  
**Risk**: Malicious content in PUBLIC_URL could inject commands  
**Impact**: XSS or other injection attacks in PR comments

**Recommendation**: Use quotes and validate URLs
```yaml
body: |
  Automated sync from Yandex Disk public share.
  Source: `${{ env.PUBLIC_URL }}`
```

## Medium Severity Findings

### 7. Missing Timeout for External Commands (MEDIUM SEVERITY)

**Location**: `diff-eval.yml` lines 143, 152  
**Issue**: No timeout for agent execution  
**Risk**: Workflow hangs indefinitely  
**Impact**: Wasted CI minutes, delayed results

**Recommendation**: Add timeout with timeout command
```bash
timeout 300 bun scripts/kat-dev.ts dev --agent "fpf-diff-evaluator" \
  --model "$MODEL" --input-file prompt.txt > agent_output.txt
```

### 8. Insecure Temporary File Handling (LOW SEVERITY)

**Location**: `diff-eval.yml` lines 102, 119, 143  
**Issue**: Temporary files created in workspace without cleanup  
**Risk**: Information disclosure, disk space issues  
**Impact**: Sensitive diff data persists in workspace

**Recommendation**: Use mktemp and trap for cleanup
```bash
trap 'rm -f /tmp/diff-$$.txt /tmp/prompt-$$.txt' EXIT
DIFF_FILE=$(mktemp /tmp/diff-$$.txt)
```

### 9. Brittle Sed/Grep Parsing (MEDIUM SEVERITY)

**Location**: `diff-eval.yml` lines 119-120  
**Issue**: Complex sed command may fail on edge cases  
**Risk**: Incorrect prompt generation  
**Impact**: Failed or incorrect analysis

**Recommendation**: Use more robust YAML parsing
```bash
# Extract frontmatter and content separately
yq eval '.prompt' .github/agents/fpf-diff-evaluator.md > prompt.txt
```

### 10. Missing Security Headers (LOW SEVERITY)

**Location**: `yadisk-sync.yml` lines 55, 59  
**Issue**: curl requests don't set User-Agent  
**Risk**: API may block requests, harder to trace issues  
**Impact**: Potential API blocks, poor observability

**Recommendation**: Add User-Agent header
```bash
curl -fsSL -A "fpf-sync-bot/1.0" ...
```

## Low Severity Findings

### 11. Insufficient Logging (LOW SEVERITY)

**Location**: All workflow files  
**Issue**: Missing contextual information in logs  
**Risk**: Difficult debugging  
**Impact**: Longer incident resolution time

**Recommendation**: Add structured logging
```bash
echo "::notice title=API Call::Fetching from ${API_BASE} (key: ${PUBLIC_KEY_ENCODED:0:20}...)"
```

### 12. No Checksum Verification (MEDIUM SEVERITY)

**Location**: `yadisk-sync.yml` line 59  
**Issue**: Downloaded file not verified for integrity  
**Risk**: Corrupted or tampered file goes undetected  
**Impact**: Corrupt data synced to repository

**Recommendation**: Verify file integrity if API provides checksums
```bash
if [ -n "$EXPECTED_MD5" ]; then
  ACTUAL_MD5=$(md5sum "$DEST_PATH/$DEST_FILENAME" | cut -d' ' -f1)
  if [ "$ACTUAL_MD5" != "$EXPECTED_MD5" ]; then
    echo "::error::Checksum mismatch"
    exit 1
  fi
fi
```

### 13. Missing Rate Limiting (LOW SEVERITY)

**Location**: `yadisk-sync.yml`  
**Issue**: No rate limiting for API calls  
**Risk**: API rate limit violations  
**Impact**: Temporary API blocks, failed syncs

**Recommendation**: Add exponential backoff and rate limiting
```bash
sleep 1  # Minimum delay between API calls
```

## Best Practice Recommendations

### 14. Improve TypeScript Type Safety

**Location**: `scripts/kat-dev.ts`  
**Current**: Uses `any` types in several places  
**Recommendation**: Define proper interfaces
```typescript
interface APIResponse {
  output?: Array<{ content: Array<{ text: string }> }>;
  choices?: Array<{ message: { content: string } }>;
  output_text?: string;
}
```

### 15. Add Workflow Concurrency Groups

**Location**: `diff-eval.yml`  
**Issue**: Missing concurrency control  
**Recommendation**: Add concurrency group to prevent duplicate runs
```yaml
concurrency:
  group: diff-eval-${{ github.event.pull_request.number }}
  cancel-in-progress: true
```

### 16. Improve Error Messages

**Location**: Throughout workflows  
**Issue**: Generic error messages  
**Recommendation**: Add contextual error messages with troubleshooting hints
```bash
echo "::error title=Download Failed::Failed to download file from Yandex Disk. Check PUBLIC_URL and network connectivity."
```

### 17. Add Workflow Status Badges

**Location**: `README.md`  
**Recommendation**: Add badges for workflow status visibility
```markdown
[![Sync Status](https://github.com/venikman/fpf-sync/actions/workflows/yadisk-sync.yml/badge.svg)](https://github.com/venikman/fpf-sync/actions/workflows/yadisk-sync.yml)
```

### 18. Version Lock File Handling

**Location**: Project root  
**Issue**: No dependency version locking for scripts  
**Recommendation**: Add package.json with locked dependencies
```json
{
  "name": "fpf-sync-scripts",
  "version": "1.0.0",
  "dependencies": {
    "effect": "^3.0.0"
  }
}
```

## Summary of Recommendations

### Must Fix (Critical/High Severity)
1. ✅ Pin all third-party actions to commit SHAs
2. ✅ Add input validation for environment variables
3. ✅ Limit secret exposure scope
4. ✅ Add retry logic for network operations

### Should Fix (Medium Severity)
5. ⚠️ Add timeout handling for external commands
6. ⚠️ Implement proper error recovery
7. ⚠️ Add checksum verification
8. ⚠️ Fix brittle text parsing
9. ⚠️ Add concurrency control to diff-eval

### Nice to Have (Low Severity)
10. 💡 Improve logging and observability
11. 💡 Add User-Agent headers
12. 💡 Improve TypeScript type safety
13. 💡 Add workflow status badges

## Implementation Priority

**Phase 1 (Immediate)**: Security fixes (#1, #2, #3)  
**Phase 2 (This Sprint)**: Reliability improvements (#4, #5, #6)  
**Phase 3 (Next Sprint)**: Polish and observability (#7-#13)

## Testing Recommendations

1. Test workflow with invalid/malicious inputs
2. Test network failure scenarios (mock API failures)
3. Test with rate-limited API responses
4. Verify action pinning doesn't break functionality
5. Test local execution with `act` tool

## Compliance Notes

- ✅ Workflows use least-privilege permissions
- ✅ No hardcoded secrets found
- ⚠️ Third-party actions need security review
- ⚠️ Consider adding CODEOWNERS for workflow changes

## References

- [GitHub Actions Security Hardening](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions)
- [OpenSSF Best Practices](https://github.com/ossf/scorecard)
- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)
