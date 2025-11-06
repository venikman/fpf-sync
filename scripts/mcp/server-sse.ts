#!/usr/bin/env bun
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { z } from 'zod';
import { listWhitelistedFpfDocs, isAllowedFpfPath, findMainFpfSpec, extractTopicsFromMarkdown, extractHeadings, validateTimestamp, validateWindow } from './util.ts';
import { listEpistemes, getEpistemeById } from './store.ts';
import { readFile } from 'node:fs/promises';
import process from "node:process";
import { closeDatabase } from './storage/sqlite.ts';
// FPF-MCP domain, storage, services, guards, errors
import { makeCtxId, makeRoleId, makeRaId, makeMdId, makeWorkId, makeSvcId, makeBridgeId, makePolicyId_EE } from './domain/ids.ts';
import type { Context, Role, RoleAssignment, StateAssertion, MethodDescription, Work, Service as Svc, Capability as Cap, PolicyEE } from './domain/types.ts';
import { upsertContext } from './storage/contexts.ts';
import { upsertBridge } from './storage/bridges.ts';
import { upsertRole } from './storage/roles.ts';
import { upsertRoleAssignment, listRoleAssignments } from './storage/role_assignments.ts';
import { upsertStateAssertion } from './storage/state_assertions.ts';
import { upsertMethod } from './storage/methods.ts';
import { upsertWork, getWork } from './storage/work.ts';
import { upsertEvidenceLink } from './storage/evidence_links.ts';
import { defineService, evaluateService } from './services/service.ts';
import { declareCapability, checkCapability } from './services/capability.ts';
import { nqdGenerate, eePolicySet } from './services/nqd.ts';
import { parityRun } from './services/parity.ts';
import { computeTrustScore } from './services/trust.ts';
import { gammaAggregate } from './services/gamma.ts';
import { appendEvent } from './domain/events.ts';
import { guardWorkWindow, guardEligibility } from './domain/guards.ts';
import { FpfError } from './util/errors.ts';

// Basic server info
const pkg = { name: 'fpf-mcp', version: '0.2.0' };

const mcp = new McpServer({ name: pkg.name, version: pkg.version }, {});


// Resources: use a custom URI scheme 'fpf://'
// Static: fpf://epistemes
mcp.resource('Episteme registry', 'fpf://epistemes', { mimeType: 'application/json' }, async (_uri) => {
  const data = await listEpistemes();
  return { contents: [{ uri: 'fpf://epistemes', mimeType: 'application/json', text: JSON.stringify(data, null, 2) }] };
});

// Dynamic per-episteme resources: fpf://episteme/{id}
const epistemeTemplate = new ResourceTemplate('fpf://episteme/{id}', {
  list: async () => {
    const eps = await listEpistemes();
    return {
      resources: eps.map((e) => ({ uri: `fpf://episteme/${e.id}`, name: e.object, mimeType: 'application/json' })),
    };
  },
});

mcp.resource(
  'Episteme by id',
  epistemeTemplate,
  { mimeType: 'application/json' },
  async (_uri, variables) => {
    const id = String(variables.id || '').trim();
    const ep = await getEpistemeById(id);
    if (!ep) throw new Error('Not found');
    return { contents: [{ uri: `fpf://episteme/${id}`, mimeType: 'application/json', text: JSON.stringify(ep, null, 2) }] };
  },
);

// Static: fpf://spec
mcp.resource('FPF Core Spec (holonic)', 'fpf://spec', { mimeType: 'text/markdown' }, async () => {
  const rel = await findMainFpfSpec();
  if (!rel) throw new Error('Main FPF spec not found under yadisk/');
  const abs = await isAllowedFpfPath(rel);
  const text = await readFile(abs, 'utf8');
  return { contents: [{ uri: 'fpf://spec', mimeType: 'text/markdown', text }] };
});

// Tools
mcp.tool(
  'fpf.list_epistemes',
  {},
  async () => {
    const data = await listEpistemes();
    return { content: [{ type: 'text', text: JSON.stringify(data) }] };
  },
);

// New FPF-MCP tools per server interface (v0.1 tooling profile)

const READONLY = (process.env.FPF_READONLY ?? '1') !== '0';

function ensureWritable() {
  if (READONLY) throw new FpfError('READONLY', 'Server is in read-only mode. Set FPF_READONLY=0 to enable writes.');
}

