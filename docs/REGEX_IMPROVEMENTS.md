# Regex Pattern Improvements Guide

This document outlines opportunities to replace regex patterns in the fpf-sync codebase with more robust, maintainable library-based solutions.

## Executive Summary

The codebase currently uses regex patterns for markdown parsing, text processing, and validation. While functional, these patterns can be replaced with specialized libraries that offer:

- Better edge case handling
- Improved maintainability
- Type safety
- More readable code
- Tested and proven solutions

## Current Regex Usage Analysis

### 1. Markdown Heading Extraction

**Current Pattern:**
```typescript
const headingRegex = /^#{1,6}\s+(.+)$/gm;
```

**Issues:**
- Doesn't handle edge cases (e.g., escaped characters, inline formatting)
- No semantic understanding of markdown structure
- Difficult to extract heading level and nested content

**Recommended Solution: Vercel Streamdown + Remark**

```typescript
// Install: bun add streamdown remark remark-parse unist-util-visit
import { remark } from 'remark';
import { visit } from 'unist-util-visit';
import { toString } from 'mdast-util-to-string';

function extractHeadings(markdown: string) {
  const tree = remark().parse(markdown);
  const headings = [];

  visit(tree, 'heading', (node) => {
    headings.push({
      level: node.depth,
      text: toString(node),
      position: node.position
    });
  });

  return headings;
}
```

### 2. Word Tokenization

**Current Pattern:**
```typescript
.match(/[a-z][a-z-]{3,}/g)
```

**Issues:**
- Primitive tokenization
- No handling of contractions, hyphenated words
- No stemming or lemmatization

**Recommended Solution: Natural Language Processing Library**

```typescript
// Install: bun add natural
import natural from 'natural';

function extractKeywords(text: string) {
  const tokenizer = new natural.WordTokenizer();
  const tokens = tokenizer.tokenize(text.toLowerCase());

  // Advanced: Use TF-IDF for better keyword extraction
  const tfidf = new natural.TfIdf();
  tfidf.addDocument(text);

  const keywords = [];
  tfidf.listTerms(0).forEach(item => {
    if (item.tfidf > threshold) {
      keywords.push(item.term);
    }
  });

  return keywords;
}
```

### 3. Date Formatting

**Current Pattern:**
```typescript
d.toISOString().replace("T", " ").replace("Z", " UTC")
```

**Issues:**
- String manipulation for date formatting
- No locale support
- Limited formatting options

**Recommended Solution: date-fns or Intl.DateTimeFormat**

```typescript
// Option 1: date-fns (bun add date-fns)
import { format } from 'date-fns';
import { utcToZonedTime } from 'date-fns-tz';

function formatDate(date: Date) {
  return format(utcToZonedTime(date, 'UTC'), "yyyy-MM-dd HH:mm:ss 'UTC'");
}

// Option 2: Native Intl.DateTimeFormat (no dependencies)
function formatDateNative(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short'
  }).format(date);
}
```

### 4. Filename Sanitization

**Current Pattern:**
```typescript
.replace(/[\\/:*?"<>|]/g, '_')
```

**Issues:**
- May miss platform-specific invalid characters
- No handling of reserved names (CON, PRN, AUX on Windows)

**Recommended Solution: sanitize-filename**

```typescript
// Install: bun add sanitize-filename
import sanitize from 'sanitize-filename';

function sanitizeFilename(name: string) {
  return sanitize(name, { replacement: '_' });
}
```

### 5. Git Reference Parsing

**Current Pattern:**
```typescript
.replace(/^refs\/(heads|tags)\//, "")
```

**Issues:**
- Doesn't handle all git ref formats
- No type information about the ref

**Recommended Solution: Structured Parsing**

```typescript
interface GitRef {
  type: 'branch' | 'tag' | 'pull' | 'unknown';
  name: string;
  namespace?: string;
}

function parseGitRef(ref: string): GitRef {
  const parts = ref.split('/');

  if (parts[0] === 'refs') {
    switch (parts[1]) {
      case 'heads':
        return { type: 'branch', name: parts.slice(2).join('/') };
      case 'tags':
        return { type: 'tag', name: parts.slice(2).join('/') };
      case 'pull':
        return { type: 'pull', name: parts[2], namespace: 'pull' };
      default:
        return { type: 'unknown', name: ref };
    }
  }

  return { type: 'unknown', name: ref };
}
```

### 6. Markdown Validation

**Current Patterns:**
```typescript
/Bottom line:/i.test(text)
/^\s*[-*]/.test(line)
/Audience:\s*(Eng|PM|Research)/i.test(text)
```

**Issues:**
- Multiple regex passes over the same content
- No structural understanding of markdown
- Fragile pattern matching

**Recommended Solution: AST-based Validation with Streamdown**

