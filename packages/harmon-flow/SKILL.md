---
name: harmon-flow
description: MCP servers to play, pause, skip, search, and control music (Spotify/Apple Music/YouTube Music), plus journal pattern analysis
capabilities:
  - Play, pause, skip, and search music across Spotify, Apple Music, and YouTube Music via MCP tools
  - Start, nudge, and stop policy-driven listening sessions on the Harmon daemon
  - Manage provider authentication (OAuth login/logout/refresh) as MCP tools
  - Parse markdown journal entries and expose pattern analysis / suggestions as MCP tools
tags:
  - mcp
  - music
  - playback
  - spotify
  - apple-music
  - youtube-music
  - journal
provider: harmon
version: 0.2.0
---

# Harmon Flow — the MCP surface for LLMs

This package is what an AI assistant talks to when it wants to play music. Both MCP servers proxy the Harmon daemon (`harmond`, default `http://127.0.0.1:17373`) and register the same music tool table from `src/mcp/music-tools.ts`. The daemon must be running for any music tool to work; journal tools only need `HARMON_FLOW_DIR`.

## Transports

| Mode | Start | Endpoint |
|------|-------|----------|
| stdio (default) | `harmon-mcp` (installed bin), `node ./dist/mcp/cli.js`, or `pnpm start:mcp` (repo root) | stdin/stdout |
| Streamable HTTP | `harmon-mcp --transport http` or `pnpm start:mcp:http` (repo root) | `http://127.0.0.1:17400/mcp` (health: `/healthz`) |

CLI flags: `--transport stdio|http`, `--host`, `--port`, `--path`, `--flow-dir`. Env equivalents: `HARMON_MCP_TRANSPORT`, `HARMON_MCP_HOST`, `HARMON_MCP_PORT`, `HARMON_MCP_PATH`, `HARMON_FLOW_DIR`.

Claude Desktop / Claude Code config (stdio):
```json
{
  "mcpServers": {
    "harmon": {
      "command": "node",
      "args": ["<repo>/packages/harmon-flow/dist/mcp/cli.js"],
      "env": { "HARMON_ENDPOINT": "http://127.0.0.1:17373", "HARMON_API_TOKEN": "<daemon token>" }
    }
  }
}
```

## Music tools (both servers)

Read tools — always visible:

| Tool | Args | What it does |
|------|------|--------------|
| `get_status` | — | Daemon/provider readiness + active session state. Call this first. |
| `auth_status` | — | Auth mode and capabilities per provider. |
| `search_music` | `provider` (spotify\|apple\|youtube), `query`, `kind` (track\|song\|album\|artist\|playlist, default song), `limit` (1-10) | Search one provider's catalog. |
| `smart_search` | `query`, `limit` (1-25, default 5) | Search ALL connected providers in parallel; compare availability. |
| `get_library_tracks` | `provider`, `limit` (1-25) | Saved/liked tracks. |
| `list_playlists` | `provider`, `limit` (1-25) | User playlists. |
| `get_playlist_tracks` | `provider`, `playlistId`, `limit` (1-50) | Tracks in a playlist. |
| `get_now_playing` | `provider?` | Current track. Omit `provider` (the right default for "what's playing?"): checks the active session first, then scans all providers and returns the first hit with its provider. |
| `list_devices` | — | Available Spotify playback devices. Use when playback fails with "no active device", then `use_device`. |

Write tools (playback, sessions, auth, recognition):

| Tool | Args | What it does |
|------|------|--------------|
| `smart_play` | `query?`, `uri?`, `provider?` | The "just play it" tool. Searches connected providers, plays first match. Returns `needsAuth` + an auth URL/hint when the requested provider needs login. Needs `query` or `uri`. |
| `play_music` | `provider`, `target?` (URI/URL), `query?`, `kind` (track\|song) | Play on a specific provider. `target` accepts `spotify:track:...`, Apple Music URL, or YouTube URL; a bare `query` is resolved via search first. Apple REQUIRES a direct URL — the tool refuses query-only Apple playback. |
| `pause_music` | `provider` | Pause. YouTube browser-handoff mode does not support pause (tool errors). |
| `resume_music` | `provider` (spotify\|apple) | Resume paused playback. Not available for YouTube browser-handoff. |
| `next_track` | `provider` | Skip forward. |
| `previous_track` | `provider` | Skip back. |
| `add_to_queue` | `provider` (spotify\|youtube), `uri` | Queue a track without interrupting the current one. |
| `set_volume` | `volumePercent` (0-100) | Spotify only. |
| `seek` | `positionMs` | Seek within the current Spotify track. Spotify only. |
| `set_shuffle` | `state` (boolean) | Spotify only. |
| `set_repeat` | `state` (off\|track\|context) | Spotify only. `context` repeats the album/playlist. |
| `use_device` | `deviceId` (from `list_devices`) | Transfer Spotify playback to a device — fixes "no active device". |
| `start_session` | `policy` (SessionPolicy from @sriinnu/harmon-protocol) | Start a policy-driven session (mode, hard constraints, soft weights incl. `targetEnergy`, sources, queue). |
| `nudge_session` | `direction` (calmer\|sharper), `amount?` (0-1), `reason?` | Shift the active session's energy target. |
| `stop_session` | — | Stop the active session. |
| `recognize_song` | `audio` (base64 WAV, 3-10s, 16kHz mono) | Identify a song via AudD (daemon needs `AUDD_API_TOKEN`). |
| `auth_spotify_login` | — | Returns OAuth URL for the user to open. |
| `auth_spotify_logout` | — | Clear Spotify tokens/cookies. |
| `auth_youtube_login` | — | Returns Google OAuth URL. |
| `auth_youtube_refresh` | — | Refresh YouTube access token. |
| `auth_youtube_logout` | — | Clear YouTube tokens. |
| `auth_apple_set_token` | `token` | Store an Apple Music user token (from MusicKit JS). |
| `auth_apple_refresh` | — | Regenerate the Apple developer token (needs key material). |
| `auth_apple_logout` | — | Clear Apple tokens. |

