# AGENT.md — Building a Useful MCP Server: Best Practices

This document captures pragmatic, security-minded, and agent-friendly best practices for implementing an MCP (Model Context Protocol) server that is reliable, observable, and easy for agents and humans to use.

Audience: engineers building or maintaining MCP servers; reviewers who need a checklist for production readiness.


## Core principles

- Clarity first: clear tool names, descriptions, and schemas produce better agent behavior and fewer mistakes.
- Safety by default: prefer allowlists, dry-runs, previews, and explicit commits.
- Deterministic outputs: stable ordering and shapes improve tool reliability and downstream reasoning.
- Observability everywhere: structured logs, metrics, and traceability are mandatory from day one.
- Backward compatibility: version your tools and schemas; deprecate, don’t break.
- Least privilege: restrict file system, network, and secrets; prove safety with tests.
- Resilience over perfection: design for partial failure, retries, and timeouts.


## Protocol and compatibility

- Conform to the MCP specification for transports, message formats, and handshake.
- Support cancellation and timeouts; abort work promptly when cancelled.
- Stream where it helps UX (progress, long-running operations); finalize with a compact, canonical result.
- Keep IDs stable and opaque. Avoid leaking implementation details in IDs.
- Make responses small and well-structured; prefer pagination or chunking over massive payloads.


## Tool design

Design with both agents and humans in mind.

- Naming
  - Name: short, verb-forward, specific (e.g., `search_files`, `create_issue`).
  - Description: a one-liner first, followed by 1–3 bullet examples of usage.
- Scope and granularity
  - Prefer small, composable tools over monoliths, but avoid excessive fragmentation.
  - Include a `dryRun` and/or `preview` option for write operations.
- Idempotency and safety
  - Make tools idempotent where possible (e.g., use natural keys or accept `idempotencyKey`).
  - For destructive actions, require explicit `confirm: true` and consider two-phase commit: preview → apply.
- Inputs and outputs
  - Use JSON Schema with strong validation: `required`, enums, min/max, patterns, formats, defaults.
  - Return machine-friendly shapes first, with optional human-readable `summary` fields.
  - Be explicit about units, time zones (prefer UTC ISO-8601), encodings, and limits.
- Error handling
  - Return structured errors with `type`, `message`, `retryable`, `retryAfterSec?`, and `details?`.
  - Distinguish user vs system errors. Avoid generic "internal error" unless necessary.
- Pagination
  - Use cursor-based pagination with `nextCursor` and preserve sort order.


## Resource design

- Read-mostly resources should be fast, cacheable, and chunked (e.g., paging or logical segments).
- Provide summaries and search capabilities; return counts and cursors for navigation.
- Include stable references (URIs) to enable deep-linking back to origins where safe.
- Respect source rate limits and quotas; surface them in results and errors.


## Security and privacy

- Input validation
  - Validate all inputs against JSON Schema; reject unknown fields by default.
  - Normalize and canonicalize file paths to enforce workspace boundaries; disallow traversal outside allowlisted roots.
- Execution safety
  - Avoid shelling out; if unavoidable, use strict allowlists, no string interpolation, and separated args.
  - Never execute untrusted code; sandbox and limit resource usage.
- Secrets handling
  - Load secrets from environment or secret managers; never log or echo them.
  - Redact sensitive values in logs and errors; document which fields are sensitive.
- Network and filesystem
  - Restrict outbound network to required domains; enforce timeouts and TLS.
  - Use read-only operations where possible; write operations must be explicit and minimal.
- Multi-tenant isolation
  - Partition data per tenant; avoid cross-tenant leakage in caches, logs, or errors.


## Performance and scalability

- Concurrency and parallelism
  - Use bounded concurrency; apply backpressure to avoid overload.
- Caching
  - Apply TTL caches for hot reads; key by normalized inputs; add `cache: miss|hit|stale` metadata.
  - Use ETags or content hashes where applicable.
- Batching
  - Batch small homogeneous requests; amortize roundtrips to remote APIs.
- Timeouts and deadlines
  - Set sensible defaults and allow per-request overrides within safe bounds.
- Memory discipline
  - Stream large results; avoid loading entire files or datasets in memory.