```typescript
// For React/Next.js projects
import { Streamdown } from 'streamdown';
import { remark } from 'remark';
import { visit } from 'unist-util-visit';

interface ValidationResult {
  valid: boolean;
  errors: string[];
  structure: {
    headings: string[];
    lists: number;
    links: number;
    codeBlocks: number;
  };
}

function validateMarkdown(markdown: string): ValidationResult {
  const tree = remark().parse(markdown);
  const result: ValidationResult = {
    valid: true,
    errors: [],
    structure: {
      headings: [],
      lists: 0,
      links: 0,
      codeBlocks: 0
    }
  };

  visit(tree, (node) => {
    switch (node.type) {
      case 'heading':
        result.structure.headings.push(toString(node));
        break;
      case 'list':
        result.structure.lists++;
        validateListContent(node, result);
        break;
      case 'link':
        result.structure.links++;
        break;
      case 'code':
        result.structure.codeBlocks++;
        break;
    }
  });

  return result;
}
```

## Streamdown Integration for AI Reports

Since the industry-research.ts script generates AI-powered markdown, Vercel's Streamdown is particularly well-suited:

### Benefits for AI-Generated Content

1. **Streaming Support**: Handles incomplete markdown chunks
2. **Security**: Built-in sanitization for untrusted content
3. **Math Rendering**: LaTeX support for scientific papers
4. **Code Highlighting**: Shiki integration for technical content
5. **GitHub Flavored Markdown**: Tables and task lists

### Implementation Example

```typescript
// components/ResearchReport.tsx (if adding React UI)
import { Streamdown } from 'streamdown';

export function ResearchReport({ markdown, isStreaming }) {
  return (
    <Streamdown
      parseIncompleteMarkdown={isStreaming}
      allowedImagePrefixes={['https://arxiv.org', 'https://doi.org']}
      allowedLinkPrefixes={['https://', 'http://']}
      shikiTheme="github-light"
      components={{
        // Custom citation rendering
        a: ({ href, children }) => {
          if (href?.match(/\[\d+\]/)) {
            return <cite>{children}</cite>;
          }
          return <a href={href}>{children}</a>;
        }
      }}
    >
      {markdown}
    </Streamdown>
  );
}
```

## Implementation Priority

### High Priority (Quick Wins)
1. **Date formatting** - Simple replacement, immediate benefit
2. **Filename sanitization** - Security improvement
3. **Git ref parsing** - Better type safety

### Medium Priority (Moderate Effort)
1. **Markdown heading extraction** - Requires remark setup
2. **Word tokenization** - Improves topic extraction

### Low Priority (Larger Refactor)
1. **Full markdown validation** - Requires significant refactoring
2. **Streamdown integration** - Requires React/UI setup

## Migration Strategy

1. **Phase 1**: Add utility libraries
   - Create `scripts/lib/markdown-utils.ts`
   - Add date-fns, sanitize-filename dependencies
   - Write tests for new utilities

2. **Phase 2**: Gradual replacement
   - Replace simple patterns first (dates, filenames)
   - Add remark for markdown parsing
   - Maintain backward compatibility

3. **Phase 3**: Streamdown integration
   - If adding UI components, integrate Streamdown
   - Use for report rendering and validation
   - Remove legacy regex validation

## Performance Considerations

- **AST parsing**: Slightly slower than regex but more accurate
- **Caching**: Cache parsed ASTs when processing same content multiple times
- **Lazy loading**: Import heavy libraries only when needed

```typescript
// Lazy loading example
async function parseMarkdownIfNeeded(content: string) {
  if (!needsAdvancedParsing(content)) {
    return simpleParser(content);
  }

  const { remark } = await import('remark');
  const { visit } = await import('unist-util-visit');
  // ... use advanced parsing
}
```

## Testing Strategy

```typescript
// tests/markdown-utils.test.ts
import { describe, it, expect } from 'bun:test';
import { extractHeadings, sanitizeFilename, formatDate } from '../scripts/lib/markdown-utils';

describe('Markdown Utilities', () => {
  describe('extractHeadings', () => {
    it('should extract all heading levels', () => {
      const md = '# H1\n## H2\n### H3';
      const headings = extractHeadings(md);
      expect(headings).toEqual([
        { level: 1, text: 'H1' },
        { level: 2, text: 'H2' },
        { level: 3, text: 'H3' }
      ]);
    });

    it('should handle inline formatting in headings', () => {
      const md = '# Header with **bold** and *italic*';
      const headings = extractHeadings(md);
      expect(headings[0].text).toBe('Header with bold and italic');
    });
  });
});
```

## Conclusion

Replacing regex patterns with specialized libraries will:
- Reduce bugs from edge cases
- Improve code maintainability
- Add type safety
- Make the codebase more professional

The recommended approach is gradual migration, starting with simple replacements and moving toward comprehensive solutions like Streamdown for AI-generated content handling.
