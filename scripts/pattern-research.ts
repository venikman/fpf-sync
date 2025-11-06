#!/usr/bin/env bun

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";

// ============================================================================
// Configuration
// ============================================================================

const SPEC_PATH = "yadisk/First Principles Framework — Core Conceptual Specification (holonic).md";
const JOURNAL_PATH = "reports/fpf-pattern-journal.md";
const HISTORY_DIR = "reports/pattern-history";
const OUTPUT_DIR = "reports/pattern-outputs";

// ============================================================================
// Type Definitions
// ============================================================================

interface Pattern {
  series: string;
  id: string;
  title: string;
  subtitle?: string;
  fullHeading: string;
}

interface PatternChange {
  type: "added" | "removed" | "modified";
  patternId: string;
  pattern?: Pattern;
  oldPattern?: Pattern;
}

interface CrossReference {
  from: string;
  to: string;
  context: string;
}

interface Cluster {
  name: string;
  patterns: string[];
  strength: number; // How many cross-references
}

interface HistoricalSnapshot {
  timestamp: string;
  runId: string;
  commit: string;
  patterns: Record<string, Pattern>;
  totalCount: number;
  seriesCounts: Record<string, number>;
  clusters: Cluster[];
  crossReferences: CrossReference[];
}

interface AnalysisResult {
  changes: PatternChange[];
  newClusters: Cluster[];
  insights: string;
  alertLevel: "none" | "low" | "medium" | "high";
  alertReasons: string[];
}

// ============================================================================
// Constants
// ============================================================================

const SERIES_LABELS: Record<string, string> = {
  A: "Constitutional",
  B: "Reasoning",
  C: "Architheory",
  D: "Ethics",
  E: "Operational",
  F: "Operational",
  G: "Operational",
};

const CORE_PATTERNS = ["A.1", "A.2", "A.3", "A.4", "A.5", "E.2"]; // Core patterns that should trigger high alerts

// ============================================================================
// Utility Functions
// ============================================================================

function getEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim().length ? value.trim() : fallback;
}

function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function ensureDirForFile(path: string): void {
  const dir = dirname(path);
  ensureDir(dir);
}

// ============================================================================
// Pattern Parsing
// ============================================================================

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
    let format: "colon" | "dash" | null = null;

    if (match) {
      format = "colon";
    } else {
      match = dashHeader.exec(line);
      if (match) format = "dash";
    }

    if (!match) continue;

    const [fullMatch, series, id, rawTitle, rawSubtitle] = match;
    const key = `${series}.${id}`;
    patterns[key] = {
      series,
      id,
      title: rawTitle.trim(),
      subtitle: rawSubtitle?.trim() || undefined,
      fullHeading: line.trim(),
    };
  }

  return patterns;
}

// ============================================================================
// Cross-Reference Analysis
// ============================================================================

