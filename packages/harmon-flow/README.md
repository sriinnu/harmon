# @sriinnu/harmon-flow

![logo](./logo.svg)

> Graph-based journal analysis plus MCP servers for local tooling and remote OpenAI/ChatGPT app integration.

## Install

```bash
pnpm add @sriinnu/harmon-flow
```

## Quick Start

```typescript
import {
  createFlowParser,
  PatternGraphBuilder,
  PatternDetector,
  SuggestionEngine,
} from '@sriinnu/harmon-flow';

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
| `createAppMCPServer()` | Start a remote streamable HTTP MCP server for OpenAI/ChatGPT app use |
| `HarmonAppMCPServer` | Remote MCP app server class with daemon-backed runtime tools |
| `JournalEntry` | Parsed journal entry type |
| `PatternGraph` / `GraphNode` / `GraphEdge` | Graph structure types |
| `Suggestion` | Generated suggestion type |

## Server Modes

From a fresh repo checkout, run `pnpm build` once before you start either server.

```bash
# Local stdio MCP server
pnpm --filter @sriinnu/harmon-flow start

# Remote streamable HTTP MCP server
pnpm --filter @sriinnu/harmon-flow start:http
```

The remote MCP server exposes:

- `search` and `fetch` for ChatGPT-compatible journal retrieval
- `get_status`, `search_music`, `get_library_tracks`, `list_playlists`, `get_playlist_tracks`, and `get_now_playing` for daemon/runtime reads
- `play_music`, `pause_music`, `next_track`, and `previous_track` for direct provider playback control
- `start_session`, `nudge_session`, and `stop_session` for session orchestration

Set `HARMON_ENDPOINT` to point at the daemon. If the daemon is protected, also set `HARMON_API_TOKEN` so the MCP server can authenticate upstream. Set `HARMON_MCP_BEARER_TOKEN` if you want bearer auth on the remote MCP endpoint. Without MCP auth, the remote server stays read-only by default. The default remote URL is `http://127.0.0.1:17400/mcp`.
If you need bearer-backed write tools, either set `HARMON_MCP_BEARER_TOKEN_SCOPES="harmon.read harmon.write"` or use OAuth JWT auth. `HARMON_MCP_ALLOW_UNAUTHENTICATED_WRITES=1` is available only for local development on loopback binds like `127.0.0.1`.
For OAuth-capable protected deployments, set `HARMON_MCP_OAUTH_ISSUER_URL`, `HARMON_MCP_OAUTH_AUTHORIZATION_ENDPOINT`, `HARMON_MCP_OAUTH_TOKEN_ENDPOINT`, `HARMON_MCP_OAUTH_JWKS_URL`, and `HARMON_MCP_PUBLIC_URL`. I fail fast without `HARMON_MCP_PUBLIC_URL` so the protected-resource metadata cannot accidentally advertise a local bind URL.

## Architecture

harmon-flow reads markdown journal entries, validates frontmatter metadata (mood, energy, context) against its declared schema, and builds an in-memory graph of patterns. The `SuggestionEngine` traverses this graph to recommend session policies based on time-of-day, mood history, and past listening behavior. It now exposes two MCP surfaces: a local stdio server for journal-analysis tools, and a remote streamable HTTP server that combines journal `search`/`fetch` tools with daemon-backed multi-provider runtime control for OpenAI/ChatGPT app use.

## License

GNU Affero General Public License v3.0 only. See [LICENSE](../../LICENSE).
