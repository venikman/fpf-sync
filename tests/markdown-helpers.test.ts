import { describe, it, expect } from "bun:test";
import {
  countBullets,
  extractHeadings,
  extractLinks,
  extractSection,
  extractTopics,
  formatDateUTC,
  MarkdownBuilder,
  MarkdownPatterns,
  parseGitRef,
  stripMarkdown,
  truncateAtWordBoundary,
  validateResearchReport,
} from "../scripts/lib/markdown-helpers.ts";

describe("MarkdownPatterns", () => {
  it("matches headings with various formats", () => {
    const text = `
# Heading 1
## Heading 2 ##
### Heading 3 with trailing ###
#### Heading 4
##### Heading 5
###### Heading 6
`;
    const matches = [...text.matchAll(MarkdownPatterns.heading)];
    expect(matches).toHaveLength(6);
    expect(matches[0][2]).toBe("Heading 1");
    expect(matches[1][2]).toBe("Heading 2");
    expect(matches[2][2]).toBe("Heading 3 with trailing");
  });

  it("matches word tokens including compounds", () => {
    const text = "holonic-systems self-organizing meta-framework";
    const matches = text.match(MarkdownPatterns.wordTokens);
    expect(matches).toEqual([
      "holonic-systems",
      "self-organizing",
      "meta-framework",
    ]);
  });

  it("matches citations", () => {
    const text = "This is a claim [1] with multiple [2] citations [10].";
    const matches = [...text.matchAll(MarkdownPatterns.citations)];
    expect(matches).toHaveLength(3);
    expect(matches[0][1]).toBe("1");
    expect(matches[1][1]).toBe("2");
    expect(matches[2][1]).toBe("10");
  });

  it("matches markdown links", () => {
    const text =
      "Check [this link](https://example.com) and [another](http://test.org).";
    const matches = [...text.matchAll(MarkdownPatterns.links)];
    expect(matches).toHaveLength(2);
    expect(matches[0][1]).toBe("this link");
    expect(matches[0][2]).toBe("https://example.com");
  });
});

describe("extractHeadings", () => {
  it("extracts headings with correct levels and text", () => {
    const markdown = `
# Main Title
Some content here
## Section 1
### Subsection 1.1
## Section 2
`;
    const headings = extractHeadings(markdown);
    expect(headings).toHaveLength(4);
    expect(headings[0]).toEqual({
      level: 1,
      text: "Main Title",
      raw: "# Main Title",
    });
    expect(headings[1].level).toBe(2);
    expect(headings[2].level).toBe(3);
  });

  it("handles headings with special characters", () => {
    const markdown = "## Holonic Framework — Core & Concepts (v1.0)";
    const headings = extractHeadings(markdown);
    expect(headings[0].text).toBe("Holonic Framework — Core & Concepts (v1.0)");
  });
});

describe("extractTopics", () => {
  it("extracts topics excluding stop words", () => {
    const text =
      "The holonic framework provides meta-patterns for system architecture and design principles";
    const topics = extractTopics(text, { maxTopics: 5, minWordLength: 4 });

    expect(topics).not.toContain("the");
    expect(topics).not.toContain("for");
    expect(topics).not.toContain("and");
    expect(topics).toContain("holonic");
    expect(topics).toContain("system");
    expect(topics).toContain("architecture");
  });

  it("handles compound words correctly", () => {
    const text = "self-organizing meta-framework multi-agent-systems";
    const topics = extractTopics(text, {
      maxTopics: 10,
      minWordLength: 4,
      includeCompounds: true,
    });

    expect(topics).toContain("self-organizing");
    expect(topics).toContain("meta-framework");
  });

  it("splits compound words when includeCompounds is false", () => {
    const text = "self-organizing meta-patterns";
    const topics = extractTopics(text, {
      maxTopics: 10,
      minWordLength: 4,
      includeCompounds: false,
    });

    expect(topics).not.toContain("self-organizing");
    expect(topics).not.toContain("meta-patterns");
    expect(topics).toContain("self");
    expect(topics).toContain("organizing");
    expect(topics).toContain("meta");
    expect(topics).toContain("patterns");
  });

  it("respects maxTopics limit", () => {
    const text = "one two three four five six seven eight nine ten";
    const topics = extractTopics(text, {
      maxTopics: 3,
      minWordLength: 1,
      stopWords: new Set(),
    });

    expect(topics).toHaveLength(3);
  });
});