function findCrossReferences(markdown: string, patterns: Record<string, Pattern>): CrossReference[] {
  const refs: CrossReference[] = [];
  const patternIds = Object.keys(patterns);

  // Pattern to match references like "see A.1", "Pattern C.24", "A.13 defines", etc.
  const refPattern = /\b([A-G]\.\d+(?:\.\d+)*)\b/g;

  const lines = markdown.split(/\r?\n/);
  let currentPattern: string | null = null;

  for (const line of lines) {
    // Check if this line is a pattern heading
    const headingMatch = line.match(/^##\s*([A-G]\.\d+(?:\.\d+)*)/);
    if (headingMatch) {
      currentPattern = headingMatch[1];
      continue;
    }

    // If we're inside a pattern section, look for references
    if (currentPattern && patterns[currentPattern]) {
      const matches = [...line.matchAll(refPattern)];
      for (const match of matches) {
        const referencedId = match[1];
        if (referencedId !== currentPattern && patterns[referencedId]) {
          refs.push({
            from: currentPattern,
            to: referencedId,
            context: line.trim().slice(0, 100),
          });
        }
      }
    }
  }

  return refs;
}

// ============================================================================
// Dynamic Cluster Discovery
// ============================================================================

function discoverClusters(crossRefs: CrossReference[], patterns: Record<string, Pattern>): Cluster[] {
  // Build adjacency map
  const connections = new Map<string, Set<string>>();

  for (const ref of crossRefs) {
    if (!connections.has(ref.from)) {
      connections.set(ref.from, new Set());
    }
    if (!connections.has(ref.to)) {
      connections.set(ref.to, new Set());
    }
    connections.get(ref.from)!.add(ref.to);
    connections.get(ref.to)!.add(ref.from);
  }

  // Find clusters using simple connected components
  const visited = new Set<string>();
  const clusters: Cluster[] = [];

  for (const patternId of Object.keys(patterns)) {
    if (visited.has(patternId)) continue;

    const cluster = new Set<string>();
    const queue = [patternId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;

      visited.add(current);
      cluster.add(current);

      const neighbors = connections.get(current);
      if (neighbors) {
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor) && cluster.size < 10) { // Limit cluster size
            queue.push(neighbor);
          }
        }
      }
    }

    // Only include clusters with multiple patterns
    if (cluster.size >= 2) {
      const clusterPatterns = Array.from(cluster).sort();
      const strength = clusterPatterns.reduce((sum, p) => {
        return sum + (connections.get(p)?.size || 0);
      }, 0);

      clusters.push({
        name: inferClusterName(clusterPatterns, patterns),
        patterns: clusterPatterns,
        strength,
      });
    }
  }

  // Sort by strength
  return clusters.sort((a, b) => b.strength - a.strength);
}

function inferClusterName(patternIds: string[], patterns: Record<string, Pattern>): string {
  // Try to infer a meaningful name from the patterns
  const titles = patternIds.map(id => patterns[id]?.title || id);

  // Simple heuristic: find common words in titles
  const words = titles.flatMap(t => t.toLowerCase().split(/\s+/));
  const wordCounts = new Map<string, number>();

  for (const word of words) {
    if (word.length > 4) { // Ignore short words
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }
  }

  // Find most common meaningful word
  const sorted = Array.from(wordCounts.entries())
    .filter(([_, count]) => count > 1)
    .sort((a, b) => b[1] - a[1]);

  if (sorted.length > 0) {
    return sorted[0][0].charAt(0).toUpperCase() + sorted[0][0].slice(1);
  }

  // Fallback to series-based naming
  const series = patternIds[0].split(".")[0];
  return `${SERIES_LABELS[series] || series} Cluster`;
}

// ============================================================================
// Historical Tracking
// ============================================================================

function saveSnapshot(snapshot: HistoricalSnapshot): void {
  ensureDir(HISTORY_DIR);
  const filename = `${snapshot.timestamp}-${snapshot.runId}.json`;
  const filepath = join(HISTORY_DIR, filename);
  writeFileSync(filepath, JSON.stringify(snapshot, null, 2), "utf8");
}

function getLatestSnapshot(): HistoricalSnapshot | null {
  if (!existsSync(HISTORY_DIR)) {
    return null;
  }

  const files = readdirSync(HISTORY_DIR)
    .filter(f => f.endsWith(".json"))
    .sort()
    .reverse();

  if (files.length === 0) {
    return null;
  }

  const latestFile = join(HISTORY_DIR, files[0]);
  const content = readFileSync(latestFile, "utf8");
  return JSON.parse(content);
}

function getAllSnapshots(): HistoricalSnapshot[] {
  if (!existsSync(HISTORY_DIR)) {
    return [];
  }

  const files = readdirSync(HISTORY_DIR)
    .filter(f => f.endsWith(".json"))
    .sort();

  return files.map(f => {
    const content = readFileSync(join(HISTORY_DIR, f), "utf8");
    return JSON.parse(content);
  });
}

// ============================================================================
// Change Detection
// ============================================================================

