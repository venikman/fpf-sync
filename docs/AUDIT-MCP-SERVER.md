# MCP Server Security Audit Report

**Audit Date:** 2025-11-06
**Auditor:** Claude (Automated Security Audit)
**Scope:** FPF MCP Server Implementation (v0.2.0)
**Files Audited:** 29 TypeScript files across server, domain, storage, and service layers

---

## Executive Summary

This audit examined the Model Context Protocol (MCP) server implementation for the First Principles Framework (FPF). The codebase consists of two server variants (stdio and SSE/HTTP), a domain model layer, JSON-based storage, and several service modules.

**Overall Assessment:** The implementation demonstrates good architectural practices with proper separation of concerns, but contains **critical security and data integrity vulnerabilities** that must be addressed before production use.

**Risk Level:** **HIGH** (5 critical issues, 8 high-priority issues, 12 medium-priority issues)

---

## Critical Issues (Severity: Critical)

### 1. Race Conditions in Storage Layer
**Location:** `scripts/mcp/storage/base.ts:32-49`
**Severity:** CRITICAL
**Risk:** Data corruption, data loss

**Description:**
The storage layer performs non-atomic read-modify-write operations without any locking mechanism:

```typescript
function upsert(item: T): Promise<T> {
  return (async () => {
    const all = await list();        // Read
    const idx = all.findIndex(...);  // Modify
    if (idx === -1) all.push(item);
    else all[idx] = item;
    await saveAll(all);               // Write (non-atomic)
    return item;
  })();
}
```

**Impact:**
- Multiple concurrent requests can corrupt JSON data files
- Lost updates when two processes read → modify → write simultaneously
- No transactional guarantees

**Recommendation:**
1. Implement file-level locking (flock or lockfile library)
2. Use atomic write operations (write to temp file, then atomic rename)
3. Consider switching to SQLite for ACID guarantees
4. The `writeFileAtomic()` function exists in `util.ts:42-53` but is NOT used in `base.ts`

**Fix Priority:** IMMEDIATE

---

### 2. Non-Atomic File Writes in Storage
**Location:** `scripts/mcp/storage/base.ts:32-34`, `scripts/mcp/store.ts:44, 61, 72`
**Severity:** CRITICAL
**Risk:** Corrupted data files

**Description:**
Storage operations use `Bun.write()` directly without atomic rename:

```typescript
function saveAll(items: T[]): Promise<void> {
  return Bun.write(filePath, JSON.stringify(items, null, 2)).then(() => {});
}
```

If the process crashes mid-write, JSON files become corrupted.

**Impact:**
- Partial writes leave corrupted JSON
- No rollback capability
- Data loss on system failure

**Recommendation:**
Replace all direct `Bun.write()` calls with the existing `writeFileAtomic()` function:

```typescript
function saveAll(items: T[]): Promise<void> {
  return writeFileAtomic(filePath, JSON.stringify(items, null, 2));
}
```

**Fix Priority:** IMMEDIATE

---

### 3. Overly Permissive CORS Configuration
**Location:** `scripts/mcp/server-sse.ts:555-559`
**Severity:** CRITICAL
**Risk:** Cross-site attacks, unauthorized access

**Description:**
The SSE server exposes all endpoints with wildcard CORS:

```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',  // Allows ANY origin
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
};
```

**Impact:**
- Any website can connect to the local MCP server
- Malicious sites can exfiltrate FPF data if user has server running
- No origin verification or authentication

**Recommendation:**
1. Restrict CORS to specific trusted origins:
   ```typescript
   'Access-Control-Allow-Origin': 'http://localhost:3000'
   ```
2. Implement token-based authentication
3. Require explicit user consent for cross-origin requests
4. Consider removing CORS entirely for local-only deployment

**Fix Priority:** IMMEDIATE (before any external deployment)

---

