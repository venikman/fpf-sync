#!/usr/bin/env -S deno run --allow-read --allow-env --allow-net --allow-write
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { z } from 'zod';
import { listWhitelistedFpfDocs, isAllowedFpfPath, findMainFpfSpec, extractTopicsFromMarkdown, extractHeadings } from './util.ts';
import { listEpistemes, getEpistemeById } from './store.ts';
import { readFile } from 'node:fs/promises';
import process from "node:process";

// Basic server info
const pkg = { name: 'fpf-mcp', version: '0.1.0' };

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
  const abs = isAllowedFpfPath(rel);
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
    const abs = isAllowedFpfPath(String(args.path));
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
    const abs = isAllowedFpfPath(rel);
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
      const abs = isAllowedFpfPath(p);
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
    const abs = isAllowedFpfPath(String(args.path));
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
  const abs = isAllowedFpfPath(rel);
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

async function main() {
  const port = Number(process.env.PORT || 8080);
  const server = http.createServer(async (req, res) => {
    // Add CORS headers to all responses
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
      'Access-Control-Max-Age': '86400',
    };

    try {
      const url = new URL(req.url ?? '/', 'http://localhost');

      // Handle preflight OPTIONS requests
      if (req.method === 'OPTIONS') {
        res.writeHead(204, corsHeaders);
        res.end();
        return;
      }

      if (req.method === 'GET' && url.pathname === '/sse') {
        // SSE already sets its own headers, but add CORS
        const transport = new SSEServerTransport('/messages', res, {
          // Disable DNS rebinding protection for local development
          enableDnsRebindingProtection: false,
        });
        // When the connection closes, clean up the session
        transport.onclose = () => {
          sessions.delete(transport.sessionId);
          console.log(`Session closed: ${transport.sessionId}`);
        };
        sessions.set(transport.sessionId, transport);
        console.log(`New SSE session: ${transport.sessionId}`);
        await mcp.connect(transport); // connect() will call transport.start()
        return;
      }

      if (req.method === 'POST' && url.pathname === '/messages') {
        const sessionId = url.searchParams.get('sessionId');
        const transport = sessionId ? sessions.get(sessionId) : undefined;
        if (!transport) {
          res.writeHead(404, { ...corsHeaders, 'Content-Type': 'text/plain' });
          res.end('Unknown session');
          return;
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
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