function detectChanges(
  currentPatterns: Record<string, Pattern>,
  previousPatterns: Record<string, Pattern> | null
): PatternChange[] {
  if (!previousPatterns) {
    return Object.entries(currentPatterns).map(([id, pattern]) => ({
      type: "added",
      patternId: id,
      pattern,
    }));
  }

  const changes: PatternChange[] = [];

  // Check for added and modified patterns
  for (const [id, pattern] of Object.entries(currentPatterns)) {
    if (!previousPatterns[id]) {
      changes.push({ type: "added", patternId: id, pattern });
    } else {
      const old = previousPatterns[id];
      if (old.title !== pattern.title || old.subtitle !== pattern.subtitle) {
        changes.push({
          type: "modified",
          patternId: id,
          pattern,
          oldPattern: old,
        });
      }
    }
  }

  // Check for removed patterns
  for (const [id, pattern] of Object.entries(previousPatterns)) {
    if (!currentPatterns[id]) {
      changes.push({ type: "removed", patternId: id, pattern });
    }
  }

  return changes;
}

// ============================================================================
// LLM Analysis
// ============================================================================

async function analyzePatternsWithLLM(
  changes: PatternChange[],
  clusters: Cluster[],
  currentSnapshot: HistoricalSnapshot,
  previousSnapshot: HistoricalSnapshot | null
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.log("ℹ️  OPENAI_API_KEY not set - skipping AI analysis");
    return "AI analysis skipped (no API key configured)";
  }

  try {
    const prompt = buildAnalysisPrompt(changes, clusters, currentSnapshot, previousSnapshot);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an expert at analyzing software architecture patterns and frameworks. Provide concise, technical analysis focused on actionable insights."
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 2000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("OpenAI API error:", error);
      return "AI analysis failed (API error)";
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error("AI analysis error:", error);
    return `AI analysis failed: ${error}`;
  }
}

function buildAnalysisPrompt(
  changes: PatternChange[],
  clusters: Cluster[],
  current: HistoricalSnapshot,
  previous: HistoricalSnapshot | null
): string {
  const lines: string[] = [];

  lines.push("You are analyzing changes to the First Principles Framework (FPF) specification patterns.");
  lines.push("");
  lines.push("## Current State");
  lines.push(`- Total patterns: ${current.totalCount}`);
  lines.push(`- Constitutional (A): ${current.seriesCounts.A || 0}`);
  lines.push(`- Reasoning (B): ${current.seriesCounts.B || 0}`);
  lines.push(`- Architheory (C): ${current.seriesCounts.C || 0}`);
  lines.push(`- Ethics (D): ${current.seriesCounts.D || 0}`);
  lines.push(`- Operational (E-G): ${(current.seriesCounts.E || 0) + (current.seriesCounts.F || 0) + (current.seriesCounts.G || 0)}`);
  lines.push("");

  if (previous) {
    lines.push("## Changes from Previous Scan");
    lines.push(`- Patterns added: ${changes.filter(c => c.type === "added").length}`);
    lines.push(`- Patterns modified: ${changes.filter(c => c.type === "modified").length}`);
    lines.push(`- Patterns removed: ${changes.filter(c => c.type === "removed").length}`);
    lines.push("");

    if (changes.length > 0) {
      lines.push("### Detailed Changes:");
      for (const change of changes.slice(0, 10)) { // Limit to avoid token limits
        if (change.type === "added") {
          lines.push(`- **Added ${change.patternId}**: ${change.pattern?.title}`);
          if (change.pattern?.subtitle) {
            lines.push(`  Subtitle: ${change.pattern.subtitle}`);
          }
        } else if (change.type === "modified") {
          lines.push(`- **Modified ${change.patternId}**:`);
          lines.push(`  Old: ${change.oldPattern?.title}`);
          lines.push(`  New: ${change.pattern?.title}`);
        } else {
          lines.push(`- **Removed ${change.patternId}**: ${change.pattern?.title}`);
        }
      }
      lines.push("");
    }
  }

  lines.push("## Discovered Pattern Clusters");
  for (const cluster of clusters.slice(0, 5)) {
    lines.push(`- **${cluster.name}**: ${cluster.patterns.join(", ")} (strength: ${cluster.strength})`);
  }
  lines.push("");

  lines.push("## Task");
  lines.push("Provide a concise 2-3 paragraph analysis covering:");
  lines.push("1. Significance of the changes (architectural, theoretical, operational implications)");
  lines.push("2. Emerging themes or patterns in the evolution");
  lines.push("3. Potential integration points or tensions with existing patterns");
  lines.push("");
  lines.push("Be specific and technical. Focus on actionable insights for framework users.");

  return lines.join("\n");
}