### 4. No Authentication or Authorization
**Location:** `scripts/mcp/server-sse.ts` (entire file)
**Severity:** CRITICAL
**Risk:** Unauthorized access and data modification

**Description:**
The SSE server has no authentication mechanism. Anyone who can reach the HTTP port can:
- Read all FPF documents and data
- Execute write operations (when `FPF_READONLY=0`)
- Modify epistemes, roles, work records, etc.

**Impact:**
- If port is exposed to network, anyone can access/modify data
- No audit trail of who performed operations
- Cannot enforce access control policies

**Recommendation:**
1. Implement API key or JWT-based authentication
2. Add per-tool authorization checks
3. Audit log all write operations with authenticated identity
4. Consider mutual TLS for production deployments

**Fix Priority:** IMMEDIATE (before network exposure)

---

### 5. Unbounded Event Log Growth
**Location:** `scripts/mcp/domain/events.ts:34-38`
**Severity:** CRITICAL
**Risk:** Disk space exhaustion, denial of service

**Description:**
Events are appended to `data/events.log` with no rotation or size limits:

```typescript
export async function appendEvent(rec: EventRecord): Promise<void> {
  const line = JSON.stringify(rec) + '\n';
  const path = join(DATA_DIR, 'events.log');
  await appendFile(path, line, { encoding: 'utf8' });
}
```

**Impact:**
- Log file can grow without bound
- Server fills disk and crashes
- No cleanup or archival mechanism

**Recommendation:**
1. Implement log rotation (daily/size-based)
2. Add maximum log size limits
3. Provide archival/compression utilities
4. Monitor disk usage and alert when threshold reached

**Fix Priority:** HIGH

---

## High-Severity Issues

### 6. Path Traversal via Symlinks
**Location:** `scripts/mcp/util.ts:73-81`
**Severity:** HIGH
**Risk:** Unauthorized file access

**Description:**
While `isAllowedFpfPath()` validates against parent directory traversal, it doesn't check for symlink attacks:

```typescript
export function isAllowedFpfPath(relPath: string): string {
  const abs = resolveWithin(repoRoot, relPath);
  const fpfAbs = getFpfDir();
  const fpfNorm = fpfAbs.endsWith(sep) ? fpfAbs : fpfAbs + sep;
  if (!(abs === fpfAbs || abs.startsWith(fpfNorm))) {
    throw new Error(`Path not allowed outside whitelisted FPF docs directory: ${relPath}`);
  }
  return abs;  // Could be a symlink pointing outside allowed dir
}
```

**Impact:**
- Attacker creates symlink in `yadisk/` pointing to `/etc/passwd`
- MCP server reads and returns sensitive files

**Recommendation:**
1. Use `fs.realpath()` to resolve symlinks before validation
2. Reject symlinks entirely: check `fs.lstat().isSymbolicLink()`
3. Add explicit test cases for symlink attacks

**Fix Priority:** HIGH

---

### 7. No Rate Limiting on SSE Server
**Location:** `scripts/mcp/server-sse.ts`
**Severity:** HIGH
**Risk:** Denial of service

**Description:**
No limits on:
- Request rate per client
- Number of concurrent SSE connections
- Size of request bodies
- Duration of operations

**Impact:**
- Resource exhaustion attacks
- Server can be overwhelmed by rapid requests
- Long-running operations block server

**Recommendation:**
1. Implement per-IP rate limiting (e.g., 100 req/min)
2. Limit concurrent SSE sessions (e.g., 10 max)
3. Add request body size limits
4. Timeout long-running tool operations (> 30s)

**Fix Priority:** HIGH

---

### 8. Silent Data Corruption Handling
**Location:** `scripts/mcp/storage/base.ts:24-28`, `scripts/mcp/store.ts:17-22`
**Severity:** HIGH
**Risk:** Undetected data corruption

**Description:**
JSON parse failures return empty array silently:

