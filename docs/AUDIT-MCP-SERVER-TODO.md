# MCP Server - Remaining Security Issues

**Status:** 7/25 issues fixed, 18 remaining
**Current Risk Level:** MEDIUM (was HIGH)
**Target Risk Level:** LOW (production-ready)

This document tracks remaining security issues from the audit that still need to be addressed.

---

## 🔴 CRITICAL Priority (Before Network Deployment)

### 1. Race Conditions in Storage Layer
**Status:** ❌ NOT FIXED
**Severity:** CRITICAL
**Risk:** Data corruption, lost updates
**Location:** `scripts/mcp/storage/base.ts`

**Problem:**
```typescript
async function upsert(item: T): Promise<T> {
  const all = await list();        // ← Thread 1 reads
  const idx = all.findIndex(...);  // ← Thread 2 reads (same data)
  if (idx === -1) all.push(item);  // ← Thread 1 writes
  else all[idx] = item;            // ← Thread 2 writes (overwrites Thread 1!)
  await saveAll(all);
  return item;
}
```

**Why Not Fixed:** Requires architectural decision - file locking vs SQLite migration

**Options:**
1. **Add file locking** (quick fix)
   ```bash
   bun add lockfile
   ```
   ```typescript
   import { lock, unlock } from 'lockfile';

   async function upsert(item: T): Promise<T> {
     const lockPath = filePath + '.lock';
     await lock(lockPath);
     try {
       const all = await list();
       // ... modify ...
       await saveAll(all);
       return item;
     } finally {
       await unlock(lockPath);
     }
   }
   ```

2. **Migrate to SQLite** (proper fix)
   ```bash
   bun add better-sqlite3
   ```
   - ACID guarantees
   - Better concurrency
   - Query capabilities
   - More complex migration

**Recommendation:** Start with option 1 (file locking) for quick safety, plan option 2 for v1.0

**Effort:** 2-4 hours (file locking) or 1-2 days (SQLite)

---

### 2. No Authentication or Authorization
**Status:** ❌ NOT FIXED
**Severity:** CRITICAL
**Risk:** Unauthorized access, data modification
**Location:** `scripts/mcp/server-sse.ts`

**Problem:**
- SSE server has no authentication
- Anyone with network access can read/write data
- No audit trail of who did what

**Solution Options:**

**Option A: API Key (Simple)**
```typescript
const API_KEY = process.env.FPF_API_KEY || crypto.randomUUID();
console.log(`API Key: ${API_KEY}`);

// In request handler:
const authHeader = req.headers.authorization;
if (authHeader !== `Bearer ${API_KEY}`) {
  res.writeHead(401, { 'Content-Type': 'text/plain' });
  res.end('Unauthorized');
  return;
}
```

**Option B: JWT (Better)**
```bash
bun add jsonwebtoken
```
```typescript
import jwt from 'jsonwebtoken';

const SECRET = process.env.FPF_JWT_SECRET || generateSecret();
// Issue tokens, verify on each request
```

**Option C: Mutual TLS (Production)**
- Client certificates
- Strongest security
- More complex setup

**Recommendation:** Start with API key, upgrade to JWT for multi-user

**Effort:**
- API key: 2-3 hours
- JWT: 4-6 hours
- mTLS: 1-2 days

---

### 3. Unbounded Event Log Growth
**Status:** ❌ NOT FIXED
**Severity:** CRITICAL
**Risk:** Disk exhaustion, server crash
**Location:** `scripts/mcp/domain/events.ts`

**Problem:**
```typescript
export async function appendEvent(rec: EventRecord): Promise<void> {
  const line = JSON.stringify(rec) + '\n';
  await appendFile(path, line); // ← Grows forever
}
```

**Solution:** Log rotation

