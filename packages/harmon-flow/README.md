# @athena/harmon-flow

![logo](./logo.svg)

> Graph-based journal for detecting music session patterns and generating suggestions.

## Install

```bash
pnpm add @athena/harmon-flow
```

## Quick Start

```typescript
import { createFlowParser, PatternGraphBuilder, SuggestionEngine } from '@athena/harmon-flow';

const parser = createFlowParser();
const entries = parser.parseDirectory('./journal');
const graph = new PatternGraphBuilder().build(entries);
const suggestions = new SuggestionEngine(graph).suggest({ mood: 'focus', time: '09:00' });
```

## API

| Export | Description |
|---|---|
| `createFlowParser()` | Markdown journal parser |
| `MarkdownParser` | Parser class for journal files |
| `PatternGraphBuilder` | Build a pattern graph from journal entries |
| `PatternDetector` | Detect recurring patterns (time, mood, policy) |
| `SuggestionEngine` | Generate session suggestions from patterns |
| `createMCPServer()` | Expose flow capabilities via MCP protocol |
| `JournalEntry` | Parsed journal entry type |
| `PatternGraph` / `GraphNode` / `GraphEdge` | Graph structure types |
| `Suggestion` | Generated suggestion type |

## Architecture

harmon-flow reads markdown journal entries, parses frontmatter metadata (mood, energy, context), and builds an in-memory graph of patterns. The `SuggestionEngine` traverses this graph to recommend session policies based on time-of-day, mood history, and past listening behavior. It optionally exposes an MCP server for AI assistant integration.

## License

MIT