// ============================================================================
// Alert System
// ============================================================================

function determineAlertLevel(changes: PatternChange[], patterns: Record<string, Pattern>): {
  level: "none" | "low" | "medium" | "high";
  reasons: string[];
} {
  const reasons: string[] = [];
  let level: "none" | "low" | "medium" | "high" = "none";

  // High alert: Core patterns changed
  const coreChanges = changes.filter(c => CORE_PATTERNS.includes(c.patternId));
  if (coreChanges.length > 0) {
    level = "high";
    reasons.push(`${coreChanges.length} core pattern(s) changed: ${coreChanges.map(c => c.patternId).join(", ")}`);
  }

  // High alert: Many new patterns
  const added = changes.filter(c => c.type === "added");
  if (added.length >= 5) {
    level = "high";
    reasons.push(`${added.length} new patterns added`);
  }

  // Medium alert: Multiple changes
  if (changes.length >= 3 && level === "none") {
    level = "medium";
    reasons.push(`${changes.length} patterns changed`);
  }

  // Low alert: Minor changes
  if (changes.length > 0 && level === "none") {
    level = "low";
    reasons.push(`${changes.length} pattern(s) updated`);
  }

  return { level, reasons };
}

// ============================================================================
// Output Generation
// ============================================================================

function countBySeries(patterns: Record<string, Pattern>): Record<string, number> {
  const counter: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0 };
  for (const { series } of Object.values(patterns)) {
    counter[series] = (counter[series] ?? 0) + 1;
  }
  return counter;
}

function generateJSON(snapshot: HistoricalSnapshot, analysis: AnalysisResult): string {
  ensureDir(OUTPUT_DIR);
  const output = {
    metadata: {
      timestamp: snapshot.timestamp,
      runId: snapshot.runId,
      commit: snapshot.commit,
    },
    summary: {
      totalPatterns: snapshot.totalCount,
      byCategory: snapshot.seriesCounts,
      alertLevel: analysis.alertLevel,
    },
    changes: analysis.changes,
    patterns: snapshot.patterns,
    clusters: snapshot.clusters,
    crossReferences: snapshot.crossReferences,
    insights: analysis.insights,
  };

  const filepath = join(OUTPUT_DIR, `patterns-${snapshot.timestamp}.json`);
  writeFileSync(filepath, JSON.stringify(output, null, 2), "utf8");
  console.log(`📊 Generated JSON: ${filepath}`);

  return filepath;
}

function generateDependencyGraph(snapshot: HistoricalSnapshot): string {
  const lines: string[] = [];
  lines.push("```mermaid");
  lines.push("graph TD");
  lines.push("");

  // Add nodes for each pattern
  for (const [id, pattern] of Object.entries(snapshot.patterns)) {
    const nodeId = id.replace(".", "_");
    const label = `${id}: ${pattern.title.slice(0, 30)}`;
    lines.push(`  ${nodeId}["${label}"]`);
  }

  lines.push("");

  // Add edges for cross-references (limit to avoid clutter)
  const refCounts = new Map<string, number>();
  for (const ref of snapshot.crossReferences) {
    const key = `${ref.from}->${ref.to}`;
    refCounts.set(key, (refCounts.get(key) || 0) + 1);
  }

  const topRefs = Array.from(refCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30); // Limit to top 30 connections

  for (const [[from, to], _] of topRefs.map(([k, v]) => [k.split("->"), v] as const)) {
    const fromNode = from.replace(".", "_");
    const toNode = to.replace(".", "_");
    lines.push(`  ${fromNode} --> ${toNode}`);
  }

  lines.push("```");

  ensureDir(OUTPUT_DIR);
  const filepath = join(OUTPUT_DIR, `dependency-graph-${snapshot.timestamp}.md`);
  writeFileSync(filepath, lines.join("\n"), "utf8");
  console.log(`📈 Generated dependency graph: ${filepath}`);

  return filepath;
}

