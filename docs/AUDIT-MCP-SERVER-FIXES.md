# MCP Server Security Fixes Applied

**Date:** 2025-11-06
**Related Audit:** docs/AUDIT-MCP-SERVER.md

This document summarizes the security improvements and fixes applied to the FPF MCP server implementation following the security audit.

---

## Critical Issues Fixed

### 1. ✅ Non-Atomic File Writes → Atomic Writes with Temp Files

**Issue:** Storage operations used `Bun.write()` directly without atomic rename, risking data corruption on crashes.

**Fix Applied:**
- Replaced all `Bun.write()` calls with existing `writeFileAtomic()` function
- Atomic writes now use temp file + atomic rename pattern
- Files affected:
  - `scripts/mcp/storage/base.ts` (2 locations)
  - `scripts/mcp/store.ts` (4 locations)

**Impact:** Prevents data file corruption from partial writes during crashes.

---

### 2. ✅ Silent Error Handling → Logged Errors

**Issue:** JSON parse failures silently returned empty arrays without logging.

**Fix Applied:**
- Added `console.error()` logging for all parse failures
- Logs include file path and error details
- Files affected:
  - `scripts/mcp/storage/base.ts` - `list()` function
  - `scripts/mcp/store.ts` - `listEpistemes()` function

**Impact:** Administrators can now detect and diagnose data corruption issues.

---

### 3. ✅ Path Traversal via Symlinks → Symlink Detection & Validation

**Issue:** `isAllowedFpfPath()` didn't check for symlinks that could point outside allowed directories.

**Fix Applied:**
- Added symlink detection using `lstat()`
- Resolves symlinks with `realpath()` and validates target is within allowed directory
- Rejects symlinks pointing outside whitelist
- File affected: `scripts/mcp/util.ts` - `isAllowedFpfPath()` function
- Updated all 12 call sites to use `await` (now async function)

**Impact:** Prevents symlink-based attacks to read arbitrary files outside allowed directories.

---

### 4. ✅ Overly Permissive CORS → Configurable, Restrictive Default

**Issue:** CORS wildcard (`Access-Control-Allow-Origin: *`) allowed any website to access local server.

**Fix Applied:**
- Changed default to `http://localhost:3000` (restrictive)
- Added `FPF_CORS_ORIGIN` environment variable for configuration
- Logs the allowed origin on startup
- Set to `'*'` only when explicitly needed
- File affected: `scripts/mcp/server-sse.ts` - main() function

**Impact:** Prevents malicious websites from accessing local MCP server data by default.

---

## High-Priority Issues Fixed

### 5. ✅ No Input Size Limits → File Size Validation (10MB Max)

**Issue:** Tools read entire files into memory without size checks, enabling DoS via large files.

**Fix Applied:**
- Added `MAX_FILE_SIZE` constant (10MB default)
- Integrated size checking into `isAllowedFpfPath()`
- Checks file size before reading via `stat()`/`lstat()`
- Returns clear error message with file size and limit
- File affected: `scripts/mcp/util.ts`

**Impact:** Prevents memory exhaustion from reading very large files.

---

### 6. ✅ Missing Session Cleanup → Timeout & Periodic Cleanup

**Issue:** SSE sessions accumulated without timeout or cleanup, causing memory leaks.

**Fix Applied:**
- Added `sessionActivity` Map to track last activity timestamp
- Implemented 1-hour session timeout (`SESSION_TIMEOUT_MS`)
- Added periodic cleanup every 5 minutes via `setInterval()`
- Added max concurrent sessions limit (100)
- Updates activity timestamp on every POST request
- File affected: `scripts/mcp/server-sse.ts`

**Impact:** Prevents memory leaks from stale sessions and limits resource usage.

---

### 7. ✅ No Timestamp Validation → Validation Functions

**Issue:** ISO timestamp strings accepted without validation, allowing invalid dates.

**Fix Applied:**
- Added `validateTimestamp()` function - checks:
  - Non-empty string
  - Valid ISO 8601 format
  - Reasonable year range (1970-2100)
- Added `validateWindow()` function - validates time ranges (from < to)
- File affected: `scripts/mcp/util.ts`

**Impact:** Prevents invalid timestamps from being stored, improving data integrity.

**Note:** Functions are available but not yet integrated into all tool handlers. Future PR should add validation to:
- `fpf.role.assign` - window.from, window.to
- `fpf.work.start` - at parameter
- `fpf.role.state.assert` - at parameter
- `fpf.service.evaluate` - window.from, window.to

---

## Issues Remaining (Not Fixed in This PR)

### Critical - Still Requires Attention

1. **Race Conditions in Storage Layer**
   - Status: NOT FIXED
   - Reason: Requires file locking library or migration to SQLite
   - Recommendation: Add `lockfile` library or switch to SQLite for production

2. **No Authentication**
   - Status: NOT FIXED
   - Reason: Major architectural change, requires design decisions
   - Recommendation: Implement before any network exposure