describe("extractSection", () => {
  it("extracts content between two headings", () => {
    const markdown = `
# Title
## Executive Summary
This is the executive summary content.
With multiple lines.
## Impact Map
This is the impact map section.
## Sources
References here.
`;
    const section = extractSection(markdown, "Executive Summary", "Impact Map");
    expect(section).toBe(
      "This is the executive summary content.\nWith multiple lines.",
    );
  });

  it("extracts to end of document when no end pattern", () => {
    const markdown = `
## Section 1
Content 1
## Section 2
Content 2
Final content
`;
    const section = extractSection(markdown, "Section 2");
    expect(section).toBe("Content 2\nFinal content");
  });

  it("handles regex patterns", () => {
    const markdown = `
## Executive Summary
Summary content
## Impact Map to FPF
Impact content
`;
    const section = extractSection(markdown, /Executive/i, /Impact/i);
    expect(section).toBe("Summary content");
  });
});

describe("formatDateUTC", () => {
  it("formats date in UTC without regex replacement", () => {
    const date = new Date(Date.UTC(2024, 0, 15, 14, 30, 45));
    const formatted = formatDateUTC(date);
    expect(formatted).toBe("2024-01-15 14:30:45 UTC");
  });

  it("handles single digit values with padding", () => {
    const date = new Date(Date.UTC(2024, 5, 5, 5, 5, 5));
    const formatted = formatDateUTC(date);
    expect(formatted).toBe("2024-06-05 05:05:05 UTC");
  });
});

describe("parseGitRef", () => {
  it("parses branch references", () => {
    const ref = parseGitRef("refs/heads/main");
    expect(ref).toEqual({
      type: "branch",
      name: "main",
      original: "refs/heads/main",
    });
  });

  it("parses tag references", () => {
    const ref = parseGitRef("refs/tags/v1.0.0");
    expect(ref).toEqual({
      type: "tag",
      name: "v1.0.0",
      original: "refs/tags/v1.0.0",
    });
  });

  it("parses pull request references", () => {
    const ref = parseGitRef("refs/pull/123/merge");
    expect(ref).toEqual({
      type: "pull",
      name: "PR #123",
      original: "refs/pull/123/merge",
    });
  });

  it("handles branch names with slashes", () => {
    const ref = parseGitRef("refs/heads/feature/new-feature");
    expect(ref).toEqual({
      type: "branch",
      name: "feature/new-feature",
      original: "refs/heads/feature/new-feature",
    });
  });

  it("returns unknown for plain branch names", () => {
    const ref = parseGitRef("main");
    expect(ref).toEqual({
      type: "unknown",
      name: "main",
      original: "main",
    });
  });
});

describe("validateResearchReport", () => {
  it("validates a complete report", () => {
    const markdown = `
# Report
## Executive Summary
Bottom line: This is important.
- Point 1 with Audience: Eng
 and Recency: New
- Point 2 with Audience: PM and Recency: Recent
## Impact Map to FPF
- Impact 1 with Lens: Meta and Time: design
##
 Abduction → Deduction → Induction
Content here
## Recommendations

- Recommendation 1
## Sources
- [1] Source 1
`;
    const result = validateResearchReport(markdown);
    expect(result.valid).toBe(true);
    expect(result.sections.executiveSummary).toBe(true);
    expect(result.sections.impactMap).toBe(true);
    expect(result.sections.adiSection).toBe(true);
    expect(result.sections.recommendations).toBe(true);
    expect(result.sections.sources).toBe(true);
  });

  it("reports missing sections", () => {
    const markdown = `
## Executive Summary
Content
`;
    const result = validateResearchReport(markdown);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Missing Impact Map section");
    expect(result.errors).toContain("Missing Sources section");
  });

  it("warns about missing Bottom line", () => {
    const markdown = `
## Executive Summary
Just some content without bottom line.
## Impact Map
## Sources
`;
    const result = validateResearchReport(markdown);
    expect(result.warnings).toContain(
      'Executive Summary should include "Bottom line:"',
    );
  });

  it("warns about missing citations", () => {
    const markdown = `
## Executive Summary
## Impact Map
## Sources
No citations in this document.
`;
    const result = validateResearchReport(markdown);
    expect(result.warnings).toContain("No citations found in the document");
  });
});