## Observability and debugging

- Structured logs (JSON) with fields like:
  - `timestamp`, `level`, `tool`, `requestId`, `tenantId`, `durationMs`, `resultSize`, `cache`, `error.type`.
- Metrics: per-tool QPS, latency percentiles, error rates, cache hit ratio, queue depth, external API timings.
- Tracing: propagate `traceparent`/`tracestate` when present; correlate across services.
- Sampling: sample full payloads (safely redacted) at low rates for debugging; never sample secrets.
- Log hygiene: cap size; truncate long fields; include counts instead of raw blobs when large.


## Reliability and failure handling

- Error taxonomy
  - `user_input`, `not_found`, `conflict`, `unauthorized`, `rate_limited`, `dependency_unavailable`, `timeout`, `internal`.
- Retries
  - Exponential backoff with jitter for retryable classes; respect remote `Retry-After`.
- Circuit breakers and bulkheads
  - Fail fast when dependencies degrade; isolate heavy tools from lightweight ones.
- Fallbacks
  - Provide cached or partial results with clear `partial: true` flags when possible.
- Graceful degradation
  - Return partial progress in streams; conclude with a clear terminal status.


## API and schema design

- Stability
  - Version tools and schemas: `toolName@v1`. Deprecate with a timeline; keep old versions working.
- Strictness
  - Reject unknown fields to surface mistakes early; document optional fields and defaults.
- Discoverability
  - Provide a machine-readable registry of tools, schemas, and limits.
- Localization and formatting
  - Use English by default for text fields; keep machine fields language-agnostic.


## Long-running operations and streaming

- Prefer streaming for progress and logs; finish with a compact summary object.
- Provide `jobId` and allow polling or resume.
- Support cancellation tokens; regularly check and abort promptly.
- Persist intermediate artifacts with stable references when useful.


## Configuration, secrets, and policy

- Configuration via environment variables with sane defaults; document them.
- Separate configuration from policy: use allowlists/denylists loaded at startup.
- Validate configuration on boot; fail fast with actionable errors.
- Never print secrets; redact values at the edge.


## Testing and CI

- Unit tests: pure logic, schema validation, input normalization.
- Contract tests: golden I/O for each tool; freeze expected shapes.
- Protocol tests: handshake, streaming, cancellation, timeouts.
- Integration tests: record/replay for remote APIs with scrubbed fixtures.
- Fuzz/property tests where inputs are complex.
- Performance tests: worst-case payload sizes; concurrency/latency budgets.
- Security tests: path traversal, command injection, resource limit enforcement.
- CI gates: lint, format, test, coverage, schema compatibility checks.


## Local development workflow

- Dev server with hot reload; test harness with canned scenarios.
- Seed data and deterministic fixtures for repeatable runs.
- Makefile/deno.json tasks for common flows (fmt, lint, test, start, bench).
- Clear README and examples; include copy-pasteable tool invocations.


## Deployment and operations

- Containerize with a minimal base; pin OS and runtime versions.
- Health checks: liveness (process), readiness (dependencies), and startup (migrations).
- Configuration-by-env; guardrails for prod-only flags.
- Autoscaling by QPS/latency/queue depth; sensible limits for concurrency.
- Rollouts: staged/canary; quick rollback; feature flags for risky tools.
- Backups for any persisted state; disaster recovery plan.


## Multi-tenancy and auth

- Authenticate requests when appropriate; prefer short-lived, scoped tokens.
- Authorize at tool boundaries; enforce least privilege per tenant.
- Per-tenant rate limits and quotas; fairness under contention.


## Checklists

Baseline readiness
- [ ] Tools have clear names, descriptions, and examples
- [ ] Schemas validate strictly; unknown fields rejected
- [ ] Destructive ops require `confirm` or two-phase preview/apply
- [ ] Idempotency documented and implemented where possible
- [ ] Pagination and limits documented and enforced
- [ ] Timeouts, cancellation, retries implemented
- [ ] Structured logs, metrics, and tracing in place
- [ ] Secrets never logged; sensitive fields redacted
- [ ] Safety tests pass (path traversal, injection, resource limits)
- [ ] Load/perf budgets measured and within SLOs