// A) Context and bridges
mcp.tool(
  'fpf.context.upsert',
  { name: z.string(), edition: z.string(), glossary: z.record(z.string()).optional(), invariants: z.array(z.string()).optional(), roles: z.array(z.string()).optional() },
  async (args) => {
    ensureWritable();
    const id = makeCtxId(String(args.name), String(args.edition));
    const now = new Date().toISOString();
    const ctx: Context = { id, name: String(args.name), edition: String(args.edition), glossary: args.glossary as any, invariants: args.invariants as any, roles: args.roles as any, createdAt: now, updatedAt: now };
    await upsertContext(ctx);
    return { content: [{ type: 'text', text: JSON.stringify({ ctx: id }) }] };
  },
);

mcp.tool(
  'fpf.bridge.upsert',
  { from: z.object({ role: z.string().optional(), kind: z.string().optional(), plane: z.string().optional(), ctx: z.string() }), to: z.object({ role: z.string().optional(), kind: z.string().optional(), plane: z.string().optional(), ctx: z.string() }), CL: z.number(), lossNotes: z.array(z.string()).optional() },
  async (args) => {
    ensureWritable();
    const id = makeBridgeId(String(args.from.role || args.from.kind || args.from.plane || 'a'), String(args.from.ctx), String(args.to.role || args.to.kind || args.to.plane || 'b'), String(args.to.ctx));
    const now = new Date().toISOString();
    const bridge = { id, from: args.from as any, to: args.to as any, CL: Number(args.CL), lossNotes: args.lossNotes as any, createdAt: now, updatedAt: now };
    await upsertBridge(bridge as any);
    return { content: [{ type: 'text', text: JSON.stringify({ bridge: id }) }] };
  },
);

// B) Roles, assignments, state
mcp.tool(
  'fpf.role.upsert',
  { ctx: z.string(), role: z.string(), rcs: z.object({ chars: z.array(z.string()) }), rsg: z.object({ states: z.array(z.string()), transitions: z.array(z.object({ from: z.string(), to: z.string() })), enactable: z.array(z.string()) }), algebra: z.object({ le: z.array(z.string()).optional(), incompatible: z.array(z.string()).optional(), bundles: z.array(z.array(z.string())).optional() }) },
  async (args) => {
    ensureWritable();
    const id = makeRoleId(String(args.role), String(args.ctx));
    const now = new Date().toISOString();
    const role = { id, ctx: String(args.ctx), role: String(args.role), rcs: args.rcs as any, rsg: args.rsg as any, algebra: args.algebra as any, createdAt: now, updatedAt: now } as Role;
    await upsertRole(role);
    return { content: [{ type: 'text', text: JSON.stringify({ role: id }) }] };
  },
);

mcp.tool(
  'fpf.role.assign',
  { holder: z.enum(['system','episteme']), role: z.string(), ctx: z.string(), window: z.object({ from: z.string(), to: z.string() }) },
  async (args) => {
    ensureWritable();
    validateWindow(String(args.window.from), String(args.window.to), 'window');
    const id = makeRaId(String(args.holder), String(args.role), String(args.ctx), String(args.window.from), String(args.window.to));
    const now = new Date().toISOString();
    const ra = { id, holder: args.holder, role: String(args.role), ctx: String(args.ctx), window: args.window, createdAt: now, updatedAt: now } as RoleAssignment;
    // Check SoD conflicts against existing assignments with incompatible roles is enforced at role state time; here we just record
    await upsertRoleAssignment(ra);
    await appendEvent({ type: 'RoleAssigned', ts: now, envelope: { ctx: ra.ctx }, payload: ra });
    return { content: [{ type: 'text', text: JSON.stringify({ ra: id }) }] };
  },
);

mcp.tool(
  'fpf.role.state.assert',
  { ra: z.string(), state: z.string(), checklistEvidence: z.array(z.string()).optional(), at: z.string() },
  async (args) => {
    ensureWritable();
    validateTimestamp(String(args.at), 'at');
    const now = new Date().toISOString();
    const assertion: StateAssertion = { id: crypto.randomUUID(), ra: String(args.ra), state: String(args.state), checklistEvidence: args.checklistEvidence as any, at: String(args.at) };
    await upsertStateAssertion(assertion);
    await appendEvent({ type: 'StateAsserted', ts: now, envelope: { ctx: '' }, payload: assertion });
    return { content: [{ type: 'text', text: JSON.stringify({ assertionId: assertion.id }) }] };
  },
);

