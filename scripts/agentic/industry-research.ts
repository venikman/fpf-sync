#!/usr/bin/env bun
/**
 * Daily Industry Research (TypeScript) using Gemini via @google/generative-ai
 * - No issues/PRs, writes to GitHub Actions Job Summary only
 * - Designed to run under Bun (faster TS execution, no build step)
 * - Optionally adaptable to Mastra if you want a richer agent runtime later
 */

import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Use the official Google Generative AI SDK for Node
// npm/bun: @google/generative-ai
import { GoogleGenerativeAI } from "@google/generative-ai";
import { XMLParser } from "fast-xml-parser";

const REQUEST_TIMEOUT_MS = Number.parseInt(process.env.REQUEST_TIMEOUT_MS || "8000", 10);
const ARXIV_CONTACT = process.env.ARXIV_CONTACT || ""; // optional, e.g., email for arXiv policy compliance
const UA_BASE = "fpf-sync/industry-research (+https://github.com/venikman/fpf-sync)";
const UA = ARXIV_CONTACT ? `${UA_BASE} (contact: ${ARXIV_CONTACT})` : UA_BASE;

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

// Small helper: env access with validation (typed overloads)
function getEnv(name: string, required: true): string;
function getEnv(name: string, required?: false): string | undefined;
function getEnv(name: string, required = false): string | undefined {
  const v = process.env[name];
  if (required && (!v || v.trim() === "")) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

async function writeSummary(text: string, opts?: { header?: boolean }) {
  const summaryPath = getEnv("GITHUB_STEP_SUMMARY");
  const header = opts?.header ?? false;

  if (summaryPath) {
    const path = resolve(summaryPath);
    const prefix = header ? "# Daily Industry Research Report\n\n" : "";
    await appendFile(path, prefix + text + (text.endsWith("\n") ? "" : "\n"), "utf8");
  } else {
    // Fallback to stdout if not in Actions
    if (header) process.stdout.write("# Daily Industry Research Report\n\n");
    process.stdout.write(text + (text.endsWith("\n") ? "" : "\n"));
  }
}

type SourceItem = {
  title: string;
  url: string;
  date?: string;
  source: "arXiv" | "Crossref";
};

const FPF_PATH = "yadisk/First Principles Framework — Core Conceptual Specification (holonic).md";

function extractTopicsFromFpf(text: string, maxTopics = 8): string[] {
  const headingRegex = /^#{1,6}\s+(.+)$/gm;
  const headings: string[] = [];
  for (const m of text.matchAll(headingRegex)) {
    headings.push(m[1]);
  }
  const words = headings
    .join(" ")
    .toLowerCase()
    .match(/[a-z][a-z\-]{3,}/g) ?? [];
  const stop = new Set([
    "with","from","that","this","into","about","within","between","those","these","using","through","their","there",
    "your","ours","mine","ourselves","itself","it","them","they","also","over","under","have","has","been",
    "core","conceptual","framework","first","principles","introduction","summary","chapter","section","appendix",
  ]);
  const freq = new Map<string, number>();
  for (const w of words) {
    if (stop.has(w)) continue;
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w);
  // Always include 'holonic' if present in the document
  if (text.toLowerCase().includes("holonic") && !sorted.includes("holonic")) {
    sorted.unshift("holonic");
  }
  return sorted.slice(0, maxTopics);
}

async function fetchArxiv(keyword: string, maxResults = 3): Promise<SourceItem[]> {
  const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(keyword)}&sortBy=submittedDate&sortOrder=descending&start=0&max_results=${maxResults}`;
  try {
    const res = await fetchWithTimeout(url, { headers: { "User-Agent": UA, Accept: "application/atom+xml" } });
    if (!res.ok) {
      console.error(`arXiv API failed for '${keyword}': ${res.status} ${res.statusText}`);
      return [];
    }
    const xml = await res.text();
    const parser = new XMLParser({ ignoreAttributes: false });
    const data = parser.parse(xml);
    const entries = (data?.feed?.entry ?? []) as any[];
    return entries.slice(0, maxResults).map((e) => ({
      title: String(e.title ?? "Untitled").replace(/\s+/g, " ").trim(),
      url: typeof e.link === "object" ? e.link[0]?.["@_href"] ?? e.link?.["@_href"] ?? "" : "",
      date: e.published ?? e.updated ?? undefined,
      source: "arXiv" as const,
    })).filter(i => i.url);
  } catch (err) {
    console.error(`Error querying arXiv for '${keyword}':`, err);
    return [];
  }
}

async function fetchCrossref(keyword: string, rows = 3): Promise<SourceItem[]> {
  const url = `https://api.crossref.org/works?query=${encodeURIComponent(keyword)}&rows=${rows}&sort=published&order=desc`;
  try {
    const res = await fetchWithTimeout(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!res.ok) {
      console.error(`Crossref API failed for '${keyword}': ${res.status} ${res.statusText}`);
      return [];
    }
    const json = await res.json();
    const items = json?.message?.items ?? [];
    return items.slice(0, rows).map((it: any) => {
      const title = Array.isArray(it.title) ? it.title[0] : (it.title || "Untitled");
      const dateParts = it.published?.["date-parts"]?.[0] || it["published-print"]?.["date-parts"]?.[0] || it["published-online"]?.["date-parts"]?.[0] || [];
      const date = dateParts.length ? dateParts.join("-") : undefined;
      return {
        title: String(title).replace(/\s+/g, " ").trim(),
        url: it.URL || (it.DOI ? `https://doi.org/${it.DOI}` : ""),
        date,
        source: "Crossref" as const,
      } satisfies SourceItem;
    }).filter((i: SourceItem) => i.url);
  } catch (err) {
    console.error(`Error querying Crossref for '${keyword}':`, err);
    return [];
  }
}