```typescript
async function list(): Promise<T[]> {
  await ensureFile(filePath);
  const raw = await readFile(filePath, 'utf8');
  try {
    const arr = JSON.parse(raw) as T[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];  // Silently returns empty on corruption!
  }
}
```

**Impact:**
- Corrupted data files appear as "no data"
- Users don't know if data was lost or never existed
- No alerting or recovery mechanism

**Recommendation:**
1. Log parse errors with file path and corruption details
2. Create backup before returning empty array
3. Throw error instead of silently recovering
4. Implement data integrity checksums

**Fix Priority:** HIGH

---

### 9. Type Safety Violations with `any`
**Location:** Multiple locations throughout codebase
**Severity:** HIGH
**Risk:** Runtime type errors

**Examples:**
- `server-sse.ts:102` - `glossary: args.glossary as any`
- `server-sse.ts:115` - `bridge = { ..., from: args.from as any }`
- Many storage functions cast complex objects to `any`

**Impact:**
- TypeScript type checking bypassed
- Invalid data structures accepted at runtime
- Difficult to track down type-related bugs

**Recommendation:**
1. Remove all `as any` casts
2. Define proper Zod schemas for complex nested types
3. Use type guards instead of casting
4. Enable strict TypeScript checks

**Fix Priority:** HIGH

---

### 10. No Input Size Limits
**Location:** `scripts/mcp/server.ts:88-92`, `scripts/mcp/server-sse.ts:365-370`
**Severity:** HIGH
**Risk:** Memory exhaustion, DoS

**Description:**
The `fpf.read_fpf_doc` tool reads entire files into memory without size checks:

```typescript
mcp.tool(
  'fpf.read_fpf_doc',
  { path: z.string() },
  async (args) => {
    const abs = isAllowedFpfPath(String(args.path));
    const text = await readFile(abs, 'utf8');  // No size limit!
    return { content: [{ type: 'text', text }] };
  },
);
```

**Impact:**
- Large files cause OOM crashes
- Attacker can DoS by requesting huge files repeatedly
- Network bandwidth exhaustion sending large responses

**Recommendation:**
1. Add maximum file size limit (e.g., 10MB)
2. Stream large files instead of loading fully into memory
3. Paginate large responses
4. Return file size in metadata before reading

**Fix Priority:** HIGH

---

### 11. Missing Session Cleanup
**Location:** `scripts/mcp/server-sse.ts:549-586`
**Severity:** HIGH
**Risk:** Memory leak

**Description:**
SSE sessions stored in Map with cleanup only on `onclose`:

```typescript
const sessions = new Map<string, SSEServerTransport>();
// ...
transport.onclose = () => {
  sessions.delete(transport.sessionId);
};
```

But no timeout for stale connections or cleanup on server shutdown.

**Impact:**
- Stale sessions accumulate if clients don't close cleanly
- Memory leak over time
- No graceful shutdown

**Recommendation:**
1. Implement session timeout (e.g., 1 hour idle)
2. Add periodic cleanup of stale sessions
3. Implement graceful shutdown handler
4. Limit total concurrent sessions

**Fix Priority:** HIGH

---

### 12. No Timestamp Validation
**Location:** Multiple tools accepting `at`, `from`, `to` parameters
**Severity:** MEDIUM-HIGH
**Risk:** Invalid data, logic errors

**Description:**
ISO timestamp strings accepted without validation:
- `fpf.role.assign` - `window.from`, `window.to`
- `fpf.work.start` - `at`
- `fpf.role.state.assert` - `at`

No checks for:
- Valid ISO 8601 format
- Reasonable date ranges (not year 9999 or 1900)
- Logical ordering (from < to)

**Impact:**
- Invalid timestamps stored in database
- Window validation logic fails with malformed dates
- Potential for logic bugs in time-based queries

**Recommendation:**
1. Add Zod schema for ISO timestamps:
   ```typescript
   const isoDate = z.string().refine(s => !isNaN(Date.parse(s)), {
     message: "Invalid ISO 8601 timestamp"
   });
   ```
