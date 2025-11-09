#!/usr/bin/env bun

/**
 * Headless Warp Agent client adapter
 * - Supports HTTP and CLI modes selected by env WARP_AGENT_MODE (default: http)
 * - Exposes runWarpAgent({ agent, input, timeoutMs? }): Promise<string>
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

export interface RunWarpAgentOptions {
  agent: string;
  input: string;
  timeoutMs?: number;
}

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim().length ? v.trim() : undefined;
}

function getMode(): "http" | "cli" {
  const m = env("WARP_AGENT_MODE")?.toLowerCase();
  return m === "cli" ? "cli" : "http";
}

function mask(str: string | undefined): string {
  if (!str) return "";
  return str.length <= 8 ? "***" : `${str.slice(0, 2)}***${str.slice(-2)}`;
}

async function httpCall(agent: string, input: string, timeoutMs: number): Promise<string> {
  const url = env("WARP_AGENT_API_URL");
  const key = env("WARP_AGENT_API_KEY");
  if (!url) throw new Error("WARP_AGENT_API_URL is required for HTTP mode");
  if (!key) throw new Error("WARP_AGENT_API_KEY is required for HTTP mode");

  const body = JSON.stringify({ agent, input });

  const attempt = async (i: number): Promise<string> => {
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${url.replace(/\/$/, "")}/v1/agents/run`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body,
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        // Retry on 429 and 5xx
        if ((res.status === 429 || res.status >= 500) && i < 2) {
          const backoff = 500 * Math.pow(2, i);
          await new Promise(r => setTimeout(r, backoff));
          return attempt(i + 1);
        }
        throw new Error(`Warp Agent HTTP error ${res.status}: ${text.slice(0, 400)}`);
      }

      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const json = await res.json().catch(() => ({} as any));
        const output = (json && (json.output ?? json.result ?? json.data)) ?? "";
        return String(output ?? "").trim();
      }
      const text = await res.text();
      return text.trim();
    } finally {
      clearTimeout(to);
    }
  };

  // Minimal logging without secrets
  console.log(`WarpAgent[HTTP] agent=${agent} url=${url} key=${mask(key)}`);
  return attempt(0);
}

async function cliCall(agent: string, input: string, timeoutMs: number): Promise<string> {
  const bin = env("WARP_AGENT_CLI") || "warp-cli"; // default to Warp CLI on PATH

  const dir = await mkdtemp(join(tmpdir(), "warp-agent-"));
  const inputPath = join(dir, "input.txt");
  await writeFile(inputPath, input, "utf8");

  // Choose argument style based on binary name
  const base = bin.split("/").pop() || bin;
  let args = ["--agent", agent, "--input-file", inputPath];
  if (base.includes("warp-cli") || base === "warp") {
    // Warp CLI subcommand form
    args = ["agents", "run", "--agent", agent, "--input-file", inputPath];
  }

  console.log(`WarpAgent[CLI] agent=${agent} bin=${bin} args=${args.join(" ")}`);

  const { stdout } = await execFileAsync(
    bin,
    args,
    {
      timeout: timeoutMs,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env },
    },
  );

  const out = (stdout ?? "").toString().trim();
  return out;
}

export async function runWarpAgent(opts: RunWarpAgentOptions): Promise<string> {
  const mode = getMode();
  const timeout = opts.timeoutMs ?? 120_000;
  try {
    if (mode === "http") return await httpCall(opts.agent, opts.input, timeout);
    return await cliCall(opts.agent, opts.input, timeout);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Warp Agent call failed (${mode}): ${msg}`);
  }
}