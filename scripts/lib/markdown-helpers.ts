/**
 * Improved markdown helper utilities with better regex patterns
 * and clear separation of concerns for the fpf-sync project
 */

/**
 * Improved regex patterns with comments explaining their purpose
 */
export const MarkdownPatterns = {
  // Matches markdown headings (h1-h6) with capturing groups for level and text
  // Handles edge cases like trailing spaces and special characters
  heading: /^(#{1,6})\s+(.+?)(?:\s*#*\s*)?$/gm,

  // Matches words for topic extraction, allowing hyphens in compound words
  // but not at the start or end
  wordTokens: /\b[a-z]+(?:-[a-z]+)*\b/gi,

  // Matches inline citations like [1], [2], etc.
  citations: /\[(\d+)\]/g,

  // Matches markdown links [text](url)
  links: /\[([^\]]+)\]\(([^)]+)\)/g,

  // Matches bullet points (unordered lists)
  bulletPoints: /^\s*[-*+]\s+(.+)$/gm,

  // Matches numbered lists
  numberedLists: /^\s*(\d+)\.\s+(.+)$/gm,

  // Matches code blocks with optional language
  codeBlocks: /```(\w*)\n([\s\S]*?)```/g,

  // Matches inline code
  inlineCode: /`([^`]+)`/g,

  // Matches bold text
  bold: /\*\*([^*]+)\*\*|__([^_]+)__/g,

  // Matches italic text
  italic: /\*([^*]+)\*|_([^_]+)_/g,
} as const;

/**
 * Extract headings from markdown content with improved parsing
 */
export interface MarkdownHeading {
  level: number;
  text: string;
  raw: string;
}

export function extractHeadings(markdown: string): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  const matches = markdown.matchAll(MarkdownPatterns.heading);

  for (const match of matches) {
    headings.push({
      level: match[1].length,
      text: match[2].trim(),
      raw: match[0],
    });
  }

  return headings;
}

/**
 * Extract specific heading by pattern
 */
export function findHeading(
  markdown: string,
  pattern: RegExp | string,
): MarkdownHeading | undefined {
  const headings = extractHeadings(markdown);
  const searchPattern = typeof pattern === "string"
    ? new RegExp(pattern, "i")
    : pattern;

  return headings.find((h) => searchPattern.test(h.text));
}

/**
 * Extract content between two headings
 */
export function extractSection(
  markdown: string,
  startPattern: RegExp | string,
  endPattern?: RegExp | string,
): string {
  const lines = markdown.split("\n");
  const startHeading = typeof startPattern === "string"
    ? new RegExp(`^#{1,6}\\s+.*${startPattern}`, "i")
    : startPattern;

  let capturing = false;
  let capturedLines: string[] = [];

  for (const line of lines) {
    if (!capturing && startHeading.test(line)) {
      capturing = true;
      continue;
    }

    if (capturing) {
      if (endPattern) {
        const endHeading = typeof endPattern === "string"
          ? new RegExp(`^#{1,6}\\s+.*${endPattern}`, "i")
          : endPattern;
        if (endHeading.test(line)) break;
      } else {
        // Stop at next heading of same or higher level
        if (/^#{1,6}\s+/.test(line)) break;
      }
      capturedLines.push(line);
    }
  }

  return capturedLines.join("\n").trim();
}

/**
 * Extract topics from markdown with improved tokenization
 */
export interface TopicExtractionOptions {
  maxTopics?: number;
  minWordLength?: number;
  stopWords?: Set<string>;
  includeCompounds?: boolean;
}

export function extractTopics(
  text: string,
  options: TopicExtractionOptions = {},
): string[] {
  const {
    maxTopics = 8,
    minWordLength = 4,
    includeCompounds = true,
    stopWords = DEFAULT_STOP_WORDS,
  } = options;

  // Extract all words using improved pattern
  const words = text.toLowerCase().match(MarkdownPatterns.wordTokens) || [];

  // Count word frequency
  const frequency = new Map<string, number>();

  for (const word of words) {
    // Skip short words and stop words
    if (word.length < minWordLength || stopWords.has(word)) continue;

    // Handle compound words
    if (!includeCompounds && word.includes("-")) {
      // Split compound words and process separately
      word.split("-").forEach((part) => {
        if (part.length >= minWordLength && !stopWords.has(part)) {
          frequency.set(part, (frequency.get(part) || 0) + 1);
        }
      });
      // Skip adding the compound word itself
      continue;
    } else {
      frequency.set(word, (frequency.get(word) || 0) + 1);
    }
  }

  // Sort by frequency and return top N
  return Array.from(frequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTopics)
    .map(([word]) => word);
}

/**
 * Default stop words for topic extraction
 */