Production hardening
- [ ] Cache strategy documented; hit/miss metrics
- [ ] Circuit breakers and backpressure
- [ ] Canary rollout plan and feature flags
- [ ] Runbooks for common failures and paged alerts
- [ ] Clear deprecation policy and version strategy


---

## Appendix A: Minimal Deno v2 skeleton (illustrative)

Note: This is an illustrative skeleton showing structure and best practices for Deno v2. It does not depend on a specific MCP library and omits transport wiring details.

```ts
// deno run --allow-read --allow-env server.ts
// Deno v2+ illustrative MCP-like server skeleton

interface ToolContext {
  requestId: string;
  deadlineMs?: number;
  signal?: AbortSignal;
}

interface Tool<TIn, TOut> {
  name: string;
  description: string;
  inputSchema: unknown; // JSON Schema
  handler: (input: TIn, ctx: ToolContext) => Promise<TOut>;
}

function createRegistry() {
  const tools = new Map<string, Tool<any, any>>();
  return {
    register<TIn, TOut>(tool: Tool<TIn, TOut>) {
      if (tools.has(tool.name)) throw new Error(`duplicate tool: ${tool.name}`);
      tools.set(tool.name, tool);
    },
    get(name: string) { return tools.get(name); },
    list() { return [...tools.values()].map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })); }
  };
}

const registry = createRegistry();

registry.register({
  name: "echo@v1",
  description: "Echo text with length; useful for smoke tests.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: { text: { type: "string", minLength: 1 }, upper: { type: "boolean", default: false } },
    required: ["text"]
  },
  async handler(input: { text: string; upper?: boolean }, ctx) {
    const started = Date.now();
    const value = input.upper ? input.text.toUpperCase() : input.text;
    return { value, length: value.length, durationMs: Date.now() - started };
  }
});

// Pseudo JSON-RPC handler (transport omitted)
async function handleRequest(req: { id: string; method: string; params: any }) {
  const tool = registry.get(req.method);
  if (!tool) return { id: req.id, error: { type: "not_found", message: `unknown tool: ${req.method}` } };

  // TODO: validate params against tool.inputSchema
  const controller = new AbortController();
  const deadline = 15_000; // default 15s
  // Abort with a standard TimeoutError-like reason so downstream can distinguish
  const timer = setTimeout(() => {
    // DOMException is available in Deno; falling back to Error if needed is fine
    controller.abort(new DOMException("deadline exceeded", "TimeoutError"));
  }, deadline);
  try {
    const result = await tool.handler(req.params, { requestId: req.id, deadlineMs: deadline, signal: controller.signal });
    return { id: req.id, result };
  } catch (e: any) {
    const name = e?.name ?? "";
    const isAbort = name === "AbortError"; // common when an AbortSignal cancels work
    const isTimeout = name === "TimeoutError" || (isAbort && controller.signal.aborted);
    const message = isTimeout ? "operation timed out" : String(e);
    return {
      id: req.id,
      error: {
        type: isTimeout ? "timeout" : "internal",
        message,
        retryable: !!isTimeout,
        details: { deadlineMs: deadline }
      }
    };
  } finally {
    clearTimeout(timer);
  }
}
```


## Appendix B: Minimal F#/.NET skeleton (illustrative)

Note: Illustrative structure using .NET 8+. Wire up your transport (e.g., stdio or websockets) and JSON serialization as appropriate for MCP.

