#!/usr/bin/env bun

/**
 * GPT Task Runner - Flexible GPT-powered automation for various GitHub tasks
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import process from "node:process";

const execAsync = promisify(exec);

function getEnv(name: string, required: true): string;
function getEnv(name: string, required?: false): string | undefined;
function getEnv(name: string, required = false): string | undefined {
  const value = process.env[name];
  if (required && (!value || value.trim() === "")) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function callGPT(prompt: string, systemPrompt: string, model = "gpt-4o-mini"): Promise<string> {
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
          content: systemPrompt,
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

async function reviewCode(target: string): Promise<string> {
  const { stdout: diff } = await execAsync(`git --no-pager diff ${target || "HEAD~1"}...HEAD`);
  
  const systemPrompt = "You are an expert code reviewer. Provide constructive feedback on code quality, potential bugs, and best practices.";
  const prompt = `Review these code changes:\n\`\`\`diff\n${diff}\n\`\`\``;
  
  return await callGPT(prompt, systemPrompt);
}

async function checkDocumentation(target: string): Promise<string> {
  const files = target || "README.md DEVELOPERS.md docs/**/*.md";
  const { stdout } = await execAsync(`find . -name "*.md" -type f | head -10 | xargs cat`);
  
  const systemPrompt = "You are a technical documentation expert. Review documentation for clarity, completeness, and accuracy.";
  const prompt = `Review this documentation and suggest improvements:\n\`\`\`markdown\n${stdout.substring(0, 8000)}\n\`\`\``;
  
  return await callGPT(prompt, systemPrompt);
}

async function analyzeCommits(target: string): Promise<string> {
  const range = target || "HEAD~10..HEAD";
  const { stdout: commits } = await execAsync(`git --no-pager log ${range} --oneline --no-decorate`);
  const { stdout: stats } = await execAsync(`git --no-pager log ${range} --stat --oneline --no-decorate`);
  
  const systemPrompt = "You are a software engineering analyst. Analyze commit patterns, identify trends, and provide insights.";
  const prompt = `Analyze these recent commits:\n\n${commits}\n\nDetailed stats:\n${stats.substring(0, 5000)}`;
  
  return await callGPT(prompt, systemPrompt);
}

async function triageIssue(issueNumber: string): Promise<string> {
  const { stdout } = await execAsync(`gh issue view ${issueNumber} --json title,body,labels --jq '{title, body, labels}'`);
  const issue = JSON.parse(stdout);
  
  const systemPrompt = "You are an experienced project maintainer. Help triage issues by suggesting appropriate labels, priority, and actionable next steps.";
  const prompt = `Triage this issue:\n\nTitle: ${issue.title}\n\nBody:\n${issue.body}\n\nCurrent labels: ${JSON.stringify(issue.labels)}`;
  
  return await callGPT(prompt, systemPrompt);
}

async function main() {
  console.log("🤖 GPT Task Runner\n");

  const taskType = getEnv("TASK_TYPE", true);
  const target = getEnv("TASK_TARGET");
  const additionalContext = getEnv("ADDITIONAL_CONTEXT");

  console.log(`📋 Task: ${taskType}`);
  if (target) console.log(`🎯 Target: ${target}`);
  if (additionalContext) console.log(`📝 Context: ${additionalContext}`);
  console.log();

  let result: string;

  try {
    switch (taskType) {
      case "code_review":
        console.log("🔍 Performing code review...");
        result = await reviewCode(target || "");
        break;
      
      case "documentation_check":
        console.log("📚 Checking documentation...");
        result = await checkDocumentation(target || "");
        break;
      
      case "commit_analysis":
        console.log("📊 Analyzing commits...");
        result = await analyzeCommits(target || "");
        break;
      
      case "issue_triage":
        console.log("🏷️  Triaging issue...");
        if (!target) {
          throw new Error("Issue number required for issue_triage task");
        }
        result = await triageIssue(target);
        break;
      
      default:
        throw new Error(`Unknown task type: ${taskType}`);
    }

    console.log("\n" + "=".repeat(80));
    console.log("RESULT:");
    console.log("=".repeat(80));
    console.log(result);
    console.log("=".repeat(80));
    console.log("\n✅ Task completed successfully!");

  } catch (error) {
    console.error("❌ Task failed:", error);
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
