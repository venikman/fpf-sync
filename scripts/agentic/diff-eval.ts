#!/usr/bin/env bun

import { promisify } from "node:util";
import { exec } from "node:child_process";
import { runWarpAgent } from "../agents/warp-agent-client.ts";

const execAsync = promisify(exec);

function env(name: string, fallback?: string): string {
  const v = process.env[name];
  return v && v.trim().length ? v.trim() : (fallback ?? "");
}

async function getDiff(baseRef: string, targetPath: string): Promise<string> {
  // Ensure base exists; fallback to main or previous commit
  const candidates = [baseRef, "origin/" + baseRef, "origin/main", "HEAD~1"]; 
  let base = "";
  for (const c of candidates) {
    try {
      await execAsync(`git rev-parse --verify --quiet ${c}`);
      base = c; break;
    } catch {}
  }
  if (!base) base = "HEAD~1";

  const cmd = `git --no-pager diff --no-color --unified=5 ${base}...HEAD -- "${targetPath}"`;
  const { stdout } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
  return stdout.trim();
}

function buildPrompt(filePath: string, diff: string): string {
  const header = [
    `You are an expert technical reviewer. Analyze the diff for the updated FPF document and provide actionable insights.`,
    `Return a concise report with:`,
    `- Summary of meaningful changes (structure, semantics, and terminology)`,
    `- Potential risks or regressions`,
    `- Recommended follow-ups (tests, validations, doc updates)`,
    `- Impact level: none | low | medium | high`,
    `File: ${filePath}`,
  ].join("\n");

  // Truncate extremely large diffs to avoid agent limits
  const max = 120_000;
  const body = diff.length > max ? diff.slice(0, max) + "\n... [truncated]" : diff;

  return `${header}\n\n--- DIFF START ---\n${body}\n--- DIFF END ---`;
}

async function main() {
  const targetPath = env("DIFF_TARGET_PATH", "yadisk/First Principles Framework — Core Conceptual Specification (holonic).md");
  const baseRef = env("GITHUB_BASE_REF", env("BASE_REF", "main"));
  const agent = env("AGENT_NAME", "diff-evaluator");

  const diff = await getDiff(baseRef, targetPath);
  if (!diff) {
    console.log(`# Warp Diff Evaluation\n\nNo changes detected in ${targetPath}.`);
    return;
  }

  const prompt = buildPrompt(targetPath, diff);
  const output = await runWarpAgent({ agent, input: prompt, timeoutMs: 120_000 });

  const report = [
    "<!-- warp-diff-eval -->",
    "# Warp Diff Evaluation",
    "",
    `Target: \
${targetPath}`,
    "",
    output || "(No output produced by agent)",
  ].join("\n");

  console.log(report);
}

main().catch(err => {
  console.error("Diff evaluation failed:", err);
  process.exit(1);
});