3. **Unbounded Event Log Growth**
   - Status: NOT FIXED
   - Reason: Requires log rotation system design
   - Recommendation: Implement logrotate-style system or size limits

### High Priority - Still Requires Attention

4. **Type Safety (`as any` casts)**
   - Status: PARTIALLY ADDRESSED (removed from fixed code)
   - Remaining: Many `as any` casts still exist in server-sse.ts tools
   - Recommendation: Define proper Zod schemas for complex nested types

5. **No Rate Limiting**
   - Status: NOT FIXED
   - Reason: Requires middleware or rate limit library
   - Recommendation: Add per-IP rate limiting before network exposure

---

## Code Quality Improvements

### Improved Error Handling
- Storage layer now logs all parse errors with context
- Better error messages for security checks
- Clear rejection messages for oversized files and invalid paths

### Better Security Defaults
- CORS restricted by default
- File size limits enforced
- Session limits enforced
- Symlink attacks prevented

### Configuration via Environment Variables
- `FPF_READONLY` - enable/disable writes (existing)
- `FPF_DATA_DIR` - data directory location (existing)
- `FPF_DOCS_DIR` - documents directory (existing)
- `FPF_CORS_ORIGIN` - CORS allowed origin (NEW)

---

## Testing Recommendations

Before deploying these changes, test:

1. **Atomic Writes**
   - Kill server mid-write, verify data integrity
   - Concurrent write operations

2. **Symlink Protection**
   - Create symlink in yadisk/ pointing to /etc/passwd
   - Attempt to read via `fpf.read_fpf_doc`
   - Should reject with clear error

3. **File Size Limits**
   - Create 15MB file in yadisk/
   - Attempt to read via tool
   - Should reject with size error

4. **Session Timeout**
   - Create SSE session
   - Wait 61 minutes without activity
   - Session should be cleaned up

5. **CORS Configuration**
   - Test with default (should restrict to localhost:3000)
   - Test with `FPF_CORS_ORIGIN='*'`
   - Test with specific origin

---

## Migration Notes

### Breaking Changes

1. **`isAllowedFpfPath()` is now async**
   - All call sites updated to use `await`
   - If you have custom code calling this function, add `await`

2. **CORS default changed**
   - Old: `Access-Control-Allow-Origin: *`
   - New: `Access-Control-Allow-Origin: http://localhost:3000`
   - To restore old behavior: `export FPF_CORS_ORIGIN='*'`

### Non-Breaking Changes

- Storage functions now log errors (was silent)
- File size checks apply to all document reads
- Session cleanup runs automatically (transparent)

---

## Files Modified

| File | Lines Changed | Description |
|------|--------------|-------------|
| `scripts/mcp/util.ts` | +70 | Added symlink checks, file size limits, timestamp validation |
| `scripts/mcp/storage/base.ts` | +15 | Atomic writes, error logging |
| `scripts/mcp/store.ts` | +15 | Atomic writes, error logging |
| `scripts/mcp/server.ts` | +6 | Added `await` for async path validation |
| `scripts/mcp/server-sse.ts` | +35 | CORS config, session timeout, limits |

**Total:** ~140 lines added/modified across 5 files

---

## Performance Impact

- **Minimal overhead:** File size checks add one `lstat()` call per file read
- **Symlink checks:** Only performed when file exists, minimal impact
- **Session cleanup:** Runs every 5 minutes, processes only active sessions
- **Atomic writes:** Slightly slower due to temp file + rename, but safer

---

## Security Posture Improvement

| Category | Before | After |
|----------|--------|-------|
| Data integrity | ⚠️ At risk | ✅ Protected |
| Path traversal | ⚠️ Symlink attacks possible | ✅ Prevented |
| CORS | ❌ Wide open | ✅ Restricted by default |
| DoS (large files) | ❌ No limits | ✅ 10MB limit |
| Session leaks | ⚠️ Accumulate | ✅ Auto-cleanup |
| Error visibility | ❌ Silent failures | ✅ Logged |

**Overall Risk Level:** HIGH → MEDIUM

*Note: Still not production-ready without addressing authentication and race conditions.*

---

## Next Steps

### Immediate (Before Any Network Deployment)

1. Add authentication (API keys or JWT)
2. Implement rate limiting
3. Add file locking or migrate to SQLite

### Short Term

4. Integrate timestamp validation into all temporal tools
5. Remove remaining `as any` casts
6. Add comprehensive integration tests
7. Implement event log rotation

### Long Term

8. Add TLS support
9. Implement audit logging with user context
10. Add metrics and monitoring
11. Create disaster recovery procedures

---

## Acknowledgments

These fixes address issues identified in the comprehensive security audit documented in `docs/AUDIT-MCP-SERVER.md`.

The improvements focus on "easy wins" that provide significant security benefits without requiring major architectural changes.

---

**End of Fixes Document**