function generateMarkdownJournal(
  snapshot: HistoricalSnapshot,
  analysis: AnalysisResult,
  previousJournal: string | null
): string {
  const lines: string[] = [];

  // Header (always at top)
  lines.push("# FPF Pattern Journal");
  lines.push("");
  lines.push("This log tracks the evolution of behavioral patterns in the First Principles Framework specification.");
  lines.push("");
  lines.push("---");
  lines.push("");

  // New entry
  lines.push(`## ${snapshot.timestamp} — Run ${snapshot.runId}`);
  lines.push("");
  lines.push(`**Commit:** ${snapshot.commit}`);
  lines.push("");

  // Alert banner if significant
  if (analysis.alertLevel !== "none") {
    const emoji = analysis.alertLevel === "high" ? "🚨" : analysis.alertLevel === "medium" ? "⚠️" : "ℹ️";
    lines.push(`> ${emoji} **Alert Level: ${analysis.alertLevel.toUpperCase()}**`);
    for (const reason of analysis.alertReasons) {
      lines.push(`> - ${reason}`);
    }
    lines.push("");
  }

  // Summary
  lines.push("### Summary");
  lines.push(`- **Total Patterns**: ${snapshot.totalCount}`);
  lines.push(`- **Constitutional (A)**: ${snapshot.seriesCounts.A || 0}`);
  lines.push(`- **Reasoning (B)**: ${snapshot.seriesCounts.B || 0}`);
  lines.push(`- **Architheory (C)**: ${snapshot.seriesCounts.C || 0}`);
  lines.push(`- **Ethics (D)**: ${snapshot.seriesCounts.D || 0}`);
  const opTotal = (snapshot.seriesCounts.E || 0) + (snapshot.seriesCounts.F || 0) + (snapshot.seriesCounts.G || 0);
  lines.push(`- **Operational (E–G)**: ${opTotal}`);
  lines.push("");

  // Changes
  if (analysis.changes.length > 0) {
    lines.push("### Changes Detected");

    const added = analysis.changes.filter(c => c.type === "added");
    const modified = analysis.changes.filter(c => c.type === "modified");
    const removed = analysis.changes.filter(c => c.type === "removed");

    if (added.length > 0) {
      lines.push(`- **Added**: ${added.length} pattern(s)`);
      for (const change of added) {
        lines.push(`  - **${change.patternId}**: ${change.pattern?.title}`);
        if (change.pattern?.subtitle) {
          lines.push(`    - *${change.pattern.subtitle}*`);
        }
      }
    }

    if (modified.length > 0) {
      lines.push(`- **Modified**: ${modified.length} pattern(s)`);
      for (const change of modified) {
        lines.push(`  - **${change.patternId}**`);
        lines.push(`    - Was: ${change.oldPattern?.title}`);
        lines.push(`    - Now: ${change.pattern?.title}`);
      }
    }

    if (removed.length > 0) {
      lines.push(`- **Removed**: ${removed.length} pattern(s)`);
      for (const change of removed) {
        lines.push(`  - **${change.patternId}**: ${change.pattern?.title}`);
      }
    }

    lines.push("");
  } else {
    lines.push("### Changes Detected");
    lines.push("No changes from previous scan.");
    lines.push("");
  }

  // Clusters
  if (analysis.newClusters.length > 0) {
    lines.push("### Pattern Clusters");
    lines.push("");
    for (const cluster of analysis.newClusters) {
      lines.push(`**${cluster.name}** (strength: ${cluster.strength})`);
      lines.push(`- Patterns: ${cluster.patterns.join(", ")}`);
      lines.push("");
    }
  }

  // LLM Insights
  if (analysis.insights && analysis.insights.length > 0 && !analysis.insights.includes("skipped")) {
    lines.push("### AI Analysis");
    lines.push("");
    lines.push(analysis.insights);
    lines.push("");
  }

  lines.push("---");
  lines.push("");

  // Append previous journal entries
  if (previousJournal) {
    const previousLines = previousJournal.split("\n");
    let startAppending = false;

    for (const line of previousLines) {
      // Start appending after the first "---" separator
      if (line.trim() === "---" && !startAppending) {
        startAppending = true;
        continue;
      }

      if (startAppending) {
        lines.push(line);
      }
    }
  }

  return lines.join("\n");
}