export const DEFAULT_STOP_WORDS = new Set([
  // Articles and pronouns
  "the",
  "a",
  "an",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "they",
  "them",
  "their",
  "theirs",
  "we",
  "us",
  "our",
  "ours",
  "you",
  "your",
  "yours",
  "he",
  "him",
  "his",
  "she",
  "her",
  "hers",

  // Prepositions and conjunctions
  "with",
  "from",
  "into",
  "about",
  "within",
  "between",
  "through",
  "during",
  "before",
  "after",
  "above",
  "below",
  "under",
  "over",
  "and",
  "or",
  "but",
  "nor",
  "for",
  "yet",
  "so",
  "as",
  "if",

  // Common verbs
  "is",
  "are",
  "was",
  "were",
  "been",
  "being",
  "have",
  "has",
  "had",
  "having",
  "do",
  "does",
  "did",
  "doing",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "must",
  "can",
  "could",
  "shall",

  // Common adverbs and adjectives
  "also",
  "very",
  "much",
  "many",
  "more",
  "most",
  "less",
  "least",
  "just",
  "only",
  "quite",
  "rather",
  "really",
  "too",
  "such",

  // Document structure words
  "introduction",
  "summary",
  "conclusion",
  "chapter",
  "section",
  "appendix",
  "page",
  "part",
  "table",
  "figure",
  "example",

  // FPF-specific common words
  "core",
  "conceptual",
  "framework",
  "first",
  "principles",
]);

/**
 * Format dates without regex string replacement
 */
export function formatDateUTC(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} UTC`;
}

/**
 * Parse git refs without regex replacement
 */
export interface GitRef {
  type: "branch" | "tag" | "pull" | "unknown";
  name: string;
  original: string;
}

export function parseGitRef(ref: string): GitRef {
  if (!ref) {
    return { type: "unknown", name: "", original: ref };
  }

  const parts = ref.split("/");

  // refs/heads/branch-name
  if (parts[0] === "refs" && parts[1] === "heads" && parts.length > 2) {
    return {
      type: "branch",
      name: parts.slice(2).join("/"),
      original: ref,
    };
  }

  // refs/tags/tag-name
  if (parts[0] === "refs" && parts[1] === "tags" && parts.length > 2) {
    return {
      type: "tag",
      name: parts.slice(2).join("/"),
      original: ref,
    };
  }

  // refs/pull/123/merge
  if (parts[0] === "refs" && parts[1] === "pull" && parts.length > 3) {
    return {
      type: "pull",
      name: `PR #${parts[2]}`,
      original: ref,
    };
  }

  // Assume it's already just a branch/tag name
  return {
    type: "unknown",
    name: ref,
    original: ref,
  };
}

/**
 * Validate markdown structure for research reports
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  sections: {
    executiveSummary: boolean;
    impactMap: boolean;
    adiSection: boolean;
    recommendations: boolean;
    sources: boolean;
  };
}

export function validateResearchReport(markdown: string): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    sections: {
      executiveSummary: false,
      impactMap: false,
      adiSection: false,
      recommendations: false,
      sources: false,
    },
  };

  // Check for required sections
  const headings = extractHeadings(markdown);
  const headingTexts = headings.map((h) => h.text.toLowerCase());

  // Check Executive Summary
  result.sections.executiveSummary = headingTexts.some((h) =>
    h.includes("executive") && h.includes("summary")
  );
  if (!result.sections.executiveSummary) {
    result.errors.push("Missing Executive Summary section");
  }

  // Check for "Bottom line:" in executive summary
  const execSection = extractSection(
    markdown,
    "Executive Summary",
    "Impact Map",
  );
  if (execSection && !/Bottom line:/i.test(execSection)) {
    result.warnings.push('Executive Summary should include "Bottom line:"');
  }

  // Check Impact Map
  result.sections.impactMap = headingTexts.some((h) =>
    h.includes("impact") && h.includes("map")
  );
  if (!result.sections.impactMap) {
    result.errors.push("Missing Impact Map section");
  }

  // Check A→D→I section
  result.sections.adiSection = headingTexts.some((h) =>
    h.includes("abduction") || h.includes("deduction") ||
    h.includes("induction")
  );
  if (!result.sections.adiSection) {
    result.errors.push("Missing Abduction → Deduction → Induction section");
  }

  // Check Recommendations
  result.sections.recommendations = headingTexts.some((h) =>
    h.includes("recommendation")
  );
  if (!result.sections.recommendations) {
    result.errors.push("Missing Recommendations section");
  }

  // Check Sources
  result.sections.sources = headingTexts.some((h) => h.includes("source"));
  if (!result.sections.sources) {
    result.errors.push("Missing Sources section");
  }

  // Check for citations
  const citations = markdown.match(MarkdownPatterns.citations);
  if (!citations || citations.length === 0) {
    result.warnings.push("No citations found in the document");
  }

  // Check bullet points in specific sections
  const impactSection = extractSection(markdown, "Impact Map", "Abduction");
  const impactBullets = impactSection.match(MarkdownPatterns.bulletPoints) ||
    [];

  // Validate Impact Map bullets have required tags
  for (const bullet of impactBullets) {
    if (!/Lens:\s*(Meta|Macro|Micro)/i.test(bullet)) {
      result.warnings.push(
        "Impact Map bullets should include Lens tag (Meta/Macro/Micro)",
      );
      break;
    }
    if (!/Time:\s*(design|run)/i.test(bullet)) {
      result.warnings.push(
        "Impact Map bullets should include Time tag (design/run)",
      );
      break;
    }
  }

  result.valid = result.errors.length === 0;

  return result;
}

/**
 * Count bullets in a section
 */
