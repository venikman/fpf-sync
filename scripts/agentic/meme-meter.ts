#!/usr/bin/env -S deno run --allow-read --allow-env --allow-net --allow-write

import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { GoogleGenerativeAI } from "@google/generative-ai";
import process from "node:process";

function getEnv(name: string, required: true): string;
function getEnv(name: string, required?: false): string | undefined;
function getEnv(name: string, required = false): string | undefined {
  const v = process.env[name];
  if (required && (!v || v.trim() === "")) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

const apiKey = getEnv("GEMINI_API_KEY", true);
const genAI = new GoogleGenerativeAI(apiKey);

const supabaseUrl = getEnv("SUPABASE_URL") || "https://jxanpmwuecvrmznbsxma.supabase.co";
const supabaseKey = getEnv("SUPABASE_WRITE_KEY", true);

interface MemeFile {
  path: string;
  filename: string;
  category: "useful" | "unproductive";
  title: string;
  text: string;
  mtime: number;
}

interface MemeMetrics {
  rho: number;
  phi: number;
  H: number;
  A: number;
  R: number;
  v: null;
  R_m: null;
  L: null;
  Pi: null;
}

interface MemeCard {
  source_file: string;
  category: string;
  title: string;
  description: string;
  context: string;
  state: "Candidate" | "Recognizable" | "Meme" | "Dormant" | "Retired";
  metrics: MemeMetrics;
  verdict: boolean | null;
  window: {
    start: string;
    end: string;
  };
}

interface ExistingMemeCard extends MemeCard {
  updated_at: string;
}

async function loadMemeFiles(chunksPath: string): Promise<MemeFile[]> {
  const memes: MemeFile[] = [];
  const categories = ["good", "unproductive"] as const;

  for (const catDir of categories) {
    const category = catDir === "good" ? "useful" : "unproductive";
    const dirPath = join(chunksPath, catDir);

    const cmd = new Deno.Command("find", {
      args: [dirPath, "-name", "*.md", "-type", "f"],
      stdout: "piped",
    });

    const { stdout } = await cmd.output();
    const files = new TextDecoder().decode(stdout).trim().split("\n").filter(
      Boolean,
    );

    for (const filepath of files) {
      const content = await readFile(filepath, "utf-8");
      const lines = content.trim().split("\n");
      const title = lines[0]?.replace(/^##?\s*/, "").trim() || "Untitled";
      const text = lines.slice(2).join("\n").trim();

      const fileStat = await stat(filepath);
      const mtime = Math.floor(fileStat.mtimeMs / 1000);

      memes.push({
        path: filepath,
        filename: filepath.split("/").pop()!,
        category,
        title,
        text,
        mtime,
      });
    }
  }

  return memes;
}

async function loadExistingMemeCards(): Promise<Map<string, ExistingMemeCard>> {
  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/meme_characterization?select=source_file,category,title,description,context,state,metrics,verdict,window,updated_at`,
      {
        headers: {
          "apikey": supabaseKey,
          "Authorization": `Bearer ${supabaseKey}`,
        },
      },
    );

    if (!response.ok) {
      console.warn(
        "Warning: Could not load existing meme cards:",
        response.status,
        await response.text(),
      );
      return new Map();
    }

    const cards = await response.json() as ExistingMemeCard[];
    const cardMap = new Map<string, ExistingMemeCard>();

    for (const card of cards) {
      cardMap.set(card.source_file, card);
    }

    return cardMap;
  } catch (error) {
    console.warn("Warning: Could not load existing meme cards:", error);
    return new Map();
  }
}

function calculateShannonEntropy(text: string): number {
  const words = text.toLowerCase().match(/\b\w+\b/g) || [];
  if (words.length === 0) return 0;

  const freq = new Map<string, number>();
  for (const word of words) {
    freq.set(word, (freq.get(word) || 0) + 1);
  }

  let entropy = 0;
  const total = words.length;
  for (const count of freq.values()) {
    const p = count / total;
    entropy -= p * Math.log2(p);
  }

  return entropy;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error("Vector dimension mismatch");

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function generateEmbedding(text: string): Promise<number[]> {
  const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

async function calculateFidelity(
  targetEmbedding: number[],
  otherMemes: MemeFile[],
): Promise<number> {
  if (otherMemes.length === 0) return 0.5;

  const similarities: number[] = [];
  const samplesToCompare = Math.min(10, otherMemes.length);

  for (let i = 0; i < samplesToCompare; i++) {
    try {
      const otherEmbedding = await generateEmbedding(otherMemes[i].text);
      const similarity = cosineSimilarity(targetEmbedding, otherEmbedding);
      similarities.push(similarity);
    } catch (error) {
      console.warn(
        `Warning: Could not generate embedding for comparison: ${error}`,
      );
    }
  }

  if (similarities.length === 0) return 0.5;
  return similarities.reduce((a, b) => a + b, 0) / similarities.length;
}

async function characterizeMeme(
  meme: MemeFile,
  allMemes: MemeFile[],
): Promise<MemeCard> {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash-exp",
    generationConfig: {
      temperature: 0.3,
      topP: 0.95,
    },
  });

  const prompt = `You are analyzing a behavioral pattern meme from an educational context (Russian language).

Meme Title: ${meme.title}
Category: ${meme.category}
Text:
${meme.text}

Please provide:
1. A detailed 2-3 sentence description of this meme's core behavioral pattern in English
2. Assess the following metrics (use numeric values only):
   - Recognizability (rho): How clearly recognizable is this as a distinct behavioral pattern template? (0.0-1.0)
   - Affect (A): What emotional payload does this meme carry? (-1.0 = very negative, 0.0 = neutral, 1.0 = very positive)
   - Harm/Risk (R): What is the potential harm or risk if this pattern spreads? (0.0 = no risk, 1.0 = high risk)

Respond in valid JSON format only (no markdown, no extra text):
{
  "description": "detailed description here",
  "rho": 0.0,
  "A": 0.0,
  "R": 0.0
}`;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();

  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(
      `Failed to parse AI response for ${meme.filename}: ${responseText}`,
    );
  }

  const aiAssessment = JSON.parse(jsonMatch[0]);

  console.log(`  Generating embedding for ${meme.filename}...`);
  const targetEmbedding = await generateEmbedding(meme.text);

  const sameCategoryMemes = allMemes.filter(
    (m) => m.category === meme.category && m.filename !== meme.filename,
  );

  console.log(
    `  Calculating fidelity against ${
      Math.min(10, sameCategoryMemes.length)
    } similar memes...`,
  );
  const phi = await calculateFidelity(
    targetEmbedding,
    sameCategoryMemes,
  );

  const H = calculateShannonEntropy(meme.text);

  const metrics: MemeMetrics = {
    rho: Number(aiAssessment.rho),
    phi: Number(phi.toFixed(4)),
    H: Number(H.toFixed(4)),
    A: Number(aiAssessment.A),
    R: Number(aiAssessment.R),
    v: null,
    R_m: null,
    L: null,
    Pi: null,
  };

  let state: MemeCard["state"];
  if (metrics.rho >= 0.7) {
    state = "Meme";
  } else if (metrics.rho >= 0.5) {
    state = "Recognizable";
  } else {
    state = "Candidate";
  }

  const now = new Date().toISOString();

  return {
    source_file: meme.filename,
    category: meme.category,
    title: meme.title,
    description: aiAssessment.description,
    context: "Memetics_v1",
    state,
    metrics,
    verdict: state === "Meme",
    window: {
      start: now,
      end: now,
    },
  };
}

async function storeMemeCard(card: MemeCard): Promise<void> {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/meme_characterization`,
    {
      method: "POST",
      headers: {
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
      },
      body: JSON.stringify({
        source_file: card.source_file,
        category: card.category,
        title: card.title,
        description: card.description,
        context: card.context,
        state: card.state,
        metrics: card.metrics,
        verdict: card.verdict,
        window: card.window,
      }),
    },
  );

  if (!response.ok) {
    const errorMsg = await response.text();
    throw new Error(`Failed to store MemeCard: ${response.status} ${errorMsg}`);
  }
}

async function main() {
  console.log("🔬 MemeMeter_v1: Characterizing behavioral pattern memes...\n");

  const chunksPath = getEnv("CHUNKS_PATH") ||
    join(process.env.HOME!, "repos", "chunks");

  console.log(`📂 Loading memes from ${chunksPath}...`);
  const memes = await loadMemeFiles(chunksPath);
  console.log(
    `✅ Loaded ${memes.length} memes (${
      memes.filter((m) => m.category === "useful").length
    } useful, ${
      memes.filter((m) => m.category === "unproductive").length
    } unproductive)\n`,
  );

  console.log("📥 Loading existing meme characterizations...");
  const existingCards = await loadExistingMemeCards();
  console.log(`✅ Found ${existingCards.size} existing characterizations\n`);

  const memesToProcess: MemeFile[] = [];
  const skippedMemes: string[] = [];

  for (const meme of memes) {
    const existing = existingCards.get(meme.filename);
    if (existing) {
      const existingUpdatedAt = Math.floor(
        new Date(existing.updated_at).getTime() / 1000,
      );
      if (meme.mtime <= existingUpdatedAt) {
        skippedMemes.push(meme.filename);
        continue;
      }
    }
    memesToProcess.push(meme);
  }

  console.log(
    `📊 Processing ${memesToProcess.length} memes (${skippedMemes.length} unchanged, skipped)\n`,
  );

  if (memesToProcess.length === 0) {
    console.log("✅ All memes are up to date!");
    return;
  }

  const results: MemeCard[] = [];
  let processed = 0;

  for (const meme of memesToProcess) {
    try {
      console.log(`⚙️  Processing: ${meme.filename}...`);
      const card = await characterizeMeme(meme, memes);
      await storeMemeCard(card);
      results.push(card);
      processed++;

      if (processed % 10 === 0) {
        console.log(
          `   Progress: ${processed}/${memesToProcess.length} (${
            ((processed / memesToProcess.length) * 100).toFixed(1)
          }%)`,
        );
      }
      
      await new Promise(resolve => setTimeout(resolve, 6500));
    } catch (error) {
      console.error(`❌ Error processing ${meme.filename}:`, error);
      
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes("429") || errorMsg.includes("quota")) {
        console.log("   ⏳ Rate limit hit, waiting 60 seconds...");
        await new Promise(resolve => setTimeout(resolve, 60000));
        
        try {
          console.log(`   🔄 Retrying ${meme.filename}...`);
          const card = await characterizeMeme(meme, memes);
          await storeMemeCard(card);
          results.push(card);
          processed++;
        } catch (retryError) {
          console.error(`   ❌ Retry failed for ${meme.filename}:`, retryError);
        }
      }
    }
  }

  console.log(
    `\n✅ Completed! Processed ${processed}/${memesToProcess.length} memes`,
  );
  
  if (processed < memesToProcess.length) {
    console.log(`\n⚠️  Warning: ${memesToProcess.length - processed} memes failed to process`);
  }

  if (results.length > 0) {
    console.log(`\nState distribution:`);
    const states = results.reduce((acc, r) => {
      acc[r.state] = (acc[r.state] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    for (const [state, count] of Object.entries(states)) {
      console.log(`  ${state}: ${count}`);
    }

    console.log(`\nAverage metrics:`);
    const avgMetrics = results.reduce(
      (acc, r) => ({
        rho: acc.rho + r.metrics.rho,
        phi: acc.phi + r.metrics.phi,
        H: acc.H + r.metrics.H,
        A: acc.A + r.metrics.A,
        R: acc.R + r.metrics.R,
      }),
      { rho: 0, phi: 0, H: 0, A: 0, R: 0 },
    );

    for (const [metric, sum] of Object.entries(avgMetrics)) {
      console.log(`  ${metric}: ${(sum / results.length).toFixed(3)}`);
    }
  }
}

if (import.meta.main) {
  main().catch(console.error);
}