2. Validate window ordering: `from < to`
3. Reject dates outside reasonable range (1970-2100)

**Fix Priority:** MEDIUM-HIGH

---

### 13. Error Information Disclosure
**Location:** `scripts/mcp/server-sse.ts:611-618`
**Severity:** MEDIUM
**Risk:** Information leakage

**Description:**
Generic error handler may leak stack traces:

```typescript
catch (err) {
  console.error('Request error:', err);
  try {
    res.writeHead(500, { ...corsHeaders, 'Content-Type': 'text/plain' });
    res.end('Internal server error');
  } catch {
    // ignore, connection may be closed
  }
}
```

While production response is generic, errors logged to console may contain sensitive paths or data.

**Impact:**
- Stack traces in logs reveal internal file structure
- Error messages could leak existence of files
- Debugging info useful to attackers

**Recommendation:**
1. Sanitize error messages before logging
2. Use structured logging with severity levels
3. Don't log full request bodies that may contain sensitive data
4. Implement separate debug vs production logging modes

**Fix Priority:** MEDIUM

---

## Medium-Severity Issues

### 14. No UUID Format Validation
**Location:** Multiple locations using `crypto.randomUUID()`
**Severity:** MEDIUM

IDs generated with `crypto.randomUUID()` are not validated when received as input. Tools accepting IDs should validate UUID format.

**Recommendation:** Add Zod validator for UUID strings:
```typescript
const uuidSchema = z.string().uuid();
```

---

### 15. Incomplete Service Implementations
**Location:** `scripts/mcp/services/nqd.ts:12-15`
**Severity:** MEDIUM

The NQD generation service is a placeholder:

```typescript
export async function nqdGenerate(input: {...}): Promise<NqdPortfolio> {
  // Placeholder: return empty portfolio with basic illumination heuristic
  const illumination = Math.max(0, Math.min(1, (input.objectives.N + input.objectives.U + input.objectives.C) / 3));
  return { portfolio: [], illumination, pins: { editions: input.S || [], PathSliceId: null } };
}
```

**Impact:** Clients may rely on this functionality and receive incorrect results.

**Recommendation:**
1. Clearly document which services are stubs vs complete
2. Return error for unimplemented features rather than fake data
3. Add `TODO` comments or feature flags

---

### 16. Duplicate Code Between Servers
**Location:** `scripts/mcp/server.ts` vs `scripts/mcp/server-sse.ts`
**Severity:** MEDIUM (maintenance burden)

Tools are duplicated between stdio and SSE servers, violating DRY principle.

**Recommendation:**
1. Extract common tool definitions to shared module
2. Import and register tools in both servers
3. Reduces maintenance burden and bug surface

---

### 17. Missing Index Validation in Guards
**Location:** `scripts/mcp/domain/guards.ts:26-37`
**Severity:** MEDIUM

The `guardSeparationOfDuties` function checks for incompatible role overlaps, but relies on correct `incompatibleRoles` array being passed. There's no validation that the array is properly constructed.

**Recommendation:** Add assertions and validation for guard inputs.

---

### 18. No Healthcheck for Dependencies
**Location:** `scripts/mcp/server-sse.ts:602-606`
**Severity:** MEDIUM

The `/health` endpoint returns `ok` without checking data directory accessibility or file system health.

**Recommendation:**
```typescript
if (req.method === 'GET' && url.pathname === '/health') {
  try {
    await readdir(DATA_DIR); // Check data dir accessible
    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', dataDir: DATA_DIR }));
  } catch (err) {
    res.writeHead(503, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'error', message: 'Data directory inaccessible' }));
  }
}
```

---

### 19. No Request Body Size Limit on SSE POST
**Location:** `scripts/mcp/server-sse.ts:589-599`
**Severity:** MEDIUM

POST requests to `/messages` don't enforce body size limits, allowing memory exhaustion.