```typescript
import { stat } from 'node:fs/promises';

const MAX_LOG_SIZE = 100 * 1024 * 1024; // 100MB

export async function appendEvent(rec: EventRecord): Promise<void> {
  const logPath = join(DATA_DIR, 'events.log');

  // Check size before append
  try {
    const stats = await stat(logPath);
    if (stats.size > MAX_LOG_SIZE) {
      // Rotate: events.log → events.log.1, events.log.1 → events.log.2, etc.
      await rotateLog(logPath);
    }
  } catch {
    // File doesn't exist yet
  }

  const line = JSON.stringify(rec) + '\n';
  await appendFile(logPath, line);
}

async function rotateLog(path: string) {
  const maxRotations = 5;
  // Shift logs: .4 → .5, .3 → .4, .2 → .3, .1 → .2, current → .1
  for (let i = maxRotations - 1; i >= 1; i--) {
    const from = `${path}.${i}`;
    const to = `${path}.${i + 1}`;
    try {
      await rename(from, to);
    } catch {
      // File doesn't exist, continue
    }
  }
  await rename(path, `${path}.1`);
}
```

**Recommendation:** Implement size-based rotation with 5 generations

**Effort:** 3-4 hours

---

## 🟠 HIGH Priority (Before Production)

### 4. Type Safety Violations (`as any`)
**Status:** ⚠️ PARTIALLY FIXED
**Severity:** HIGH
**Risk:** Runtime type errors
**Location:** `scripts/mcp/server-sse.ts` (30+ instances)

**Problem:**
```typescript
const ctx: Context = {
  ...,
  glossary: args.glossary as any,  // ← Bypasses type checking
  invariants: args.invariants as any
};
```

**Solution:** Define proper Zod schemas

```typescript
import { z } from 'zod';

const ContextSchema = z.object({
  name: z.string(),
  edition: z.string(),
  glossary: z.record(z.string()).optional(),
  invariants: z.array(z.string()).optional(),
  roles: z.array(z.string()).optional(),
});

// In tool handler:
mcp.tool('fpf.context.upsert', ContextSchema, async (args) => {
  // args is now fully validated, no 'as any' needed
  const ctx: Context = {
    id: makeCtxId(args.name, args.edition),
    ...args,
    createdAt: now,
    updatedAt: now,
  };
});
```

**Recommendation:** Create Zod schemas for all complex types (Context, Role, Bridge, etc.)

**Effort:** 6-8 hours (30+ locations)

---

### 5. No Rate Limiting
**Status:** ❌ NOT FIXED
**Severity:** HIGH
**Risk:** Denial of service, resource exhaustion
**Location:** `scripts/mcp/server-sse.ts`

**Problem:**
- No limits on request rate per client
- Can overwhelm server with rapid requests

**Solution:** Simple in-memory rate limiter

```typescript
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 100; // requests per minute
const WINDOW_MS = 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const limit = rateLimits.get(ip);

  if (!limit || now > limit.resetAt) {
    rateLimits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  if (limit.count >= RATE_LIMIT) {
    return false; // Rate limited
  }

  limit.count++;
  return true;
}

// In request handler:
const ip = req.socket.remoteAddress || 'unknown';
if (!checkRateLimit(ip)) {
  res.writeHead(429, { 'Content-Type': 'text/plain' });
  res.end('Rate limit exceeded');
  return;
}
```

**Recommendation:** Implement per-IP rate limiting with configurable limits

**Effort:** 2-3 hours

---

### 6. No Request Body Size Limits
**Status:** ❌ NOT FIXED
**Severity:** HIGH
**Risk:** Memory exhaustion
**Location:** `scripts/mcp/server-sse.ts` POST handler

**Problem:**
```typescript
if (req.method === 'POST' && url.pathname === '/messages') {
  // handlePostMessage reads entire body into memory, no size limit
  await transport.handlePostMessage(req, res);
}
```

**Solution:** Add size limit check

```typescript
const MAX_BODY_SIZE = 1 * 1024 * 1024; // 1MB

function limitBodySize(req: IncomingMessage, maxSize: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxSize) {
        req.destroy();
        reject(new Error(`Body too large (max ${maxSize} bytes)`));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Use in handler:
const body = await limitBodySize(req, MAX_BODY_SIZE);
```

