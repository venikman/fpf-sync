/**
 * Supabase database client for meme characterization
 * Provides methods for reading and writing meme data to Supabase
 */

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

const supabaseUrl = getEnv("SUPABASE_PROJECT_URL", true);
const supabaseKey = getEnv("SUPABASE_WRITE_KEY", true);

export interface MemeMetrics {
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

export interface MemeCard {
  source_file: string;
  category: string;
  title: string;
  name: string;
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

export interface ExistingMemeCard extends MemeCard {
  updated_at: string;
}

/**
 * Load all existing meme characterizations from Supabase
 * @returns Map of source_file to MemeCard
 */
export async function loadExistingMemeCards(): Promise<Map<string, ExistingMemeCard>> {
  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/meme_characterization?select=source_file,category,title,name,description,context,state,metrics,verdict,window,updated_at`,
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

/**
 * Store or update a meme characterization in Supabase
 * @param card The meme characterization to store
 */
export async function storeMemeCard(card: MemeCard): Promise<void> {
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
        name: card.name,
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