export function countBullets(sectionContent: string): number {
  const bullets = sectionContent.match(MarkdownPatterns.bulletPoints) || [];
  return bullets.length;
}

/**
 * Extract all links from markdown
 */
export interface MarkdownLink {
  text: string;
  url: string;
  raw: string;
}

export function extractLinks(markdown: string): MarkdownLink[] {
  const links: MarkdownLink[] = [];
  const matches = markdown.matchAll(MarkdownPatterns.links);

  for (const match of matches) {
    links.push({
      text: match[1],
      url: match[2],
      raw: match[0],
    });
  }

  return links;
}

/**
 * Build markdown content programmatically
 */
export class MarkdownBuilder {
  private lines: string[] = [];

  heading(level: number, text: string): this {
    const prefix = "#".repeat(Math.min(6, Math.max(1, level)));
    this.lines.push(`${prefix} ${text}`);
    this.lines.push("");
    return this;
  }

  paragraph(text: string): this {
    this.lines.push(text);
    this.lines.push("");
    return this;
  }

  bulletList(items: string[]): this {
    for (const item of items) {
      this.lines.push(`- ${item}`);
    }
    this.lines.push("");
    return this;
  }

  numberedList(items: string[]): this {
    items.forEach((item, index) => {
      this.lines.push(`${index + 1}. ${item}`);
    });
    this.lines.push("");
    return this;
  }

  link(text: string, url: string): string {
    return `[${text}](${url})`;
  }

  bold(text: string): string {
    return `**${text}**`;
  }

  italic(text: string): string {
    return `*${text}*`;
  }

  code(text: string): string {
    return `\`${text}\``;
  }

  codeBlock(code: string, language = ""): this {
    this.lines.push("```" + language);
    this.lines.push(code);
    this.lines.push("```");
    this.lines.push("");
    return this;
  }

  horizontalRule(): this {
    this.lines.push("---");
    this.lines.push("");
    return this;
  }

  blockquote(text: string): this {
    const lines = text.split("\n");
    for (const line of lines) {
      this.lines.push(`> ${line}`);
    }
    this.lines.push("");
    return this;
  }

  table(headers: string[], rows: string[][]): this {
    // Add headers
    this.lines.push("| " + headers.join(" | ") + " |");

    // Add separator
    this.lines.push("| " + headers.map(() => "---").join(" | ") + " |");

    // Add rows
    for (const row of rows) {
      this.lines.push("| " + row.join(" | ") + " |");
    }
    this.lines.push("");
    return this;
  }

  raw(content: string): this {
    this.lines.push(content);
    return this;
  }

  newline(): this {
    this.lines.push("");
    return this;
  }

  build(): string {
    return this.lines.join("\n").trim() + "\n";
  }
}

/**
 * Truncate text at word boundary
 */
export function truncateAtWordBoundary(
  text: string,
  maxLength: number,
  suffix = "...",
): string {
  if (text.length <= maxLength) return text;

  const truncateLength = maxLength - suffix.length;
  // Ensure we keep at least one character before the suffix
  const actualTruncateLength = Math.max(1, truncateLength);
  const truncated = text.substring(0, actualTruncateLength);
  const lastSpace = truncated.lastIndexOf(" ");

  if (lastSpace > 0) {
    return truncated.substring(0, lastSpace) + suffix;
  }

  // When no word boundary, try to keep a bit more text if possible
  // to make the truncation more readable
  if (text.length > maxLength && truncateLength < text.length) {
    return text.substring(0, Math.min(text.length, truncateLength + 1)) +
      suffix;
  }

  return truncated + suffix;
}

/**
 * Clean markdown for plain text display
 */
export function stripMarkdown(markdown: string): string {
  let text = markdown;

  // Remove code blocks
  text = text.replace(MarkdownPatterns.codeBlocks, "$2");

  // Remove inline code
  text = text.replace(MarkdownPatterns.inlineCode, "$1");

  // Remove bold
  text = text.replace(MarkdownPatterns.bold, "$1$2");

  // Remove italic
  text = text.replace(MarkdownPatterns.italic, "$1$2");

  // Remove links but keep text
  text = text.replace(MarkdownPatterns.links, "$1");

  // Remove headings markers
  text = text.replace(MarkdownPatterns.heading, "$2");

  // Remove bullet markers
  text = text.replace(MarkdownPatterns.bulletPoints, "$1");

  // Remove numbered list markers
  text = text.replace(MarkdownPatterns.numberedLists, "$2");

  // Remove horizontal rules
  text = text.replace(/^---+$/gm, "");

  // Remove blockquote markers
  text = text.replace(/^>\s*/gm, "");

  // Clean up multiple newlines
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}