**Recommendation:** Add 1MB limit for POST bodies

**Effort:** 1-2 hours

---

### 7. DNS Rebinding Protection Disabled
**Status:** ❌ NOT FIXED
**Severity:** MEDIUM-HIGH
**Risk:** DNS rebinding attacks
**Location:** `scripts/mcp/server-sse.ts:608`

**Problem:**
```typescript
const transport = new SSEServerTransport('/messages', res, {
  enableDnsRebindingProtection: false,  // ← Disabled for convenience
});
```

**Solution:** Re-enable or add Host header check

```typescript
// Option 1: Re-enable (may break some clients)
enableDnsRebindingProtection: true

// Option 2: Manual Host header validation
const host = req.headers.host;
const allowedHosts = ['localhost', '127.0.0.1', '0.0.0.0'];
if (!allowedHosts.some(h => host?.startsWith(h))) {
  res.writeHead(400, { 'Content-Type': 'text/plain' });
  res.end('Invalid Host header');
  return;
}
```

**Recommendation:** Re-enable protection or add manual Host validation

**Effort:** 1 hour

---

### 8. Integrate Timestamp Validation
**Status:** ⚠️ PARTIALLY DONE (functions exist, not used)
**Severity:** MEDIUM
**Risk:** Invalid data in database
**Location:** Multiple tool handlers in `server-sse.ts`

**Problem:**
- `validateTimestamp()` and `validateWindow()` functions created but not integrated
- Tools still accept invalid timestamps

**Solution:** Add validation to tool handlers

```typescript
mcp.tool('fpf.role.assign',
  { holder: z.enum(['system','episteme']), role: z.string(), ctx: z.string(),
    window: z.object({ from: z.string(), to: z.string() }) },
  async (args) => {
    ensureWritable();
    validateWindow(args.window.from, args.window.to, 'window'); // ← Add this
    // ... rest of handler
  }
);
```

**Locations to update:**
- `fpf.role.assign` - window.from, window.to
- `fpf.work.start` - at parameter
- `fpf.role.state.assert` - at parameter
- `fpf.service.evaluate` - window.from, window.to
- Any other tools accepting timestamps

**Recommendation:** Add validation to all 4-5 tools accepting timestamps

**Effort:** 1-2 hours

---

## 🟡 MEDIUM Priority (Technical Debt)

### 9. Duplicate Code Between Servers
**Status:** ❌ NOT FIXED
**Effort:** 4-6 hours

Tools are duplicated between `server.ts` (stdio) and `server-sse.ts` (HTTP).

**Solution:** Extract to shared module

```typescript
// scripts/mcp/tools/epistemes.ts
export function registerEpistemeTools(mcp: McpServer) {
  mcp.tool('fpf.list_epistemes', {}, async () => { ... });
  mcp.tool('fpf.get_episteme', { id: z.string() }, async (args) => { ... });
  // ... all other tools
}

// In server.ts:
import { registerEpistemeTools } from './tools/epistemes.ts';
registerEpistemeTools(mcp);

// In server-sse.ts:
import { registerEpistemeTools } from './tools/epistemes.ts';
registerEpistemeTools(mcp);
```

---

### 10. No Healthcheck for Dependencies
**Status:** ❌ NOT FIXED
**Effort:** 1 hour

Current `/health` endpoint returns "ok" without checking data directory.

**Solution:**
```typescript
if (req.method === 'GET' && url.pathname === '/health') {
  try {
    await readdir(DATA_DIR); // Check data dir accessible
    const eps = await listEpistemes(); // Check can read data
    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      dataDir: DATA_DIR,
      epistemeCount: eps.length,
      sessions: sessions.size
    }));
  } catch (err) {
    res.writeHead(503, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'error', message: String(err) }));
  }
}
```

---

### 11. Incomplete Service Implementations
**Status:** ❌ NOT FIXED
**Effort:** Variable (depends on requirements)

