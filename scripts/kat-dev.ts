#!/usr/bin/env bun
import { Duration, Effect, Schedule } from "effect";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const log = (message: string) => console.error(`[kat-dev] ${message}`);
const logError = (message: string) => console.error(`[kat-dev][error] ${message}`);

const argv = process.argv.slice(2);
if (argv[0] !== "dev") {
  fail("Only 'kat dev' is supported by this shim");
}
argv.shift();

const args: Record<string, string> = {};
for (let i = 0; i < argv.length; i += 2) {
  const key = argv[i];
  const value = argv[i + 1];
  if (!value) fail(`Missing value for ${key}`);
  if (key.startsWith("--")) {
    args[key.slice(2)] = value;
  } else {
    fail(`Unknown argument: ${key}`);
  }
}

let model = process.env.KAT_LOCAL_MODEL || args["model"];
if (!model) fail("Missing --model argument");
const inputFile = args["input-file"];
if (!inputFile) fail("Missing --input-file argument");
const agent = args["agent"] ?? "";

const inputBlob = Bun.file(inputFile);
if (!(await inputBlob.exists())) fail(`Input file not found: ${inputFile}`);

if (process.env.KAT_FAKE_OUTPUT) {
  log(`Fake analysis for agent ${agent || "unknown"}`);
  console.log(`## Simulated Analysis\nLocal shim executed with model ${model}\n\n(Set KAT_FAKE_OUTPUT='' to call the real API.)`);
  process.exit(0);
}

const apiBase = (process.env.KAT_API_BASE || "https://api.openai.com/v1").replace(/\/$/, "");
const endpoint = (process.env.KAT_ENDPOINT || "responses").replace(/^\//, "");
const url = `${apiBase}/${endpoint}`;
const apiKey = process.env.KAT_API_KEY || process.env.OPENAI_API_KEY;
if (!apiKey) fail("KAT_API_KEY or OPENAI_API_KEY is required for local analysis");

const prompt = await inputBlob.text();
log(`Preparing request to ${url} (model: ${model})`);

const payload = url.endsWith("/responses")
  ? {
      model,
      input: [
        {
          role: "user",
          content: [{ type: "text", text: prompt }],
        },
      ],
      temperature: 0.2,
      max_output_tokens: 2048,
    }
  : {
      model,
      messages: [
        { role: "system", content: "You are the fpf-diff-evaluator agent." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 2048,
    };

const timeoutMs = getNumber(process.env.KAT_REQUEST_TIMEOUT_MS, 120_000);
const retries = getNumber(process.env.KAT_REQUEST_RETRIES, 0);
const backoffMs = getNumber(process.env.KAT_REQUEST_BACKOFF_MS, 2_000);

const program = Effect.gen(function* (_) {
  let attempt = 0;
  const request = Effect.tryPromise(async () => {
    attempt += 1;
    const attemptLabel = `${attempt}/${retries + 1}`;
    log(`Attempt ${attemptLabel}: sending request`);
    const body = await sendRequest(url, apiKey, payload, timeoutMs, attemptLabel);
    log(`Attempt ${attemptLabel}: response received`);
    return body;
  }).pipe(
    Effect.tapError((error) =>
      Effect.sync(() => logError(`Attempt ${attempt}/${retries + 1} failed: ${error instanceof Error ? error.message : String(error)}`))),
  );

  const schedule = Schedule.recurs(retries).pipe(
    Schedule.intersect(Schedule.spaced(Duration.millis(backoffMs))),
  );

  const body = yield* _(Effect.retry(request, schedule));
  log(`Request succeeded after ${attempt} attempt(s)`);
  return body;
});

const result = await Effect.runPromise(program);
const text = extractText(result);
console.log(text.trim());

function getNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

async function sendRequest(
  requestUrl: string,
  key: string,
  body: unknown,
  timeout: number,
  attemptLabel: string,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}: ${text}`);
    }
    log(`Received ${text.length} bytes on attempt ${attemptLabel}`);
    return text ? JSON.parse(text) : {};
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timed out after ${timeout}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function extractText(body: any): string {
  if (Array.isArray(body?.output)) {
    const first = body.output[0];
    if (first && Array.isArray(first.content)) {
      const candidate = first.content[0]?.text;
      if (candidate) return candidate;
    }
  }
  if (Array.isArray(body?.choices)) {
    const candidate = body.choices[0]?.message?.content;
    if (candidate) return candidate;
  }
  if (typeof body?.output_text === "string" && body.output_text.trim()) {
    return body.output_text;
  }
  return JSON.stringify(body ?? {});
}