**Recommendation:** Implement max body size (e.g., 1MB) using a stream size limiter.

---

### 20. Inconsistent Error Handling Patterns
**Location:** Throughout codebase
**Severity:** MEDIUM

Some functions throw `Error`, others throw `FpfError`, some return `undefined`:
- `server.ts:40` - `throw new Error('Not found')`
- `guards.ts:10` - `raise('RSG.NOT_ENACTABLE', ...)`
- `store.ts:49` - `return undefined`

**Recommendation:** Standardize on `FpfError` with error codes for all domain errors.

---

### 21. Missing Documentation for Error Codes
**Location:** `scripts/mcp/util/errors.ts`
**Severity:** MEDIUM

Error codes like `RSG.NOT_ENACTABLE`, `WIN.INVALID`, `ELIG.VIOLATION`, etc. are used but not documented.

**Recommendation:** Create an error code registry with descriptions and recovery actions.

---

### 22. No Graceful Degradation
**Location:** Storage layer
**Severity:** MEDIUM

If data directory is read-only or disk is full, operations fail without graceful degradation.

**Recommendation:**
1. Detect read-only filesystems and automatically enable read-only mode
2. Provide clear error messages for disk full conditions
3. Allow read operations to continue even if writes fail

---

### 23. Potential ReDoS in Regex
**Location:** `scripts/mcp/server.ts:184`, `scripts/mcp/server-sse.ts:462`
**Severity:** MEDIUM

Search functionality uses regex constructed from user input:

```typescript
const matches = (text.toLowerCase().match(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
```

While input is escaped, the construction could be optimized.

**Recommendation:** Use simple string indexOf for substring search instead of regex.

---

### 24. No Audit Logging
**Location:** All write operations
**Severity:** MEDIUM

Write operations (when `FPF_READONLY=0`) are not logged with user context for audit purposes.

**Recommendation:**
1. Log all mutations with timestamp, operation, and authenticated user
2. Store audit log separately from event log
3. Include before/after state for data changes

---

### 25. DNS Rebinding Protection Disabled
**Location:** `scripts/mcp/server-sse.ts:575-576`
**Severity:** MEDIUM

```typescript
const transport = new SSEServerTransport('/messages', res, {
  enableDnsRebindingProtection: false,  // Disabled!
});
```

**Recommendation:** Re-enable DNS rebinding protection unless there's a specific reason. Document why it's disabled.

---

## Low-Severity Issues

### 26. Missing Input Trimming
Some tool parameters don't trim whitespace, leading to inconsistent keys in storage.

### 27. No Metrics/Monitoring
No instrumentation for performance monitoring, request counts, error rates, etc.

### 28. Hardcoded Port Default
SSE server defaults to port 8080 which may conflict with other services.

### 29. No TLS Support
SSE server uses plain HTTP, not HTTPS. Credentials and data sent in cleartext.

### 30. Missing TypeScript Strict Mode
`tsconfig.json` likely doesn't have all strict checks enabled.

---

## Positive Findings

The audit also identified several **well-implemented security controls**:

✅ **Path Traversal Protection** - `resolveWithin()` properly validates paths against base directory
✅ **Input Validation** - Zod schemas used throughout for type safety
✅ **Read-Only Default** - Server defaults to read-only mode (`FPF_READONLY=1`)
✅ **Separation of Concerns** - Clean architecture with domain/storage/service layers
✅ **Custom Error Types** - `FpfError` provides structured error handling
✅ **Event Sourcing** - Append-only event log for audit trail
✅ **Business Logic Guards** - Proper validation of role windows, eligibility, SoD
✅ **ID Generation** - Readable, scoped IDs with proper namespacing

---

## Recommendations Summary

### Immediate Actions (Critical Priority)

1. **Implement file locking** in storage layer to prevent race conditions
2. **Replace `Bun.write()` with `writeFileAtomic()`** in all storage operations
3. **Restrict CORS** to specific origins or remove for local-only use
4. **Add authentication** to SSE server before any network exposure
5. **Implement event log rotation** to prevent disk exhaustion