// C) Methods and work
mcp.tool(
  'fpf.method.register',
  { ctx: z.string(), md: z.string(), io: z.any().optional(), steps: z.array(z.object({ id: z.string(), requiredRoles: z.array(z.string()).optional(), capabilityThresholds: z.record(z.number()).optional() })), references: z.array(z.string()).optional() },
  async (args) => {
    ensureWritable();
    const id = makeMdId(String(args.md.split('@')[0] || args.md), String(args.md.split('@')[1] || 'v1'));
    const now = new Date().toISOString();
    const item: MethodDescription = { id, ctx: String(args.ctx), md: String(args.md), io: args.io, steps: args.steps as any, references: args.references as any, createdAt: now, updatedAt: now };
    await upsertMethod(item);
    return { content: [{ type: 'text', text: JSON.stringify({ md: id }) }] };
  },
);

mcp.tool(
  'fpf.work.start',
  { md: z.string(), stepId: z.string(), performedBy: z.string(), at: z.string() },
  async (args) => {
    ensureWritable();
    validateTimestamp(String(args.at), 'at');
    const id = makeWorkId(crypto.randomUUID());
    const w: Work = { id, md: String(args.md), stepId: String(args.stepId), performedBy: String(args.performedBy), startedAt: String(args.at) };
    // Guards: window + eligibility (episteme cannot perform)
    const ras = await listRoleAssignments();
    const ra = ras.find(r => r.id === w.performedBy);
    if (!ra) throw new FpfError('WIN.INVALID', 'RoleAssignment not found for work');
    guardWorkWindow(ra, w.startedAt);
    guardEligibility(ra.holder);
    const now = new Date().toISOString();
    await upsertWork(w);
    await appendEvent({ type: 'WorkStarted', ts: now, envelope: { ctx: '' , performedBy: w.performedBy }, payload: w });
    return { content: [{ type: 'text', text: JSON.stringify({ work: id }) }] };
  },
);

mcp.tool(
  'fpf.work.end',
  { work: z.string(), outcome: z.string(), observations: z.array(z.string()).optional(), resources: z.record(z.any()).optional(), links: z.object({ claimsService: z.array(z.string()).optional(), evidence: z.array(z.string()).optional() }).optional() },
  async (args) => {
    ensureWritable();
    const existing = await getWork(String(args.work));
    if (!existing) throw new FpfError('WIN.INVALID', 'Work not found');
    const endedAt = new Date().toISOString();
    const updated: Work = { ...existing, endedAt, outcome: String(args.outcome), observations: args.observations as any, resources: args.resources as any, links: args.links as any };
    await upsertWork(updated);
    await appendEvent({ type: 'WorkEnded', ts: endedAt, envelope: { ctx: '' , performedBy: updated.performedBy }, payload: updated });
    return { content: [{ type: 'text', text: JSON.stringify({ work: updated.id }) }] };
  },
);

mcp.tool(
  'fpf.work.link.evidence',
  { work: z.string(), episteme: z.string(), evidenceRole: z.string(), ctx: z.string() },
  async (args) => {
    ensureWritable();
    const id = crypto.randomUUID();
    const link = { id, work: String(args.work), episteme: String(args.episteme), evidenceRole: String(args.evidenceRole), ctx: String(args.ctx), createdAt: new Date().toISOString() };
    await upsertEvidenceLink(link);
    await appendEvent({ type: 'EvidenceBound', ts: link.createdAt, envelope: { ctx: link.ctx }, payload: link });
    return { content: [{ type: 'text', text: JSON.stringify({ linkId: id }) }] };
  },
);

// D) Capability and service
mcp.tool(
  'fpf.capability.declare',
  { holder: z.literal('system'), ctx: z.string(), taskFamily: z.string(), workScope: z.string().optional(), measures: z.record(z.number()).optional(), qualWindow: z.object({ from: z.string(), to: z.string() }).optional(), id: z.string().optional() },
  async (args) => {
    ensureWritable();
    const id = args.id || crypto.randomUUID();
    const cap = await declareCapability({ id, holder: 'system', ctx: String(args.ctx), taskFamily: String(args.taskFamily), workScope: args.workScope as any, measures: args.measures as any, qualWindow: args.qualWindow as any });
    return { content: [{ type: 'text', text: JSON.stringify({ capabilityId: cap.id }) }] };
  },
);