## Journal tools

- HTTP server: `search` (query journal entries — NOT for finding songs) and `fetch` (full entry by id).
- stdio server: `get_suggestions`, `find_similar_sessions`, `get_patterns`, `get_stats`, `get_entries`, `write_entry`, `analyze_mood_trends`, `get_graph`, plus journal entries as MCP resources (`harmon-flow://entry/<id>`).

## Write-tool visibility

- **stdio**: all tools (read + write) are always exposed — the local MCP host is trusted.
- **HTTP, no auth configured**: write tools are HIDDEN. On startup the server logs `[harmon-mcp] Write tools are HIDDEN (...)` listing them. Expose on loopback only with `HARMON_MCP_ALLOW_UNAUTHENTICATED_WRITES=1` (non-loopback hosts throw at startup).
- **HTTP, static bearer token** (`HARMON_MCP_BEARER_TOKEN`): the token gets read+write scopes BY DEFAULT. Restrict with `HARMON_MCP_BEARER_TOKEN_SCOPES="harmon.read"`.
- **HTTP, OAuth JWT** (issuer/authorization/token/JWKS endpoints set): write tools exposed; per-call scope checks against `harmon.read` / `harmon.write` (override via `HARMON_MCP_READ_SCOPES` / `HARMON_MCP_WRITE_SCOPES`).

Each HTTP session gets its own McpServer instance (one transport per server), keyed by `mcp-session-id`.

## Environment variables

| Var | Purpose |
|-----|---------|
| `HARMON_ENDPOINT` | Daemon base URL (default `http://127.0.0.1:17373`) |
| `HARMON_API_TOKEN` | Bearer token for the daemon's `/v1` API |
| `HARMON_MCP_BEARER_TOKEN` | Static bearer protecting the HTTP MCP server (read+write by default) |
| `HARMON_MCP_BEARER_TOKEN_SCOPES` | Restrict the static token's scopes (e.g. `harmon.read`) |
| `HARMON_MCP_ALLOW_UNAUTHENTICATED_WRITES` | `1` exposes write tools with no auth (loopback only) |
| `HARMON_MCP_HOST` / `HARMON_MCP_PORT` / `HARMON_MCP_PATH` / `HARMON_MCP_TRANSPORT` | HTTP bind overrides (defaults 127.0.0.1 / 17400 / /mcp / stdio) |
| `HARMON_MCP_ALLOWED_HOSTS` | Extra allowed Host headers for the HTTP app |
| `HARMON_MCP_OAUTH_ISSUER_URL` + `_AUTHORIZATION_ENDPOINT` + `_TOKEN_ENDPOINT` + `_JWKS_URL` + `HARMON_MCP_PUBLIC_URL` | Enable OAuth JWT mode |
| `HARMON_FLOW_DIR` | Journal directory for the journal tools |

Daemon-client errors are actionable: non-2xx responses surface status + response detail, and a timeout returns "Harmon daemon at <endpoint> did not respond within Ns — is harmond running?".

## Worked flow: "play Weightless by Marconi Union"

1. `get_status` — confirm the daemon is up and see which providers are connected.
2. `auth_status` — if the target provider isn't authenticated, call the matching `auth_*_login` tool and give the user the URL.
3. `smart_play` with `{"query": "Weightless Marconi Union"}` — plays on the first provider with a match and reports alternates.
4. `pause_music` with `{"provider": "spotify"}` when asked to stop.

## Provider quirks

- **Apple Music**: `play_music` needs a direct URL. Search first (`search_music` provider=apple), then pass the returned `url` as `target`.
- **YouTube Music**: playback is browser-handoff — `pause_music` is unsupported; `next_track`/`previous_track` walk the daemon-managed queue.
- **Auth**: `smart_play` returns `needsAuth` plus an auth URL or a pointer to the right `auth_<provider>_login` tool instead of failing silently.

## Library exports

`MarkdownParser`, `createFlowParser`, `PatternGraphBuilder`, `PatternDetector`, `SuggestionEngine`, `HarmonFlowMCPServer`/`createMCPServer` (stdio), `HarmonAppMCPServer`/`createAppMCPServer` (HTTP), `createDaemonAppClient`.

```typescript
import { createMCPServer, createAppMCPServer } from '@sriinnu/harmon-flow';

await createMCPServer({ flowDir: './journals' });          // stdio: journal + all music tools
await createAppMCPServer({ port: 17400 });                 // HTTP:  per-session MCP at /mcp
```