Several services return placeholder/stub data:
- `scripts/mcp/services/nqd.ts` - Returns empty portfolio
- `scripts/mcp/services/parity.ts` - Partial implementation
- `scripts/mcp/services/gamma.ts` - Basic aggregation only

**Recommendation:** Either implement fully or clearly mark as experimental with warnings

---

### 12. No Backup/Restore Utilities
**Status:** ❌ NOT FIXED
**Effort:** 2-3 hours

**Solution:** Add backup tool

```bash
#!/usr/bin/env bun
# scripts/backup.ts

import { readdir, copyFile } from 'node:fs/promises';
import { join } from 'node:path';

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = join(DATA_DIR, 'backups', timestamp);

await ensureDir(backupDir);
const files = await readdir(DATA_DIR);
for (const file of files) {
  if (file.endsWith('.json') || file.endsWith('.log')) {
    await copyFile(join(DATA_DIR, file), join(backupDir, file));
  }
}
console.log(`Backup created: ${backupDir}`);
```

---

## 🟢 LOW Priority (Nice to Have)

### 13. Add TLS Support
**Effort:** 2-3 hours

For encrypted communication when SSE server exposed to network.

---

### 14. Add Metrics/Monitoring
**Effort:** 4-6 hours

Instrument server with request counts, error rates, latency, etc.

---

### 15. Improve Error Messages
**Effort:** 2-3 hours

Make error messages more user-friendly and actionable.

---

### 16. Add Comprehensive Tests
**Effort:** 1-2 days

Integration tests for:
- Concurrent writes
- Path traversal attempts
- Rate limiting
- Session timeout
- File size limits

---

## Effort Summary

| Priority | Issues | Total Effort |
|----------|--------|-------------|
| CRITICAL | 3 | 1-3 days |
| HIGH | 5 | 1-2 days |
| MEDIUM | 4 | 1-2 days |
| LOW | 4 | 2-3 days |
| **TOTAL** | **16** | **5-10 days** |

---

## Recommended Roadmap

### Phase 1: Network-Ready (1-2 days)
Minimum for deploying on local network:
1. ✅ Add file locking to storage
2. ✅ Add API key authentication
3. ✅ Add rate limiting
4. ✅ Add log rotation

**Outcome:** Safe for trusted network deployment

---

### Phase 2: Production-Ready (3-5 days)
1. ✅ Migrate to SQLite (proper concurrency)
2. ✅ Upgrade to JWT auth
3. ✅ Fix all `as any` casts
4. ✅ Add request body size limits
5. ✅ Integrate timestamp validation
6. ✅ Add comprehensive tests

**Outcome:** Can deploy to internet with authentication

---

### Phase 3: Polish (2-3 days)
1. ✅ Refactor duplicate code
2. ✅ Improve healthchecks
3. ✅ Add monitoring/metrics
4. ✅ Add TLS support
5. ✅ Complete stub implementations
6. ✅ Add backup utilities

**Outcome:** Production-grade service

---

## Quick Wins (Do First)

These give maximum security benefit for minimal effort:

1. **Log rotation** (3-4 hours) - Prevents disk exhaustion
2. **API key auth** (2-3 hours) - Blocks unauthorized access
3. **Rate limiting** (2-3 hours) - Prevents DoS
4. **Request body limits** (1-2 hours) - Prevents memory exhaustion
5. **Timestamp validation** (1-2 hours) - Improves data integrity

**Total: 1 day of work for major security improvement**

---

## Current Status: Can I Deploy?

| Environment | Safe? | What's Missing |
|-------------|-------|---------------|
| **Local dev (same machine)** | ✅ YES | Nothing, ready to use |
| **Local network (trusted users)** | ⚠️ MAYBE | Need: file locking, API key auth |
| **Internet (public access)** | ❌ NO | Need: all Phase 1 + Phase 2 items |
| **Production (critical data)** | ❌ NO | Need: all phases + security review |

---

## Questions?

- Want me to implement any of these?
- Need help prioritizing?
- Want to discuss architectural decisions (file locking vs SQLite)?

Just say which issues you want tackled next!