describe("countBullets", () => {
  it("counts bullet points in text", () => {
    const text = `
- First bullet
- Second bullet
* Third bullet with asterisk
+ Fourth bullet with plus
Regular text
1. Numbered list (not counted)
`;
    const count = countBullets(text);
    expect(count).toBe(4);
  });
});

describe("extractLinks", () => {
  it("extracts all markdown links", () => {
    const markdown = `
Check out [GitHub](https://github.com) and [Google](https://google.com).
Also see [this document](./doc.md).
`;
    const links = extractLinks(markdown);
    expect(links).toHaveLength(3);
    expect(links[0]).toEqual({
      text: "GitHub",
      url: "https://github.com",
      raw: "[GitHub](https://github.com)",
    });
  });
});

describe("MarkdownBuilder", () => {
  it("builds markdown with various elements", () => {
    const builder = new MarkdownBuilder();
    const result = builder
      .heading(1, "Title")
      .paragraph("Introduction paragraph.")
      .heading(2, "Section")
      .bulletList(["Item 1", "Item 2"])
      .numberedList(["First", "Second"])
      .build();

    expect(result).toContain("# Title");
    expect(result).toContain("## Section");
    expect(result).toContain("- Item 1");
    expect(result).toContain("1. First");
    expect(result).toContain("2. Second");
  });

  it("creates code blocks", () => {
    const builder = new MarkdownBuilder();
    const result = builder
      .codeBlock("console.log('hello');", "javascript")
      .build();

    expect(result).toContain("```javascript");
    expect(result).toContain("console.log('hello');");
    expect(result).toContain("```");
  });

  it("creates tables", () => {
    const builder = new MarkdownBuilder();
    const result = builder
      .table(
        ["Header 1", "Header 2"],
        [
          ["Row 1 Col 1", "Row 1 Col 2"],
          ["Row 2 Col 1", "Row 2 Col 2"],
        ],
      )
      .build();

    expect(result).toContain("| Header 1 | Header 2 |");
    expect(result).toContain("| --- | --- |");
    expect(result).toContain("| Row 1 Col 1 | Row 1 Col 2 |");
  });

  it("formats inline elements", () => {
    const builder = new MarkdownBuilder();
    const bold = builder.bold("bold text");
    const italic = builder.italic("italic text");
    const code = builder.code("code");
    const link = builder.link("link text", "https://example.com");

    expect(bold).toBe("**bold text**");
    expect(italic).toBe("*italic text*");
    expect(code).toBe("`code`");
    expect(link).toBe("[link text](https://example.com)");
  });
});

describe("truncateAtWordBoundary", () => {
  it("does not truncate short text", () => {
    const text = "Short text";
    const result = truncateAtWordBoundary(text, 20);
    expect(result).toBe("Short text");
  });

  it("truncates at word boundary", () => {
    const text = "This is a long sentence that needs truncation";
    const result = truncateAtWordBoundary(text, 20, "...");
    expect(result).toBe("This is a long...");
  });

  it("handles text without spaces", () => {
    const text = "verylongwordwithoutspaces";
    const result = truncateAtWordBoundary(text, 10, "...");
    expect(result).toBe("verylong...");
  });
});

describe("stripMarkdown", () => {
  it("removes all markdown formatting", () => {
    const markdown = `
# Heading
**Bold** and *italic* text with \`inline code\`.
[Link](https://example.com)
\`\`\`javascript
code block
\`\`\`
- Bullet point
1. Numbered item
> Blockquote
---
`;
    const stripped = stripMarkdown(markdown);

    expect(stripped).not.toContain("#");
    expect(stripped).not.toContain("**");
    expect(stripped).not.toContain("*");
    expect(stripped).not.toContain("`");
    expect(stripped).not.toContain("[");
    expect(stripped).not.toContain("](");
    expect(stripped).not.toContain("```");
    expect(stripped).not.toContain("---");
    expect(stripped).not.toContain(">");

    expect(stripped).toContain("Heading");
    expect(stripped).toContain("Bold and italic text with inline code");
    expect(stripped).toContain("Link");
    expect(stripped).toContain("code block");
    expect(stripped).toContain("Bullet point");
    expect(stripped).toContain("Numbered item");
    expect(stripped).toContain("Blockquote");
  });
});
