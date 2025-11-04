#!/usr/bin/env bun

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

const SPEC_PATH = "yadisk/First Principles Framework — Core Conceptual Specification (holonic).md";
const JOURNAL_PATH = "docs/research/fpf-pattern-journal.md";

interface Pattern {
  series: string;
  id: string;
  title: string;
  subtitle?: string;
}

const SERIES_LABELS: Record<string, string> = {
  A: "Constitutional",
  B: "Reasoning",
  C: "Architheory",
  D: "Ethics",
  E: "Operational",
  F: "Operational",
  G: "Operational",
};

const INTEGRATION_CLUSTERS: Record<string, string[]> = {
  "Generative Search": ["C.17", "C.18", "C.18.1", "C.19", "C.19.1", "A.0"],
  "Agentic Systems": ["A.13", "C.9", "C.24", "E.16"],
  Assurance: ["B.3", "B.3.3", "B.3.4", "B.3.5"],
  "Method Selection": ["C.22", "C.23", "G.5"],
};

function getEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim().length ? value.trim() : fallback;
}

function readSpecFile(): string {
  if (!existsSync(SPEC_PATH)) {
    throw new Error(`Spec file not found at ${SPEC_PATH}`);
  }
  return readFileSync(SPEC_PATH, "utf8");
}

function parsePatterns(markdown: string): Record<string, Pattern> {
  const lines = markdown.split(/\r?\n/);
  const colonHeader = /^##\s*([A-G])\.(\d+(?:\.\d+)*)\s*:\s*(.+?)(?:\s+—\s+(.+))?\s*$/;
  const dashHeader = /^##\s*([A-G])\.(\d+(?:\.\d+)*)\s*—\s*(.+?)(?:\s*\((.+)\))?\s*$/;
  const patterns: Record<string, Pattern> = {};

  for (const line of lines) {
    let match = colonHeader.exec(line);
    if (!match) {
      match = dashHeader.exec(line);
    }
    if (!match) continue;
    const [, series, id, rawTitle, rawSubtitle] = match;
    const key = `${series}.${id}`;
    patterns[key] = {
      series,
      id,
      title: rawTitle.trim(),
      subtitle: rawSubtitle?.trim() || undefined,
    };
  }

  return patterns;
}

function countBySeries(patterns: Record<string, Pattern>): Record<string, number> {
  const counter: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0 };
  for (const { series } of Object.values(patterns)) {
    counter[series] = (counter[series] ?? 0) + 1;
  }
  return counter;
}

function ensureDirForFile(path: string): void {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
}

function buildJournal(markdown: string): string {
  const patterns = parsePatterns(markdown);
  const totals = countBySeries(patterns);
  const totalPatterns = Object.keys(patterns).length;

  const today = new Date().toISOString().slice(0, 10);
  const runId = getEnv("GITHUB_RUN_ID", "local");
  const commit = getEnv("GITHUB_SHA", "local").slice(0, 7);

  const lines: string[] = [];
  lines.push("# FPF Pattern Journal");
  lines.push("");
  lines.push("This log tracks new or substantially revised behavioral patterns detected in the First Principles Framework specification.");
  lines.push(`## ${today} — Run ${runId}`);
  lines.push("\n**Commit:** " + commit);
  lines.push("");
  lines.push(`**Scan Summary:** Parsed TOC-aligned headings and catalogued ${totalPatterns} distinct pattern identifiers across Parts A–G.`);
  lines.push("");
  lines.push("### Pattern Categories Identified");
  lines.push(`- Constitutional (A): ${totals.A}`);
  lines.push(`- Reasoning (B): ${totals.B}`);
  lines.push(`- Architheory (C): ${totals.C}`);
  lines.push(`- Ethics (D): ${totals.D}`);
  const operationalTotal = (totals.E ?? 0) + (totals.F ?? 0) + (totals.G ?? 0);
  lines.push(`- Operational (E–G): ${operationalTotal}`);
  lines.push("");
  lines.push("### Integration Clusters");
  for (const [cluster, ids] of Object.entries(INTEGRATION_CLUSTERS)) {
    lines.push(`- **${cluster}**: ${ids.join(", ")}`);
  }
  lines.push("");
  lines.push("### Methodology");
  lines.push("- Parsed specification headings matching `## {Series}.{Id}: {Title} — {Subtitle}`");
  lines.push("- Counted unique pattern identifiers per series");
  lines.push("- Mirrored integration cluster groupings used in prior research logs");
  lines.push("- Captured runtime metadata from the CI environment (run id, commit)");

  return lines.join("\n");
}

function main(): void {
  const markdown = readSpecFile();
  const journal = buildJournal(markdown);
  ensureDirForFile(JOURNAL_PATH);
  writeFileSync(JOURNAL_PATH, journal, "utf8");
  console.log(`Wrote ${JOURNAL_PATH}`);
}

try {
  main();
} catch (error) {
  console.error("pattern-research failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