mcp.tool(
  'fpf.capability.check',
  { holder: z.string(), step: z.object({ md: z.string(), stepId: z.string(), jobSlice: z.any().optional(), thresholds: z.record(z.number()).optional() }), at: z.string() },
  async (args) => {
    const res = await checkCapability(String(args.holder), args.step as any, String(args.at));
    return { content: [{ type: 'text', text: JSON.stringify(res) }] };
  },
);

mcp.tool(
  'fpf.service.define',
  { ctx: z.string(), name: z.string(), providerRole: z.string(), consumerRole: z.string().optional(), claimScope: z.string(), accessSpec: z.string().optional(), acceptanceSpec: z.string(), unit: z.string().optional(), version: z.string() },
  async (args) => {
    ensureWritable();
    const id = makeSvcId(String(args.name), String(args.ctx), String(args.version));
    const svc: Svc = { id, ctx: String(args.ctx), name: String(args.name), providerRole: String(args.providerRole), consumerRole: args.consumerRole as any, claimScope: String(args.claimScope), accessSpec: args.accessSpec as any, acceptanceSpec: String(args.acceptanceSpec), unit: args.unit as any, version: String(args.version), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await defineService(svc);
    return { content: [{ type: 'text', text: JSON.stringify({ svc: id }) }] };
  },
);

mcp.tool(
  'fpf.service.evaluate',
  { svc: z.string(), window: z.object({ from: z.string(), to: z.string() }), kpis: z.array(z.enum(['uptime','leadTime','rejectRate','costToServe'])), gammaTimePolicy: z.any().optional() },
  async (args) => {
    validateWindow(String(args.window.from), String(args.window.to), 'window');
    const metrics = await evaluateService(String(args.svc), args.window as any, args.kpis as any);
    await appendEvent({ type: 'ServiceEvaluated', ts: new Date().toISOString(), envelope: { ctx: '' }, payload: { svc: args.svc, window: args.window, metrics } });
    return { content: [{ type: 'text', text: JSON.stringify({ metrics }) }] };
  },
);

// E) NQD / E/E / parity
mcp.tool(
  'fpf.nqd.generate',
  { ctx: z.string(), descriptorMapRef: z.string(), distanceDefRef: z.string(), objectives: z.object({ N: z.number(), U: z.number(), C: z.number() }), archive: z.any().optional(), S: z.array(z.string()).optional(), policy: z.string() },
  async (args) => {
    const out = await nqdGenerate(args as any);
    await appendEvent({ type: 'ParityRun', ts: new Date().toISOString(), envelope: { ctx: String(args.ctx) }, payload: out });
    return { content: [{ type: 'text', text: JSON.stringify(out) }] };
  },
);

mcp.tool(
  'fpf.ee.policy.set',
  { policyId: z.string(), explore_share: z.number(), dominance: z.union([z.literal('ParetoOnly'), z.string()]), scaleProbe: z.object({ S: z.string(), points: z.number().min(2) }).optional() },
  async (args) => {
    ensureWritable();
    const policy: PolicyEE = await eePolicySet(args as any);
    return { content: [{ type: 'text', text: JSON.stringify({ policy }) }] };
  },
);

mcp.tool(
  'fpf.parity.run',
  { candidates: z.array(z.object({ id: z.string(), metrics: z.record(z.number()) })), ctx: z.string(), isoScale: z.object({ S: z.string(), budget: z.number() }).optional(), pins: z.object({ editions: z.array(z.string()).optional() }).optional(), metrics: z.array(z.string()).optional(), referencePlane: z.string().optional() },
  async (args) => {
    const out = parityRun({ candidates: args.candidates as any, isoScale: args.isoScale as any, metrics: args.metrics as any });
    await appendEvent({ type: 'ParityRun', ts: new Date().toISOString(), envelope: { ctx: String(args.ctx) }, payload: out });
    return { content: [{ type: 'text', text: JSON.stringify(out) }] };
  },
);

// F) Trust & assurance
mcp.tool(
  'fpf.trust.score',
  { claim: z.any(), evidence: z.array(z.object({ episteme: z.string(), role: z.string(), timespan: z.object({ from: z.string(), to: z.string() }), decay: z.number().optional() })), bridges: z.array(z.string()).optional(), formalityF: z.number(), scopeG: z.number(), reliabilityR: z.number().optional() },
  async (args) => {
    const res = computeTrustScore(args as any);
    await appendEvent({ type: 'TrustScored', ts: new Date().toISOString(), envelope: { ctx: '' }, payload: res });
    return { content: [{ type: 'text', text: JSON.stringify(res) }] };
  },
);

// G) Aggregation and publication
mcp.tool(
  'fpf.gamma.aggregate',
  { ctx: z.string(), holons: z.array(z.any()), fold: z.enum(['WLNK','COMM','LOC','MONO']), gammaTimePolicy: z.any().optional() },
  async (args) => {
    const res = gammaAggregate(args as any);
    return { content: [{ type: 'text', text: JSON.stringify(res) }] };
  },
);

mcp.tool(
  'fpf.uts.publish',
  { ctx: z.string(), rows: z.array(z.object({ kind: z.string().optional(), role: z.string().optional(), service: z.string().optional(), generator: z.string().optional(), N: z.number().optional(), U: z.number().optional(), C: z.number().optional(), Diversity_P: z.number().optional(), referencePlane: z.string().optional(), units: z.string().optional(), scales: z.string().optional(), polarity: z.string().optional(), policyIds: z.array(z.string()).optional(), pins: z.any().optional() })) },
  async (args) => {
    ensureWritable();
    const utsId = crypto.randomUUID();
    await appendEvent({ type: 'UTSPublished', ts: new Date().toISOString(), envelope: { ctx: String(args.ctx) }, payload: { id: utsId, rows: args.rows } });
    return { content: [{ type: 'text', text: JSON.stringify({ utsId }) }] };
  },
);

mcp.tool(
  'fpf.drr.record',
  { change: z.string(), context: z.string(), rationale: z.string(), alternatives: z.array(z.string()).optional(), consequences: z.array(z.string()).optional(), refs: z.array(z.string()).optional() },
  async (args) => {
    ensureWritable();
    const drrId = crypto.randomUUID();
    await appendEvent({ type: 'DRRRecorded', ts: new Date().toISOString(), envelope: { ctx: String(args.context) }, payload: { id: drrId, ...args } });
    return { content: [{ type: 'text', text: JSON.stringify({ drrId }) }] };
  },
);

mcp.tool(
  'fpf.get_episteme',
  { id: z.string() },
  async (args) => {
    const id = String(args.id).trim();
    const ep = await getEpistemeById(id);
    if (!ep) throw new Error('Not found');
    return { content: [{ type: 'text', text: JSON.stringify(ep) }] };
  },
);


mcp.tool(
  'fpf.list_fpf_docs',
  {},
  async () => {
    const docs = await listWhitelistedFpfDocs();
    return { content: [{ type: 'text', text: JSON.stringify(docs) }] };
  },
);

mcp.tool(
  'fpf.read_fpf_doc',
  { path: z.string() },
  async (args) => {
    const abs = await isAllowedFpfPath(String(args.path));
    const text = await readFile(abs, 'utf8');
    return { content: [{ type: 'text', text }] };
  },
);

// New: Extract topics from an FPF markdown doc (uses heading heuristics)
mcp.tool(
  'fpf.extract_topics_from_fpf',
  {
    path: z.string().optional(),
    maxTopics: z.number().int().min(1).max(100).optional(),
  },
  async (args) => {
    const rel = args?.path ? String(args.path) : await findMainFpfSpec();
    if (!rel) throw new Error('No FPF doc specified and main spec not found');
    const abs = await isAllowedFpfPath(rel);
    const text = await readFile(abs, 'utf8');
    const topics = await extractTopicsFromMarkdown(text, Number(args?.maxTopics ?? 12));
    return {
      content: [{ type: 'text', text: JSON.stringify({ path: rel, topics }) }],
      structuredContent: { path: rel, topics },
    };
  },
);

// New: Search epistemes by text match across object, concept, symbol
mcp.tool(
  'fpf.search_epistemes',
  { text: z.string() },
  async (args) => {
    const q = String(args.text).toLowerCase();
    const all = await listEpistemes();
    const hits = all.filter((e) =>
      e.object.toLowerCase().includes(q) ||
      e.concept.toLowerCase().includes(q) ||
      e.symbol.toLowerCase().includes(q)
    );
    return { content: [{ type: 'text', text: JSON.stringify(hits) }] };
  },
);

// New: Find episteme by exact symbol (case-insensitive)
mcp.tool(
  'fpf.find_episteme_by_symbol',
  { symbol: z.string() },
  async (args) => {
    const sym = String(args.symbol).toLowerCase();
    const all = await listEpistemes();
    const hits = all.filter((e) => e.symbol.toLowerCase() === sym);
    return { content: [{ type: 'text', text: JSON.stringify(hits) }] };
  },
);

// New: Export all epistemes as a JSON blob
mcp.tool(
  'fpf.export_epistemes',
  {},
  async () => {
    const all = await listEpistemes();
    const payload = { exportedAt: new Date().toISOString(), count: all.length, items: all };
    return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
  },
);


// New: Basic stats about store and docs
mcp.tool(
  'fpf.stats',
  {},
  async () => {
    const [eps, docs] = await Promise.all([listEpistemes(), listWhitelistedFpfDocs()]);
    const bySymbol = Object.create(null) as Record<string, number>;
    for (const e of eps) bySymbol[e.symbol] = (bySymbol[e.symbol] ?? 0) + 1;
    const stats = {
      epistemeCount: eps.length,
      uniqueSymbols: Object.keys(bySymbol).length,
      fpfDocCount: docs.length,
    };
    return { content: [{ type: 'text', text: JSON.stringify(stats) }] };
  },
);

// Phase 1 add-ons
// 1) Search FPF docs by full-text substring (simple heuristic)
mcp.tool(
  'fpf.search_fpf_docs',
  { text: z.string() },
  async (args) => {
    const q = String(args.text).toLowerCase();
    const docs = await listWhitelistedFpfDocs();
    const results: { path: string; matches: number }[] = [];
    for (const p of docs) {
      const abs = await isAllowedFpfPath(p);
      const text = await readFile(abs, 'utf8');
      const matches = (text.toLowerCase().match(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      if (matches > 0) results.push({ path: p, matches });
    }
    results.sort((a, b) => b.matches - a.matches);
    return { content: [{ type: 'text', text: JSON.stringify(results) }] };
  },
);

// 2) List headings of a doc with depth and anchors
mcp.tool(
  'fpf.list_headings',
  { path: z.string(), depthMax: z.number().int().min(1).max(6).optional() },
  async (args) => {
    const abs = await isAllowedFpfPath(String(args.path));
    const text = await readFile(abs, 'utf8');
    const depth = Number(args?.depthMax ?? 6);
    const headings = extractHeadings(text, depth);
    return { content: [{ type: 'text', text: JSON.stringify(headings, null, 2) }] };
  },
);

// 3) Create episteme from a doc or heading (removed: write-only)

// 4) Version and ping
mcp.tool('fpf.version', {}, () => ({ content: [{ type: 'text', text: JSON.stringify({ name: pkg.name, version: pkg.version }) }] }));
mcp.tool('fpf.ping', {}, () => ({ content: [{ type: 'text', text: 'pong' }] }));

// 5) Resource template for docs: fpf://doc/{path}
const docTemplate = new ResourceTemplate('fpf://doc/{path}', {
  list: async () => {
    const docs = await listWhitelistedFpfDocs();
    return { resources: docs.map((p) => ({ uri: `fpf://doc/${encodeURIComponent(p)}`, name: p, mimeType: 'text/markdown' })) };
  },
});

mcp.resource('FPF docs', docTemplate, { mimeType: 'text/markdown' }, async (_uri, variables) => {
  const rel = decodeURIComponent(String(variables.path || ''));
  const abs = await isAllowedFpfPath(rel);
  const text = await readFile(abs, 'utf8');
  return { contents: [{ uri: `fpf://doc/${encodeURIComponent(rel)}`, mimeType: 'text/markdown', text }] };
});

// Phase 2 – tags & docRefs helpers (write operations removed)

mcp.tool(
  'fpf.search_tags',
  { text: z.string().optional() },
  async (args) => {
    const q = String(args.text || '').toLowerCase();
    const eps = await listEpistemes();
    const counts = new Map<string, number>();
    for (const e of eps) for (const t of e.tags || []) counts.set(t, (counts.get(t) || 0) + 1);
    let arr = Array.from(counts.entries()).map(([tag, count]) => ({ tag, count }));
    if (q) arr = arr.filter(({ tag }) => tag.toLowerCase().includes(q));
    arr.sort((a, b) => b.count - a.count);
    return { content: [{ type: 'text', text: JSON.stringify(arr) }] };
  },
);

mcp.tool(
  'fpf.list_tags',
  {},
  async () => {
    const eps = await listEpistemes();
    const tags = Array.from(new Set(eps.flatMap((e) => e.tags || [])));
    tags.sort();
    return { content: [{ type: 'text', text: JSON.stringify(tags) }] };
  },
);


mcp.tool(
  'fpf.list_doc_refs',
  { id: z.string() },
  async (args) => {
    const ep = await getEpistemeById(String(args.id));
    if (!ep) throw new Error('Not found');
    return { content: [{ type: 'text', text: JSON.stringify(ep.docRefs || []) }] };
  },
);


// (write tools removed) backup/restore

// (write tools removed) imports and generation

// Maintain a map of active SSE transports by sessionId for routing POST messages
const sessions = new Map<string, SSEServerTransport>();
const sessionActivity = new Map<string, number>(); // sessionId -> last activity timestamp
const SESSION_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour
const MAX_CONCURRENT_SESSIONS = 100;

// Periodic cleanup of stale sessions (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  const stale: string[] = [];
  for (const [sessionId, lastActivity] of sessionActivity.entries()) {
    if (now - lastActivity > SESSION_TIMEOUT_MS) {
      stale.push(sessionId);
    }
  }
  for (const sessionId of stale) {
    console.log(`[cleanup] Removing stale session: ${sessionId}`);
    sessions.delete(sessionId);
    sessionActivity.delete(sessionId);
  }
  if (stale.length > 0) {
    console.log(`[cleanup] Removed ${stale.length} stale session(s), ${sessions.size} active`);
  }
}, 5 * 60 * 1000);

// Rate limiting configuration
const RATE_LIMIT_REQUESTS = Number(process.env.FPF_RATE_LIMIT) || 100; // requests per window
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window
const rateLimits = new Map<string, { count: number; resetAt: number }>();

// Periodic cleanup of rate limit entries (every minute)
setInterval(() => {
  const now = Date.now();
  for (const [ip, limit] of rateLimits.entries()) {
    if (now > limit.resetAt) {
      rateLimits.delete(ip);
    }
  }
}, RATE_LIMIT_WINDOW_MS);

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const limit = rateLimits.get(ip);

  if (!limit || now > limit.resetAt) {
    rateLimits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (limit.count >= RATE_LIMIT_REQUESTS) {
    return false; // Rate limited
  }

  limit.count++;
  return true;
}

// Request body size limiting
const MAX_BODY_SIZE = Number(process.env.FPF_MAX_BODY_SIZE) || 1 * 1024 * 1024; // 1MB default

function checkBodySize(req: http.IncomingMessage): Promise<void> {
  return new Promise((resolve, reject) => {
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error(`Request body too large (max ${MAX_BODY_SIZE} bytes)`));
      }
    });
    req.on('end', () => resolve());
    req.on('error', reject);
  });
}