```fsharp
// .NET 8+ illustrative MCP-like server skeleton in F#
open System
open System.Text.Json
open System.Text.Json.Serialization
open System.Threading

[<CLIMutable>]
type EchoIn = { text: string; upper: bool option }

[<CLIMutable>]
type EchoOut = { value: string; length: int; durationMs: int64 }

type ToolContext = { requestId: string; deadlineMs: int option; token: CancellationToken }

type ITool =
    abstract Name: string
    abstract Description: string
    abstract InputSchema: JsonElement
    abstract Handle: JsonElement * ToolContext -> System.Threading.Tasks.Task<JsonElement>

let jsonOptions = JsonSerializerOptions(PropertyNamingPolicy = JsonNamingPolicy.CamelCase)

let echoTool : ITool =
    { new ITool with
        member _.Name = "echo@v1"
        member _.Description = "Echo text with length; useful for smoke tests."
        member _.InputSchema =
            // Simplified schema; in production supply full JSON Schema
            JsonDocument.Parse("""{""type"":""object"",""properties"":{""text"":{""type"":""string""},""upper"":{""type"":""boolean""}},""required"": [""text""]}""").RootElement
        member _.Handle(input, ctx) = task {
            // TODO: validate input against InputSchema
            let echoIn = JsonSerializer.Deserialize<EchoIn>(input, jsonOptions)
            let started = DateTime.UtcNow
            let value =
                match echoIn.upper with
                | Some true -> echoIn.text.ToUpperInvariant()
                | _ -> echoIn.text
            let elapsed = int64 (DateTime.UtcNow - started).TotalMilliseconds
            let outp = { value = value; length = value.Length; durationMs = elapsed }
            let json = JsonSerializer.SerializeToElement(outp, jsonOptions)
            return json
        } }

// Registry and JSON-RPC handling (transport omitted)
open System.Collections.Concurrent

let registry = ConcurrentDictionary<string, ITool>()
let _ = registry.TryAdd(echoTool.Name, echoTool) |> ignore

[<CLIMutable>]
type RpcRequest = { id: string; method: string; params: JsonElement }

[<CLIMutable>]
type RpcResponse = { id: string; result: JsonElement voption; error: JsonElement voption }

let handleRequest (req: RpcRequest) (ct: CancellationToken) = task {
    match registry.TryGetValue(req.method) with
    | true, tool ->
        // Create a timeout CTS and link it with the external token
        use cts = new CancellationTokenSource()
        cts.CancelAfter(TimeSpan.FromSeconds(15))
        use linked = CancellationTokenSource.CreateLinkedTokenSource(ct, cts.Token)
        try
            let! result = tool.Handle(req.params, { requestId = req.id; deadlineMs = Some 15_000; token = linked.Token })
            let resp = { id = req.id; result = ValueSome result; error = ValueNone }
            return resp
        with
        | :? OperationCanceledException as oce ->
            // Distinguish timeout (our cts) from external cancellation (ct)
            let isTimeout = cts.IsCancellationRequested && not ct.IsCancellationRequested
            let json =
                if isTimeout then
                    JsonDocument.Parse($"{{\"type\":\"timeout\",\"message\":\"operation timed out\",\"retryable\":true,\"details\":{\"deadlineMs\":15000}}}").RootElement
                else
                    JsonDocument.Parse($"{{\"type\":\"cancelled\",\"message\":{JsonSerializer.Serialize(oce.Message)},\"retryable\":false}}").RootElement
            let resp = { id = req.id; result = ValueNone; error = ValueSome json }
            return resp
        | ex ->
            let err = JsonDocument.Parse($"{{\"type\":\"internal\",\"message\":{JsonSerializer.Serialize(ex.Message)},\"retryable\":false }}").RootElement
            let resp = { id = req.id; result = ValueNone; error = ValueSome err }
            return resp
    | _ ->
        let err = JsonDocument.Parse($"{{\"type\":\"not_found\",\"message\":\"unknown tool: {req.method}\"}}").RootElement
        let resp = { id = req.id; result = ValueNone; error = ValueSome err }
        return resp
}
```


## Appendix C: Structured error shape (recommendation)

```json
{
  "type": "timeout | user_input | not_found | conflict | unauthorized | rate_limited | dependency_unavailable | internal",
  "message": "Human-readable but concise summary",
  "retryable": true,
  "retryAfterSec": 2,
  "details": { "field": "text", "reason": "minLength" },
  "traceId": "00-1af...-..."
}
```


## Notes

- Examples are illustrative and intentionally transport-agnostic. Wire them to your chosen MCP transport (stdio, websockets) per the MCP spec and your runtime.
- For JavaScript/TypeScript, prefer Deno v2+ with ESM modules and `deno.json` tasks. For .NET, use the latest LTS (e.g., .NET 8+) and consistent JSON options across the codebase.
