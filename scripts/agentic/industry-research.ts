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
  const sourcesList = items.map(i => `- ${i.title} (${i.source}${i.date ? ", " + i.date : ""}) — ${i.url}`).join("\n");
  return `You are a research assistant. Produce a concise, high-signal daily industry research report focused on updates that could impact the First Principles Framework (FPF).

FPF core topics (derived from the repository document): ${topics.join(", ")}

Consider only the following sources (do not invent links):
${sourcesList}

Constraints:
- Do not produce code changes.
- Base your analysis strictly on the supplied sources and FPF topics.
- Output must be markdown only. No YAML frontmatter.

Report structure:
1. Executive Summary (3–6 bullets)
2. Notable News and Releases (use only items listed above; for each use [name](url) — one-line context)
3. Tech Trends Relevant to FPF (1–3 short paragraphs linking the items to FPF)
4. Opportunities and Risks (bullets)
5. Sources (bullet list of the links above)

Include a final note:
> AI-generated content by this workflow may contain mistakes.`;
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
  } catch (err: any) {
    await writeSummary(`❌ Failed to generate report: ${err?.message || String(err)}`);
    process.exitCode = 1;
  }
}

// Optional: Mastra integration (stub).
// If you later decide to orchestrate tools/agents with Mastra, you could dynamically import
// the library here and route the prompt through a Mastra agent that uses Gemini provider.
// Keeping this comment as a pointer without adding a hard runtime dependency.

run();