async function main() {
  const port = Number(process.env.PORT || 8080);
  // CORS configuration: default to localhost only, can be overridden with FPF_CORS_ORIGIN
  // Set to '*' for permissive mode (not recommended for production)
  const allowedOrigin = process.env.FPF_CORS_ORIGIN || 'http://localhost:3000';
  console.log(`CORS allowed origin: ${allowedOrigin}`);

  const server = http.createServer(async (req, res) => {
    // Validate CORS origin if not wildcard
    const requestOrigin = req.headers.origin;
    let corsOrigin = allowedOrigin;

    // If allowedOrigin is not '*', validate the request origin matches
    if (allowedOrigin !== '*' && requestOrigin && requestOrigin !== allowedOrigin) {
      corsOrigin = ''; // Don't set CORS header for disallowed origins
    }

    // Add CORS headers to all responses
    const corsHeaders: Record<string, string> = {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
      'Access-Control-Max-Age': '86400',
    };

    // Only add Origin header if validated
    if (corsOrigin) {
      corsHeaders['Access-Control-Allow-Origin'] = corsOrigin;
    }

    try {
      const url = new URL(req.url ?? '/', 'http://localhost');

      // Handle preflight OPTIONS requests
      if (req.method === 'OPTIONS') {
        res.writeHead(204, corsHeaders);
        res.end();
        return;
      }

      // Check rate limit (skip for health checks)
      if (url.pathname !== '/health') {
        const ip = req.socket.remoteAddress || 'unknown';
        if (!checkRateLimit(ip)) {
          res.writeHead(429, { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' });
          res.end(JSON.stringify({
            error: 'Too many requests',
            message: `Rate limit exceeded: ${RATE_LIMIT_REQUESTS} requests per minute`,
            retryAfter: 60
          }));
          return;
        }
      }

      if (req.method === 'GET' && url.pathname === '/sse') {
        // Enforce concurrent session limit
        if (sessions.size >= MAX_CONCURRENT_SESSIONS) {
          res.writeHead(503, { ...corsHeaders, 'Content-Type': 'text/plain' });
          res.end(`Too many concurrent sessions (max ${MAX_CONCURRENT_SESSIONS})`);
          return;
        }
        // Validate Host header to prevent DNS rebinding attacks
        const host = req.headers.host;
        // Read allowed hosts from env var, default to localhost addresses
        const allowedHostsEnv = process.env.FPF_ALLOWED_HOSTS || 'localhost,127.0.0.1,[::1]';
        const allowedHosts = allowedHostsEnv.split(',').map(h => h.trim());
        const isAllowedHost = allowedHosts.some(h => host?.startsWith(h + ':') || host === h);
        if (!isAllowedHost && process.env.FPF_SKIP_HOST_CHECK !== '1') {
          res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'Invalid Host header',
            message: `Host '${host}' not allowed. Set FPF_SKIP_HOST_CHECK=1 to disable this check or configure FPF_ALLOWED_HOSTS.`,
            allowedHosts
          }));
          return;
        }

        // SSE already sets its own headers, but add CORS
        const transport = new SSEServerTransport('/messages', res, {
          // Re-enable DNS rebinding protection (can be disabled with env var above)
          enableDnsRebindingProtection: true,
        });
        // When the connection closes, clean up the session
        transport.onclose = () => {
          sessions.delete(transport.sessionId);
          sessionActivity.delete(transport.sessionId);
          console.log(`Session closed: ${transport.sessionId}`);
        };
        sessions.set(transport.sessionId, transport);
        sessionActivity.set(transport.sessionId, Date.now());
        console.log(`New SSE session: ${transport.sessionId} (${sessions.size} active)`);
        await mcp.connect(transport); // connect() will call transport.start()
        return;
      }

      if (req.method === 'POST' && url.pathname === '/messages') {
        // Check body size via Content-Length header
        const contentLength = parseInt(req.headers['content-length'] || '0', 10);
        if (contentLength > MAX_BODY_SIZE) {
          res.writeHead(413, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'Payload too large',
            message: `Request body too large: ${contentLength} bytes (max ${MAX_BODY_SIZE} bytes)`,
            maxSize: MAX_BODY_SIZE
          }));
          return;
        }

        const sessionId = url.searchParams.get('sessionId');
        const transport = sessionId ? sessions.get(sessionId) : undefined;
        if (!transport) {
          res.writeHead(404, { ...corsHeaders, 'Content-Type': 'text/plain' });
          res.end('Unknown session');
          return;
        }
        // Update activity timestamp
        if (sessionId) {
          sessionActivity.set(sessionId, Date.now());
        }
        // handlePostMessage will set its own status and headers
        await transport.handlePostMessage(req, res);
        return;
      }

      if (req.method === 'GET' && url.pathname === '/health') {
        res.writeHead(200, { ...corsHeaders, 'Content-Type': 'text/plain' });
        res.end('ok');
        return;
      }

      // 404 for unknown paths
      res.writeHead(404, { ...corsHeaders, 'Content-Type': 'text/plain' });
      res.end('Not found');
    } catch (err) {
      console.error('Request error:', err);
      try {
        res.writeHead(500, { ...corsHeaders, 'Content-Type': 'text/plain' });
        res.end('Internal server error');
      } catch {
        // ignore, connection may be closed
      }
    }
  });

  await new Promise<void>((resolve) => server.listen(port, '0.0.0.0', () => resolve()));
  const { port: bound } = server.address() as AddressInfo;
  console.log(`FPF MCP SSE listening at http://0.0.0.0:${bound}/sse`);

  // Graceful shutdown handling
  let isShuttingDown = false;

  const gracefulShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\n${signal} received, starting graceful shutdown...`);

    // Stop accepting new connections
    server.close(() => {
      console.log('HTTP server closed');
    });

    // Close all active SSE sessions
    console.log(`Closing ${sessions.size} active session(s)...`);
    for (const [sessionId, transport] of sessions.entries()) {
      try {
        await transport.close();
        console.log(`  Session ${sessionId} closed`);
      } catch (err) {
        console.error(`  Failed to close session ${sessionId}:`, err);
      }
    }
    sessions.clear();
    sessionActivity.clear();

    // Close database connection
    closeDatabase();
    console.log('Database connection closed');

    console.log('Graceful shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
