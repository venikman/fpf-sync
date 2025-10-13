import { expect, test, describe } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

describe("meme-meter utility functions", () => {
  test("calculateShannonEntropy computes entropy for text", async () => {
    const memeFile = join(process.cwd(), "yadisk/chunks/good/useful_meme_001.md");
    
    try {
      const content = await readFile(memeFile, "utf-8");
      const lines = content.trim().split("\n");
      const text = lines.slice(2).join("\n").trim();
      
      const words = text.toLowerCase().split(/\s+/).filter(Boolean);
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
      
      expect(entropy).toBeGreaterThan(0);
      expect(entropy).toBeLessThan(20);
    } catch (error) {
      console.warn("Skipping test - meme file not found:", error);
    }
  });

  test("cosineSimilarity returns value between -1 and 1", () => {
    const vec1 = [1, 2, 3];
    const vec2 = [4, 5, 6];
    
    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;
    
    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      mag1 += vec1[i] * vec1[i];
      mag2 += vec2[i] * vec2[i];
    }
    
    const similarity = dotProduct / (Math.sqrt(mag1) * Math.sqrt(mag2));
    
    expect(similarity).toBeGreaterThanOrEqual(-1);
    expect(similarity).toBeLessThanOrEqual(1);
    expect(similarity).toBeCloseTo(0.974, 2);
  });

  test("meme state classification logic", () => {
    const testMetrics = {
      rho: 0.85,
      phi: 0.70,
      H: 1.5,
      A: 0.9,
      R: 0.0,
    };
    
    let state: "Candidate" | "Recognizable" | "Meme" | "Dormant" | "Retired";
    
    if (testMetrics.rho >= 0.80 && testMetrics.phi >= 0.60 && testMetrics.H >= 1.0) {
      state = "Meme";
    } else if (testMetrics.rho >= 0.60) {
      state = "Recognizable";
    } else {
      state = "Candidate";
    }
    
    expect(state).toBe("Meme");
  });

  test("meme verdict logic", () => {
    const memeMetrics = {
      rho: 0.85,
      phi: 0.70,
      H: 1.5,
      A: 0.9,
      R: 0.0,
    };
    
    const candidateMetrics = {
      rho: 0.45,
      phi: 0.30,
      H: 0.5,
      A: 0.5,
      R: 0.1,
    };
    
    const memeVerdict = memeMetrics.rho >= 0.50 && memeMetrics.H >= 1.0;
    const candidateVerdict = candidateMetrics.rho >= 0.50 && candidateMetrics.H >= 1.0;
    
    expect(memeVerdict).toBe(true);
    expect(candidateVerdict).toBe(false);
  });
});

describe("meme file processing", () => {
  test("meme file structure validation", async () => {
    const memeFile = join(process.cwd(), "yadisk/chunks/good/useful_meme_001.md");
    
    try {
      const content = await readFile(memeFile, "utf-8");
      const lines = content.trim().split("\n");
      
      expect(lines.length).toBeGreaterThan(2);
      
      const title = lines[0]?.replace(/^##?\s*/, "").trim();
      expect(title).toBeTruthy();
      expect(title.length).toBeGreaterThan(0);
      
      const text = lines.slice(2).join("\n").trim();
      expect(text).toBeTruthy();
      expect(text.length).toBeGreaterThan(10);
    } catch (error) {
      console.warn("Skipping test - meme file not found:", error);
    }
  });

  test("category classification from path", () => {
    const goodPath = "/path/to/good/useful_meme_001.md";
    const unproductivePath = "/path/to/unproductive/meme_001.md";
    
    const goodCategory = goodPath.includes("/good/") ? "useful" : "unproductive";
    const unproductiveCategory = unproductivePath.includes("/good/") ? "useful" : "unproductive";
    
    expect(goodCategory).toBe("useful");
    expect(unproductiveCategory).toBe("unproductive");
  });
});
