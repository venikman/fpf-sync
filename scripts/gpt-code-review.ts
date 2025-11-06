#!/usr/bin/env bun

/**
 * GPT-powered code review for pull requests
 * Analyzes code changes and provides intelligent feedback using OpenAI's GPT models
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import process from "node:process";

const execAsync = promisify(exec);

interface ReviewComment {
  file: string;
  line?: number;
  severity: "info" | "warning" | "error";
  message: string;
}

interface ReviewSummary {
  overallAssessment: string;
  strengths: string[];
  concerns: string[];
  suggestions: string[];
  comments: ReviewComment[];
}

function getEnv(name: string, required: true): string;
function getEnv(name: string, required?: false): string | undefined;
function getEnv(name: string, required = false): string | undefined {
  const value = process.env[name];
  if (required && (!value || value.trim() === "")) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function getGitDiff(baseSha?: string, headSha?: string): Promise<string> {
  try {
    let cmd: string;
    if (baseSha && headSha) {
      cmd = `git --no-pager diff ${baseSha}...${headSha}`;
    } else {
      // Fallback to comparing with main branch
      cmd = `git --no-pager diff origin/main...HEAD`;
    }
    
    const { stdout } = await execAsync(cmd);
    return stdout;
  } catch (error) {
    console.error("Error getting git diff:", error);
    return "";
  }
}

async function getPRInfo(prNumber: string): Promise<{ title: string; description: string }> {
  // Validate PR number to prevent command injection
  if (!/^\d+$/.test(prNumber)) {
    throw new Error("Invalid PR number format");
  }
  
  try {
    const { stdout } = await execAsync(
      `gh pr view ${prNumber} --json title,body --jq '{title: .title, body: .body}'`
    );
    const info = JSON.parse(stdout);
    return {
      title: info.title || "",
      description: info.body || "",
    };
  } catch (error) {
    console.warn("Could not fetch PR info via gh CLI:", error);
    return { title: "", description: "" };
  }
}

async function callGPT(prompt: string, model = "gpt-4o-mini"): Promise<string> {
  const apiKey = getEnv("OPENAI_API_KEY", true);
  
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: "You are an expert code reviewer. Provide constructive, actionable feedback on code changes. Focus on code quality, potential bugs, security issues, and best practices.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API call failed: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  return result.choices[0]?.message?.content || "";
}

async function reviewCodeChanges(
  diff: string,
  prTitle: string,
  prDescription: string
): Promise<ReviewSummary> {
  // Truncate diff if too long (to stay within token limits)
  const maxDiffLength = 8000;
  const truncatedDiff = diff.length > maxDiffLength 
    ? diff.substring(0, maxDiffLength) + "\n\n[... diff truncated ...]" 
    : diff;

  const prompt = `Review the following pull request:

**Title:** ${prTitle}

**Description:**
${prDescription || "No description provided"}

**Code Changes (git diff):**
\`\`\`diff
${truncatedDiff}
\`\`\`

Please provide a comprehensive code review in the following JSON format:
{
  "overallAssessment": "Brief overall assessment (2-3 sentences)",
  "strengths": ["List key strengths of the changes"],
  "concerns": ["List any concerns or potential issues"],
  "suggestions": ["List specific suggestions for improvement"],
  "comments": [
    {
      "file": "path/to/file",
      "line": 123,
      "severity": "info|warning|error",
      "message": "Specific feedback"
    }
  ]
}

Focus on:
1. Code quality and maintainability
2. Potential bugs or edge cases
3. Security vulnerabilities
4. Performance implications
5. Best practices and coding standards
6. Documentation and clarity

Respond with ONLY valid JSON, no additional text or markdown formatting.`;

  try {
    const response = await callGPT(prompt, "gpt-4o-mini");
    
    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Could not extract JSON from GPT response:", response);
      return {
        overallAssessment: "Review completed but response format was unexpected.",
        strengths: [],
        concerns: [],
        suggestions: [],
        comments: [],
      };
    }

    const review: ReviewSummary = JSON.parse(jsonMatch[0]);
    return review;
  } catch (error) {
    console.error("Error during GPT review:", error);
    return {
      overallAssessment: "Error occurred during automated review.",
      strengths: [],
      concerns: [],
      suggestions: [],
      comments: [],
    };
  }
}

function formatReviewAsMarkdown(review: ReviewSummary): string {
  const sections: string[] = [
    "## 🤖 GPT Code Review",
    "",
    "### 📊 Overall Assessment",
    review.overallAssessment,
    "",
  ];

  if (review.strengths.length > 0) {
    sections.push("### ✅ Strengths");
    review.strengths.forEach((s) => sections.push(`- ${s}`));
    sections.push("");
  }

  if (review.concerns.length > 0) {
    sections.push("### ⚠️ Concerns");
    review.concerns.forEach((c) => sections.push(`- ${c}`));
    sections.push("");
  }

  if (review.suggestions.length > 0) {
    sections.push("### 💡 Suggestions");
    review.suggestions.forEach((s) => sections.push(`- ${s}`));
    sections.push("");
  }

  if (review.comments.length > 0) {
    sections.push("### 📝 Detailed Comments");
    review.comments.forEach((comment) => {
      const icon = comment.severity === "error" ? "🚨" : comment.severity === "warning" ? "⚠️" : "ℹ️";
      sections.push(
        `- ${icon} **${comment.file}** ${comment.line ? `(line ${comment.line})` : ""}: ${comment.message}`
      );
    });
    sections.push("");
  }

  sections.push("---");
  sections.push("*This review was generated by GPT-4o-mini and should be used as a supplementary tool to human code review.*");

  return sections.join("\n");
}

async function main() {
  console.log("🤖 Starting GPT-powered code review...\n");

  const prNumber = getEnv("PR_NUMBER");
  const baseSha = getEnv("BASE_SHA");
  const headSha = getEnv("HEAD_SHA");

  if (!prNumber) {
    console.error("❌ No PR number provided. This script should run in a PR context.");
    process.exit(1);
  }

  console.log(`📋 Reviewing PR #${prNumber}`);

  // Get PR information
  console.log("📥 Fetching PR details...");
  const prInfo = await getPRInfo(prNumber);
  console.log(`   Title: ${prInfo.title}`);

  // Get code changes
  console.log("📄 Fetching code changes...");
  const diff = await getGitDiff(baseSha, headSha);
  
  if (!diff || diff.trim().length === 0) {
    console.log("ℹ️  No code changes detected. Skipping review.");
    return;
  }

  console.log(`   Found ${diff.split("\n").length} lines of diff`);

  // Perform GPT review
  console.log("\n🔍 Analyzing code with GPT...");
  const review = await reviewCodeChanges(diff, prInfo.title, prInfo.description);

  // Format and output
  const markdown = formatReviewAsMarkdown(review);
  console.log("\n" + markdown);

  // Set GitHub Actions output
  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput) {
    const fs = await import("node:fs/promises");
    await fs.appendFile(githubOutput, `summary<<EOF\n${markdown}\nEOF\n`);
  } else {
    // Fallback for local testing
    console.log("\n--- Review Summary (would be posted as comment) ---");
    console.log(markdown);
  }

  console.log("\n✅ Review completed successfully!");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  });
}