### High Priority (Before Production)

6. **Check for symlinks** in path validation logic
7. **Add rate limiting** to SSE server
8. **Handle data corruption explicitly** instead of silently returning empty arrays
9. **Remove `as any` casts** and improve type safety
10. **Add file size limits** to prevent memory exhaustion
11. **Implement session timeout** and cleanup
12. **Validate timestamp formats** in all temporal operations

### Medium Priority (Technical Debt)

13. **Refactor duplicate code** between server implementations
14. **Document error codes** and standardize error handling
15. **Add audit logging** for all write operations
16. **Implement health checks** that verify dependencies
17. **Complete or document stub implementations**
18. **Add request body size limits**

### Long-Term Improvements

19. **Consider migrating to SQLite** for ACID guarantees and better concurrency
20. **Add TLS support** for encrypted communication
21. **Implement metrics and monitoring** instrumentation
22. **Add comprehensive integration tests** for concurrent access scenarios
23. **Create disaster recovery** procedures and backup mechanisms
24. **Document threat model** and security assumptions

---

## Testing Recommendations

### Security Tests Required

1. **Concurrency Tests**
   - Simulate 100 concurrent writes to same resource
   - Verify no data corruption or lost updates
   - Test race conditions in upsert operations

2. **Path Traversal Tests**
   - Attempt `../../../etc/passwd` access
   - Create symlinks and test access
   - Test various encoding bypasses (%2e%2e, etc.)

3. **DoS Tests**
   - Send requests at high rate (1000/sec)
   - Create thousands of concurrent SSE sessions
   - Request very large files repeatedly
   - Send malformed requests to crash parser

4. **Input Validation Tests**
   - Malformed timestamps
   - Invalid UUIDs
   - Oversized strings
   - Special characters in IDs

5. **CORS Tests**
   - Cross-origin requests from malicious sites
   - Credential inclusion
   - Origin header spoofing

---

## Compliance Considerations

### Data Protection
- No encryption at rest for sensitive data
- No encryption in transit (HTTP not HTTPS)
- No data retention/deletion policies
- No privacy controls

### Access Control
- No authentication or authorization
- No audit trail of who accessed what
- No role-based access control (RBAC)

### Operational Security
- No backup/restore procedures documented
- No disaster recovery plan
- No monitoring or alerting
- No incident response procedures

---

## Conclusion

The FPF MCP Server demonstrates solid architectural design but requires significant security hardening before production deployment. The critical issues around data integrity and authentication must be addressed immediately.

**Recommended Next Steps:**

1. Address all 5 critical issues immediately
2. Implement comprehensive security tests
3. Add authentication and TLS before network exposure
4. Document security model and threat assumptions
5. Conduct external security review before production deployment

**Overall Risk Assessment:** The current implementation is **suitable for local development only** with trusted users. It is **NOT production-ready** without addressing critical security issues.

---

## Appendix: File-by-File Risk Summary

| File | Risk Level | Primary Concerns |
|------|-----------|------------------|
| `server-sse.ts` | CRITICAL | No auth, permissive CORS, no rate limiting |
| `storage/base.ts` | CRITICAL | Race conditions, non-atomic writes |
| `store.ts` | CRITICAL | Non-atomic writes, silent corruption |
| `domain/events.ts` | CRITICAL | Unbounded log growth |
| `util.ts` | HIGH | Symlink attacks possible |
| `server.ts` | MEDIUM | Input validation, file size limits |
| `domain/guards.ts` | MEDIUM | Business logic validation |
| `services/*.ts` | MEDIUM | Incomplete implementations |
| `domain/types.ts` | LOW | Type definitions (well-structured) |
| `util/errors.ts` | LOW | Error handling (good pattern) |

---

**End of Audit Report**
