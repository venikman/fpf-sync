#!/usr/bin/env bun

import { GoogleGenerativeAI } from "@google/generative-ai";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import process from "node:process";

const execAsync = promisify(exec);

async function getGitDiff(): Promise<string> {
  const baseRef = process.env.GITHUB_BASE_REF;
  const headRef = process.env.GITHUB_HEAD_REF;
  const fpfPath = "yadisk/First Principles Framework — Core Conceptual Specification (holonic).md";

  if (!baseRef || !headRef) {
    throw new Error("GITHUB_BASE_REF and GITHUB_HEAD_REF env vars are required.");
  }

  const { stdout } = await execAsync(
    `git diff origin/${baseRef}...origin/${headRef} -- "${fpfPath}"`
  );
  return stdout;
}

async function run() {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GOOGLE_AI_API_KEY env var");
  }

  const modelName = process.env.GEMINI_MODEL || "gemini-2.5-pro";

  const diff = await getGitDiff();

  if (!diff.trim()) {
    console.log("No changes detected in FPF file. Skipping summary.");
    return;
  }

  const fpfContent = await (await import("node:fs/promises")).readFile("yadisk/First Principles Framework — Core Conceptual Specification (holonic).md", "utf8");

  const prompt = `
You are a research analyst. A change has been made to the "First Principles Framework (FPF)".
Your task is to summarize the change and describe its implications from the perspective of the FPF.

Here is the full content of the FPF document for context:
---
${fpfContent}
---

Here is the diff of the changes:
---
${diff}
---

Please provide a summary of the changes and their implications on the FPF.
Structure your response in markdown.
`;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });

  const result = await model.generateContent(prompt);
  const summary = result.response.text();

  // Post the summary to the PR.
  const prNumber = process.env.GITHUB_PULL_REQUEST_NUMBER;
  if (prNumber) {
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      console.warn("GITHUB_TOKEN not found. Cannot post PR comment.");
      console.log("\n--- Summary of FPF Changes ---\n");
      console.log(summary);
      return;
    }

    const repo = process.env.GITHUB_REPOSITORY;
    const url = `https://api.github.com/repos/${repo}/issues/${prNumber}/comments`;

    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${githubToken}`,
      },
      body: JSON.stringify({ body: summary }),
    });
  } else {
    console.log("\n--- Summary of FPF Changes ---\n");
    console.log(summary);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