function dedupeItems(items: SourceItem[]): SourceItem[] {
  const seen = new Set<string>();
  const out: SourceItem[] = [];
  for (const it of items) {
    const key = (it.title.toLowerCase() + "|" + it.url.toLowerCase()).slice(0, 500);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

function buildPrompt(topics: string[], items: SourceItem[]): string {
  const sourcesList = items
    .map((i, idx) => `[${idx + 1}] ${i.title} (${i.source}${i.date ? ", " + i.date : ""}) — ${i.url}`)
    .join("\n");

  return `You are an FPF-aligned research analyst. Produce a concise, high-signal daily research note strictly grounded in the numbered sources and aligned to the First Principles Framework (FPF).

FPF core topics (derived from repository document): ${topics.join(", ")}

Numbered sources (cite as [n] inline; do not invent links):
${sourcesList}

Guard-rails (FPF):
- Evidence Anchoring (A.10): every claim MUST be supported by inlined [n] citations from the numbered sources. Omit any claim you cannot support.
- Strict Distinction (A.7): separate informative observations (external facts) from normative recommendations (FPF changes).
- Temporal Duality (A.4): tag impacts with Time: design or run where applicable.
- Lexicon (E.10): use FPF terms; mark Lens: Meta | Macro | Micro when relevant; do not redefine core terms.

Selection & Prioritization:
- Select at most 5 top impacts. Sort by recency, then relevance to the top 3 topics.
- For each selected impact, include a one-line rationale (Why now?).
- Place any remaining items under “Backlog (out of scope today)” with a single phrase each.

Output format (markdown only; no YAML):
1. Executive Summary
   - Bottom line: the most important action/impact today (include [n]).
   - Then 3–5 bullets using this template (≤18 words; max 1 comma; use “—” for clarity):
     - [+|−|±] **Impact keyword**: short claim — Why now: <reason>; Audience: Eng|PM|Research; Recency: New|Recent|Ongoing [n]
   - Rules:
     - Every bullet must include at least one inline citation [n].
     - Use plain English; avoid jargon and nested clauses; no parentheticals (except [n]).
     - Prefer specifics (numbers with units; exact names). No “very”, “some”.
     - Highlight one “Top Action” bullet (prefix with Top Action:).
2. Impact Map to FPF (Top 5)
   - For each impact (one bullet):
     - [n] Title — Impact → FPF elements (patterns/IDs or U.Types if obvious); Lens: Meta/Macro/Micro; Time: design/run; Vector: +opportunity | −risk | ±unclear; Recency: New (≤7d) | Recent (≤30d) | Ongoing (>30d); Why now: short clause. Include [n].
3. Abduction → Deduction → Induction (B.5)
   - Abduction (Top Bet, L0): one prime hypothesis with [n].
   - Deduction (2–4 bullets): testable consequences if the hypothesis holds; each with [n].
   - Induction (2–4 bullets): concrete evidence checks to run next (datasets, experiments, evaluations), each with [n] or “requires new data”.
4. Recommendations & Next State (B.5.1)
   - For each proposed artifact/change: State → Explore | Shape | Evidence | Operate; Rationale with [n]; Confidence: Low | Med | High; Assurance hint (B.3: aim L0→L1 via VA, or L1→L2 via LA).
5. Risks and Opportunities (balanced bullets, each with [n]). Use ≤20 words per bullet. Numeric facts include units and exact values.
6. Backlog (out of scope today)
   - Bulleted list of remaining sources or angles not selected; one short phrase each.
7. Sources
   - Reprint the numbered sources [n].

Constraints:
- Use only the numbered sources. Do not add external links or uncited claims.
- If sources are insufficient, state “insufficient evidence for recommendation” rather than speculating.
- Keep paragraphs ≤3 sentences; keep bullets concise (≤20 words).

Compliance checklist (fill in with Yes/No):
- All sections present; no YAML.
- Every claim has an inline [n].
- Informative vs normative separation is clear.
- Lens and Time tags present for each impact.
- Recommendations include Confidence and Assurance hints.
- Executive Summary includes Bottom line and 3–5 bullets with Audience and Recency tags.

End with:
> AI-generated content via FPF-aligned workflow; may contain mistakes. Unsupported claims were omitted.`;
}

async function run() {
  try {
    const apiKey = getEnv("GOOGLE_AI_API_KEY", true); // required
    const modelName = getEnv("GEMINI_MODEL") || "gemini-1.5-flash";

    await writeSummary("", { header: true });

    // Read FPF file and extract topics
    let fpfRaw = "";
    try {
      fpfRaw = await readFile(FPF_PATH, "utf8");
    } catch (err) {
      await writeSummary(`❌ Failed to read FPF document at '${FPF_PATH}': ${String(err)}`);
      throw err;
    }
    const topics = extractTopicsFromFpf(fpfRaw);

    // Fetch external updates constrained by FPF topics
    const keywords = topics.slice(0, 5);
    const results: SourceItem[] = [];
    for (const kw of keywords) {
      const [ax, cx] = await Promise.all([fetchArxiv(kw, 3), fetchCrossref(kw, 3)]);
      results.push(...ax, ...cx);
    }
    const unique = dedupeItems(results).slice(0, 12);

    if (unique.length === 0) {
      await writeSummary(`No recent external updates found for FPF topics: ${keywords.join(", ")}.\n\nConsider broadening or adjusting topics, or increasing sources.`);
      return;
    }

    const prompt = buildPrompt(topics, unique);

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    if (!text?.trim()) {
      throw new Error("Model returned empty response");
    }

    await writeSummary(text);

    // Post-generation validation (heuristic) and summary append
    const validation = buildValidationSummary(text);
    if (validation.trim()) {
      await writeSummary("\n\n" + validation);
    }
  } catch (err: any) {
    await writeSummary(`❌ Failed to generate report: ${err?.message || String(err)}`);
    process.exitCode = 1;
  }
}

// Optional: Mastra integration (stub).
// If you later decide to orchestrate tools/agents with Mastra, you could dynamically import
// the library here and route the prompt through a Mastra agent that uses Gemini provider.
// Keeping this comment as a pointer without adding a hard runtime dependency.

// --- Simple heuristic validator to encourage compliance with the prompt ---
function between(md: string, startRe: RegExp, endRe: RegExp): string {
  const start = md.search(startRe);
  if (start === -1) return "";
  const tail = md.slice(start);
  const endIdx = tail.search(endRe);
  return endIdx === -1 ? tail : tail.slice(0, endIdx);
}

function countMatches(md: string, re: RegExp): number {
  const m = md.match(re);
  return m ? m.length : 0;
}

function buildValidationSummary(md: string): string {
  const checks: { name: string; ok: boolean; details?: string }[] = [];

  const hasCitations = /\[\d+\]/.test(md);
  checks.push({ name: "Inline citations present", ok: hasCitations });

  const hasExec = /\n\s*1\.\s*Executive Summary/i.test(md);
  checks.push({ name: "Executive Summary section present", ok: hasExec });

  const execSection = hasExec
    ? between(md, /\n\s*1\.\s*Executive Summary/i, /\n\s*2\./)
    : "";
  const hasBottomLine = /Bottom line:\s*.*\[\d+\]/i.test(execSection);
  checks.push({ name: "Bottom line with citation", ok: hasBottomLine });

  const execBullets = execSection
    .split(/\n/)
    .filter((l) => /^\s*[-*]/.test(l));
  const execBulletCountOk = execBullets.length >= 3 && execBullets.length <= 6;
  checks.push({ name: "Executive Summary has 3–6 bullets", ok: execBulletCountOk, details: `found ${execBullets.length}` });

  const execBulletsTagged = execBullets.some((l) => /Audience:\s*(Eng|PM|Research)/i.test(l)) && execBullets.some((l) => /Recency:\s*(New|Recent|Ongoing)/i.test(l));
  checks.push({ name: "Exec bullets include Audience and Recency tags", ok: execBulletsTagged });

  const hasImpactMap = /\n\s*2\.\s*Impact Map to FPF/i.test(md);
  checks.push({ name: "Impact Map section present", ok: hasImpactMap });
  const impactSection = hasImpactMap ? between(md, /\n\s*2\.\s*Impact Map to FPF/i, /\n\s*3\./) : "";
  const impactHasLensTime = /Lens:\s*(Meta|Macro|Micro)/i.test(impactSection) && /Time:\s*(design|run)/i.test(impactSection);
  checks.push({ name: "Impact bullets include Lens and Time tags", ok: impactHasLensTime });

  const hasADI = /Abduction/i.test(md) && /Deduction/i.test(md) && /Induction/i.test(md);
  checks.push({ name: "A→D→I section present", ok: hasADI });

  const hasRecommendations = /Recommendations\s*&\s*Next State/i.test(md);
  checks.push({ name: "Recommendations & Next State present", ok: hasRecommendations });

  const hasSources = /\n\s*7\.\s*Sources/i.test(md) || /\n\s*Sources\s*\n/i.test(md);
  checks.push({ name: "Sources section present", ok: hasSources });

  const allOk = checks.every((c) => c.ok);
  const lines = [
    "## Validation (auto-checks)",
    allOk ? "All key checks passed." : "Some checks failed; consider revising the prompt sections or rerunning.",
    "",
    ...checks.map((c) => `${c.ok ? "✅" : "⚠️"} ${c.name}${c.details ? ` — ${c.details}` : ""}`),
  ];
  return lines.join("\n");
}

run();

