# @athena/harmon-flow

![logo](./logo.svg)

> Graph-based journal for detecting music session patterns and generating suggestions.

## Install

```bash
pnpm add @athena/harmon-flow
```

## Quick Start

```typescript
import {
  createFlowParser,
  PatternGraphBuilder,
  PatternDetector,
  SuggestionEngine,
} from '@athena/harmon-flow';

const parser = createFlowParser('./journal');
const entries = parser.scanDirectory();
const graph = new PatternGraphBuilder(entries).build();
const patterns = new PatternDetector(graph, entries).getAllPatterns();
const suggestions = new SuggestionEngine(graph, entries).suggest(
  ['focused'],
  'medium',
  'morning',
);
```

## API

| Export | Description |
|---|---|
| `createFlowParser()` | Markdown journal parser |
| `MarkdownParser` | Parser class for journal files with schema-validated frontmatter |
| `PatternGraphBuilder` | Build a pattern graph from journal entries |
| `PatternDetector` | Detect recurring patterns (time, mood, policy) |
| `SuggestionEngine` | Generate session suggestions from patterns |
| `createMCPServer()` | Start an MCP stdio server for flow analysis |
| `JournalEntry` | Parsed journal entry type |
| `PatternGraph` / `GraphNode` / `GraphEdge` | Graph structure types |
| `Suggestion` | Generated suggestion type |

## Architecture

harmon-flow reads markdown journal entries, validates frontmatter metadata (mood, energy, context) against its declared schema, and builds an in-memory graph of patterns. The `SuggestionEngine` traverses this graph to recommend session policies based on time-of-day, mood history, and past listening behavior. It optionally exposes an MCP server for AI assistant integration.

## License

GNU Affero General Public License v3.0 only. See [LICENSE](../../LICENSE).
