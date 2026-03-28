---
name: harmon-flow
description: Journal pattern detection, graph analysis, and MCP server for music session insights
capabilities:
  - Parse markdown journal entries with frontmatter into structured data
  - Build pattern graphs from journal entries and detect time, mood, and policy patterns
  - Expose pattern analysis as an MCP server with tool definitions for LLM integration
tags:
  - patterns
  - journal
  - mcp
  - analysis
provider: harmon
version: 0.1.0
---

# Harmon Flow

## What this does
harmon-flow turns markdown journal entries into a queryable pattern graph. The MarkdownParser extracts and validates frontmatter (mood tags, energy level, session context, policy) from journal files. The PatternGraphBuilder constructs a directed graph of nodes and edges representing relationships between moods, energy levels, times, and policies. A PatternDetector finds recurring patterns, and the SuggestionEngine recommends session policies. The whole system is exposed as an MCP server for LLM tool use.

## When to use
- Analyzing journal history to find recurring mood-energy-time patterns
- Generating session policy suggestions based on past listening behavior
- Exposing harmon insights as MCP tools for Claude or other LLM agents

## Key exports
- `MarkdownParser` — parses markdown files with YAML frontmatter into JournalEntry objects
- `PatternGraphBuilder` — builds a graph of mood, energy, time, and policy nodes with weighted edges
- `HarmonFlowMCPServer` — MCP server that exposes pattern analysis as callable tools

## Example
```typescript
import {
  MarkdownParser,
  PatternGraphBuilder,
  createMCPServer,
} from '@sriinnu/harmon-flow';

const parser = new MarkdownParser({ path: './journals' });
const entries = parser.scanDirectory();
const graph = new PatternGraphBuilder(entries).build();
const server = await createMCPServer({ flowDir: './journals' });
```
