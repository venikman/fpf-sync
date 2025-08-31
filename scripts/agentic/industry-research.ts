#!/usr/bin/env bun
/**
 * Daily Industry Research (TypeScript) using Gemini via @google/generative-ai
 * - No issues/PRs, writes to GitHub Actions Job Summary only
 * - Designed to run under Bun (faster TS execution, no build step)
 * - Optionally adaptable to Mastra if you want a richer agent runtime later
 */

import { writeFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Use the official Google Generative AI SDK for Node
// npm/bun: @google/generative-ai
import { GoogleGenerativeAI } from "@google/generative-ai";

// Small helper: env access with validation
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
    if (!existsSync(path)) {
      await writeFile(path, "");
    }
    const prefix = header ? "# Daily Industry Research Report\n\n" : "";
    await appendFile(path, prefix + text + (text.endsWith("\n") ? "" : "\n"), {
      encoding: "utf8",
    });
  } else {
    // Fallback to stdout if not in Actions
    if (header) process.stdout.write("# Daily Industry Research Report\n\n");
    process.stdout.write(text + (text.endsWith("\n") ? "" : "\n"));
  }
}

async function ghGet<T = unknown>(endpoint: string, token?: string): Promise<T | null> {
  const repo = getEnv("GITHUB_REPOSITORY");
  if (!repo) return null;
  const url = `https://api.github.com/repos/${repo}/${endpoint}`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function gatherContext() {
  const token = getEnv("GH_TOKEN") || getEnv("GITHUB_TOKEN");
  const repo = getEnv("GITHUB_REPOSITORY") ?? "";

  const [repoInfo, languages, recentCommits, openPRs, openIssues] = await Promise.all([
    ghGet<Record<string, unknown>>("", token),
    ghGet<Record<string, number>>("languages", token),
    ghGet<unknown[]>("commits?per_page=5", token),
    ghGet<unknown[]>("pulls?state=open&per_page=5", token),
    ghGet<unknown[]>("issues?state=open&per_page=5", token),
  ]);

  return {
    repo,
    repoInfo,
    languages,
    recentCommitsCount: Array.isArray(recentCommits) ? recentCommits.length : "n/a",
    openPRsCount: Array.isArray(openPRs) ? openPRs.length : "n/a",
    openIssuesCount: Array.isArray(openIssues) ? openIssues.length : "n/a",
  };
}

function buildPrompt(ctx: Awaited<ReturnType<typeof gatherContext>>): string {
  const description = (ctx.repoInfo as any)?.description ?? "";
  const langs = ctx.languages ? Object.keys(ctx.languages).join(", ") : "unknown";

  return `You are a research assistant. Produce a concise, high-signal daily industry research report for the repository ${ctx.repo}.

Repository context:
- Description: ${description}
- Languages: ${langs}
- Open issues: ${ctx.openIssuesCount}
- Open PRs: ${ctx.openPRsCount}
- Recent commits: ${ctx.recentCommitsCount}

Constraints:
- Do not produce code changes.
- Provide links to sources when possible.
- Output must be markdown only. No YAML frontmatter.

Report structure:
1. Executive Summary (3–6 bullets)
2. Notable News and Releases (5–10 items: each line has [name](url) — one-line context)
3. Tech Trends Relevant to this repo (1–3 short paragraphs)
4. Opportunities and Risks (bullets)
5. Sources (bullet list of links)

Include a final note:
> AI-generated content by this workflow may contain mistakes.
`;
}

async function run() {
  try {
    const apiKey = getEnv("GOOGLE_AI_API_KEY", true)!; // required
    const modelName = getEnv("GEMINI_MODEL") || "gemini-1.5-flash";

    await writeSummary("", { header: true });

    const ctx = await gatherContext();
    const prompt = buildPrompt(ctx);

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

