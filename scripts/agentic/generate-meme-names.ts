#!/usr/bin/env bun

import process from "node:process";

function getEnv(key: string, required = false): string {
  const value = process.env[key];
  if (required && !value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || "";
}

const openRouterKey = getEnv("OPEN_ROUTER_KEY", true);
const supabaseUrl = getEnv("SUPABASE_PROJECT_URL") || "https://jxanpmwuecvrmznbsxma.supabase.co";
const supabaseKey = getEnv("SUPABASE_WRITE_KEY", true);

interface MemeRecord {
  id: string;
  source_file: string;
  title: string;
  description: string;
  category: string;
}

async function fetchAllMemes(): Promise<MemeRecord[]> {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/meme_characterization?select=id,source_file,title,description,category`,
    {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch memes: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

async function generateName(description: string, category: string): Promise<string> {
  const prompt = `Generate a concise, descriptive name (3-6 words maximum) for this behavioral pattern meme.

Category: ${category}
Description: ${description}

Requirements:
- Use English only
- Be concise (3-6 words)
- Capture the core behavioral pattern
- Be memorable and descriptive
- No quotes or special formatting

Respond with ONLY the name, nothing else.`;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openRouterKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://app.devin.ai",
      "X-Title": "MemeNameGenerator",
    },
    body: JSON.stringify({
      model: "x-ai/grok-4-fast",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 50,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter failed: ${response.status} ${await response.text()}`);
  }

  const result = await response.json();
  const name = result.choices[0].message.content.trim();
  
  return name.replace(/^["']|["']$/g, '');
}

async function updateMemeName(id: string, name: string): Promise<void> {
  const response = await fetch(`${supabaseUrl}/rest/v1/meme_characterization?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    throw new Error(`Failed to update meme ${id}: ${response.status} ${await response.text()}`);
  }
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("🔍 Fetching all memes from Supabase...");
  const memes = await fetchAllMemes();
  console.log(`📊 Found ${memes.length} memes to process`);

  let processed = 0;
  let errors = 0;

  for (const meme of memes) {
    try {
      console.log(`\n[${processed + 1}/${memes.length}] Processing ${meme.source_file}...`);
      
      const name = await generateName(meme.description, meme.category);
      console.log(`  ✅ Generated name: "${name}"`);
      
      await updateMemeName(meme.id, name);
      console.log(`  💾 Updated in database`);
      
      processed++;
      
      if (processed < memes.length) {
        await delay(2000);
      }
    } catch (error) {
      console.error(`  ❌ Error processing ${meme.source_file}:`, error instanceof Error ? error.message : error);
      errors++;
      
      await delay(5000);
    }
  }

  console.log(`\n✅ Complete! Processed ${processed}/${memes.length} memes`);
  if (errors > 0) {
    console.log(`⚠️  ${errors} errors encountered`);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
