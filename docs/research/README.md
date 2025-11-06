# FPF Pattern Research - Enhanced Analysis System

## Overview

This directory contains the automated FPF Pattern Research system, which tracks the evolution of patterns in the First Principles Framework specification.

## Features

### 1. 📊 Historical Tracking
- **Append-only journal**: New entries are added to the journal, preserving historical context
- **Snapshot storage**: Each run saves a complete snapshot in `pattern-history/`
- **Trend analysis**: Compare current state with previous runs to see evolution over time

### 2. 🔍 Change Detection
Detects three types of changes:
- **Added**: New patterns in the specification
- **Modified**: Changes to pattern titles or subtitles
- **Removed**: Patterns that no longer exist

### 3. 🤖 AI-Powered Analysis
- Uses Claude (Anthropic API) to analyze pattern changes
- Provides insights on:
  - Architectural implications
  - Emerging themes
  - Integration points and potential tensions
- Requires `ANTHROPIC_API_KEY` environment variable

### 4. 🧩 Dynamic Cluster Discovery
- Automatically discovers pattern relationships via cross-references
- Builds dependency graphs showing how patterns reference each other
- Infers cluster names from pattern titles
- Calculates cluster strength based on cross-reference frequency

### 5. 📁 Multiple Output Formats

#### **Markdown Journal** (`fpf-pattern-journal.md`)
- Human-readable chronological log
- Includes summaries, changes, clusters, and AI insights
- Historical entries preserved

#### **JSON Output** (`pattern-outputs/patterns-*.json`)
```json
{
  "metadata": { ... },
  "summary": { ... },
  "changes": [ ... ],
  "patterns": { ... },
  "clusters": [ ... ],
  "crossReferences": [ ... ],
  "insights": "..."
}
```

#### **Dependency Graph** (`pattern-outputs/dependency-graph-*.md`)
- Mermaid diagrams showing pattern relationships
- Limited to top 30 connections to avoid clutter

### 6. ⚠️ Alert System

**Alert Levels:**
- **🚨 High**: Core patterns changed, or 5+ new patterns added
- **⚠️ Medium**: 3+ patterns changed
- **ℹ️ Low**: 1-2 patterns updated
- **✓ None**: No changes detected

**Core Patterns** (trigger high alerts):
- A.1, A.2, A.3, A.4, A.5, E.2

## Directory Structure

```
docs/research/
├── README.md                           # This file
├── fpf-pattern-journal.md              # Main journal (human-readable)
├── pattern-history/                    # Historical snapshots
│   ├── 2025-11-06_12-00-00-local.json
│   └── 2025-11-07_12-00-00-local.json
└── pattern-outputs/                    # Analysis outputs
    ├── patterns-2025-11-06_12-00-00.json
    ├── patterns-2025-11-07_12-00-00.json
    ├── dependency-graph-2025-11-06_12-00-00.md
    └── dependency-graph-2025-11-07_12-00-00.md
```

## Running Locally

```bash
# Without AI analysis
bun run scripts/pattern-research.ts

# With AI analysis
ANTHROPIC_API_KEY=your_key_here bun run scripts/pattern-research.ts
```

## GitHub Workflow

The workflow runs:
- **Daily** at 17:00 UTC
- **Manually** via workflow_dispatch

### Workflow Behavior

1. Runs the pattern research script
2. Checks for changes in:
   - Journal
   - Pattern history
   - Pattern outputs
3. If changes detected:
   - Creates a new branch
   - Commits all changes
   - Opens a PR with:
     - Detailed summary
     - Alert level in title
     - Priority labels based on alert level
     - Links to outputs

### Required Secrets

- `ANTHROPIC_API_KEY` (optional): For AI-powered analysis
  - If not set, analysis runs but skips AI insights

## Use Cases

### For Developers
Use the **JSON output** for programmatic analysis:
```typescript
import { readFileSync } from 'fs';

const data = JSON.parse(readFileSync('pattern-outputs/patterns-latest.json'));

// Get all Constitutional patterns
const constitutional = Object.entries(data.patterns)
  .filter(([id, _]) => id.startsWith('A.'));

// Find patterns that reference A.1
const referencingA1 = data.crossReferences
  .filter(ref => ref.to === 'A.1')
  .map(ref => ref.from);
```

### For Project Managers
Read the **Markdown journal** for:
- Weekly pattern growth summaries
- Significant changes highlighted
- AI insights on strategic direction

### For Architects
Review the **dependency graphs** to:
- Understand pattern relationships
- Identify integration clusters
- Spot potential circular dependencies

## Changelog

### 2025-11-06 - Enhanced Analysis System
- ✅ Added historical tracking (append mode)
- ✅ Implemented change detection
- ✅ Added AI-powered analysis (Claude API)
- ✅ Dynamic cluster discovery
- ✅ Multiple output formats (JSON, Mermaid)
- ✅ Alert system with priority levels

### 2025-11-04 - Initial Version
- Basic pattern counting
- Static cluster definitions
- Single journal snapshot (overwrite mode)