// ============================================================================
// Main Analysis Pipeline
// ============================================================================

async function main(): Promise<void> {
  console.log("🔍 FPF Pattern Research - Enhanced Analysis");
  console.log("============================================");
  console.log("");

  // Read spec
  console.log("📖 Reading specification...");
  const markdown = readSpecFile();

  // Parse patterns
  console.log("🔬 Parsing patterns...");
  const patterns = parsePatterns(markdown);
  console.log(`   Found ${Object.keys(patterns).length} patterns`);

  // Find cross-references
  console.log("🔗 Analyzing cross-references...");
  const crossRefs = findCrossReferences(markdown, patterns);
  console.log(`   Found ${crossRefs.length} cross-references`);

  // Discover clusters
  console.log("🧩 Discovering pattern clusters...");
  const clusters = discoverClusters(crossRefs, patterns);
  console.log(`   Found ${clusters.length} clusters`);

  // Create current snapshot
  const timestamp = new Date().toISOString().slice(0, 19).replace("T", "_").replace(/:/g, "-");
  const runId = getEnv("GITHUB_RUN_ID", "local");
  const commit = getEnv("GITHUB_SHA", "local").slice(0, 7);
  const seriesCounts = countBySeries(patterns);

  const currentSnapshot: HistoricalSnapshot = {
    timestamp,
    runId,
    commit,
    patterns,
    totalCount: Object.keys(patterns).length,
    seriesCounts,
    clusters,
    crossReferences: crossRefs,
  };

  // Get previous snapshot
  console.log("📚 Loading historical data...");
  const previousSnapshot = getLatestSnapshot();

  // Detect changes
  console.log("🔎 Detecting changes...");
  const changes = detectChanges(patterns, previousSnapshot?.patterns || null);
  console.log(`   ${changes.length} changes detected`);

  // Determine alert level
  const { level: alertLevel, reasons: alertReasons } = determineAlertLevel(changes, patterns);
  if (alertLevel !== "none") {
    console.log(`   ⚠️  Alert level: ${alertLevel}`);
  }

  // LLM analysis
  console.log("🤖 Running AI analysis...");
  const insights = await analyzePatternsWithLLM(changes, clusters, currentSnapshot, previousSnapshot);

  const analysis: AnalysisResult = {
    changes,
    newClusters: clusters,
    insights,
    alertLevel,
    alertReasons,
  };

  // Save snapshot
  console.log("💾 Saving snapshot...");
  saveSnapshot(currentSnapshot);

  // Generate outputs
  console.log("📝 Generating outputs...");
  generateJSON(currentSnapshot, analysis);
  generateDependencyGraph(currentSnapshot);

  // Update markdown journal
  const previousJournal = existsSync(JOURNAL_PATH) ? readFileSync(JOURNAL_PATH, "utf8") : null;
  const newJournal = generateMarkdownJournal(currentSnapshot, analysis, previousJournal);
  ensureDirForFile(JOURNAL_PATH);
  writeFileSync(JOURNAL_PATH, newJournal, "utf8");
  console.log(`📄 Updated journal: ${JOURNAL_PATH}`);

  // Summary
  console.log("");
  console.log("✅ Analysis complete!");
  console.log(`   Total patterns: ${currentSnapshot.totalCount}`);
  console.log(`   Changes: ${changes.length}`);
  console.log(`   Clusters: ${clusters.length}`);
  console.log(`   Alert level: ${alertLevel}`);

  // Exit with code based on whether there are changes
  if (changes.length > 0) {
    console.log("");
    console.log("📢 Changes detected - workflow should create PR");
    process.exitCode = 0;
  } else {
    console.log("");
    console.log("✓ No changes - no PR needed");
    process.exitCode = 0;
  }
}

// ============================================================================
// Entry Point
// ============================================================================

try {
  await main();
} catch (error) {
  console.error("❌ pattern-research failed:", error instanceof Error ? error.message : error);
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  process.exitCode = 1;
}
