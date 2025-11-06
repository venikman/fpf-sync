#!/usr/bin/env bun
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { listWhitelistedFpfDocs, isAllowedFpfPath, findMainFpfSpec, extractTopicsFromMarkdown, extractHeadings } from './util.ts';
import { listEpistemes, getEpistemeById } from './store.ts';
import { readFile } from 'node:fs/promises';
import process from "node:process";
import { closeDatabase } from './storage/sqlite.ts';

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

// (write tool removed) bulk_create_epistemes

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

// (write tool removed) create_episteme_from_doc

mcp.tool('fpf.version', {}, () => ({ content: [{ type: 'text', text: JSON.stringify({ name: pkg.name, version: pkg.version }) }] }));
mcp.tool('fpf.ping', {}, () => ({ content: [{ type: 'text', text: 'pong' }] }));

const docTemplate2 = new ResourceTemplate('fpf://doc/{path}', {
  list: async () => {
    const docs = await listWhitelistedFpfDocs();
    return { resources: docs.map((p) => ({ uri: `fpf://doc/${encodeURIComponent(p)}`, name: p, mimeType: 'text/markdown' })) };
  },
});

mcp.resource('FPF docs', docTemplate2, { mimeType: 'text/markdown' }, async (_uri, variables) => {
  const rel = decodeURIComponent(String(variables.path || ''));
  const abs = await isAllowedFpfPath(rel);
  const text = await readFile(abs, 'utf8');
  return { contents: [{ uri: `fpf://doc/${encodeURIComponent(rel)}`, mimeType: 'text/markdown', text }] };
});

// Phase 2 & 3 tools are in the SSE server; stdio variant can be kept lean.

// Prompts (optional) — omitted in MVP to simplify typings; can be re-added later.

async function main() {
  const transport = new StdioServerTransport();
  await mcp.connect(transport);

  // Graceful shutdown handling
  let isShuttingDown = false;

  const gracefulShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.error(`${signal} received, starting graceful shutdown...`);

    // Close MCP transport
    try {
      await transport.close();
      console.error('MCP transport closed');
    } catch (err) {
      console.error('Failed to close MCP transport:', err);
    }

    // Close database connection
    closeDatabase();
    console.error('Database connection closed');

    console.error('Graceful shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
