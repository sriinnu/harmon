# Harmon

<img src="logo.svg" alt="Harmon" width="96" align="right"/>

Local music daemon that gives one control plane over Spotify, Apple Music, and YouTube Music — for a human at a CLI, a web player, or an AI assistant over MCP. Policy-driven sessions (focus / relax / energize) with queue auto-refill, plus smart cross-provider search and play.

Everything runs on your machine: the daemon binds to loopback by default, credentials are encrypted at rest, and no state leaves the host.

- New here? [docs/getting-started.md](docs/getting-started.md) walks clone → auth → first song.
- Full HTTP API reference: [apps/harmond/SKILL.md](apps/harmond/SKILL.md)
- Full MCP tool reference: [packages/harmon-flow/SKILL.md](packages/harmon-flow/SKILL.md)

## System shape

```
 CLI (harmon)   web player   MCP server (harmon-mcp)   iOS companion
      └──────────────┴────────────┴──────────────────────┘
                     HTTP + SSE  (127.0.0.1:17373)
                  ┌───────────────────────────┐
                  │        harmond            │
                  │  session engine · store   │
                  │  auth · rate limiting     │
                  └──────┬──────┬──────┬──────┘
                     Spotify  Apple  YouTube
```

The daemon owns tokens, session state, and playback truth. Every client is a thin HTTP consumer. The AI-assistant path is `harmon-mcp` (stdio or streamable HTTP), which maps MCP tools onto daemon endpoints.

### Provider capabilities

| | Spotify | Apple Music | YouTube Music |
|---|---|---|---|
| Playback | Spotify Connect (native) | macOS Music.app / iOS companion | Browser handoff |
| Search / catalog | ✓ | ✓ | ✓ |
| Library / playlists | ✓ | ✓ (needs user token) | ✓ (needs OAuth) |
| Queue control | ✓ (incl. volume/seek/shuffle/repeat) | daemon-managed queue | daemon-managed queue; no pause |
| Recommendations | degraded for post-2024 Spotify apps (endpoint deprecated) | artist-similarity heuristic | search heuristic (`relatedToVideoId` is dead) |
| Auth | OAuth PKCE | developer token + MusicKit user token | OAuth or API key |

The daemon does not pretend providers are equal; unsupported operations fail with explicit errors rather than silent substitutes.

## Repository layout

```
apps/
  harmond/           Express daemon: routes/, middleware, session lifecycle, SSE
  harmon-cli/        CLI (bin/harmon.js) + typed HTTP client library (src/)
  harmon-web/        Vite/React control surface
  harmon-companion/  Swift iOS remote-playback companion
packages/
  harmon-protocol/   Zod schemas: Command/Event envelopes, SessionPolicy
  harmon-core/       Session engine: ranking, arcs, queue refill, history
  harmon-store/      SQLite (libsql) persistence + migrations
  harmon-crypto/     AES-256-GCM credential envelope
  harmon-spotify/    Spotify Web API client + PKCE auth
  harmon-apple/      Apple Music API client + MusicKit bootstrap
  harmon-youtube/    YouTube Data API client + OAuth
  harmon-flow/       MCP servers (music tools + journal analysis)
  harmon-logger/     Pino wrapper with credential redaction
tools/harmon-silo/   Swift helper: browser cookie export
```

Each package has a `SKILL.md` documenting its exact surface — those are the source of truth for exports, endpoints, and tools.

## Development setup

Requires Node ≥ 22, pnpm ≥ 10 (Swift toolchain only for companion/silo).

```bash
pnpm install
pnpm build            # turbo build, all packages
pnpm test:run         # vitest, all packages
pnpm lint             # tsc --noEmit everywhere
pnpm check            # lint + tests + swift tests + build + pack verification
```

Watch mode: `pnpm dev`. Single package: `pnpm --filter @sriinnu/harmond test:run`.

## Running the daemon

```bash
cp .env.example .env       # fill in provider credentials
pnpm start:daemon          # harmond on http://127.0.0.1:17373
curl -s http://127.0.0.1:17373/health
```

Minimum useful config is one provider. Spotify is the most capable path:

```bash
SPOTIFY_CLIENT_ID=...                # developer.spotify.com app
SPOTIFY_REDIRECT_URI=http://127.0.0.1:17373/v1/auth/spotify/callback
curl -X POST http://127.0.0.1:17373/v1/auth/spotify/login   # → open the returned URL
```

Apple Music: set `APPLE_MUSIC_DEVELOPER_TOKEN` (or TEAM_ID/KEY_ID/PRIVATE_KEY for auto-JWT) for catalog; add a MusicKit user token via `POST /v1/auth/apple/set-user-token` for library. YouTube: `YOUTUBE_MUSIC_CLIENT_ID` (+ optional secret) then `POST /v1/auth/youtube/login`, or `YT_API_KEY` for search-only.

Two warnings print at startup when unset, and they mean it:

- `HARMON_ENCRYPTION_SECRET` (32+ chars) — without it, OAuth tokens sit unencrypted in `.harmon.db`.
- `HARMON_API_TOKEN` — without it, every `/v1` endpoint trusts any local process.

Hard rules enforced at boot: production requires both; non-loopback binds (`HARMON_BIND_ADDRESS`) require the API token; `HARMON_CORS_ORIGINS=*` requires the API token.

## Wiring an AI assistant (MCP)

```bash
pnpm build
# stdio (Claude Code / Claude Desktop) — full music tool surface:
claude mcp add harmon -- node /path/to/harmon/packages/harmon-flow/dist/mcp/cli.js
# or once installed from npm: harmon-mcp
# streamable HTTP (ChatGPT/OpenAI apps) on http://127.0.0.1:17400/mcp:
pnpm start:mcp:http
```

This repo's own `.mcp.json` registers the stdio server, so Claude Code sessions in this checkout get the tools automatically.

Tools (see [packages/harmon-flow/SKILL.md](packages/harmon-flow/SKILL.md) for schemas):

- Discovery/read: `get_status`, `auth_status`, `get_now_playing` (provider optional — answers "what's playing?"), `smart_search`, `search_music`, `get_library_tracks`, `list_playlists`, `get_playlist_tracks`, `list_devices`, journal `search`/`fetch`
- Playback/write: `smart_play`, `play_music`, `resume_music`, `pause_music`, `next_track`, `previous_track`, `add_to_queue`, `set_volume`, `seek`, `set_shuffle`, `set_repeat`, `use_device`, `recognize_song`
- Sessions: `start_session`, `nudge_session`, `stop_session`
- Auth: `auth_spotify_login`/`logout`, `auth_youtube_login`/`refresh`/`logout`, `auth_apple_set_token`/`refresh`/`logout`

Write-tool visibility on the HTTP transport: hidden with no auth configured (set `HARMON_MCP_ALLOW_UNAUTHENTICATED_WRITES=1`, loopback only), enabled by default with a bearer token (`HARMON_MCP_BEARER_TOKEN`; restrict with `HARMON_MCP_BEARER_TOKEN_SCOPES="harmon.read"`). The stdio transport always exposes the full surface — it is spawned by a local, trusted host.

## HTTP API

Complete reference with request/response examples lives in [apps/harmond/SKILL.md](apps/harmond/SKILL.md). Orientation:

| Area | Endpoints |
|---|---|
| Health/status | `GET /health` (no auth), `GET /v1/status`, `GET /v1/stats` |
| Smart | `GET /v1/smart/search`, `POST /v1/smart/play` |
| Sessions | `POST /v1/command` (`session.start`/`stop`/`nudge`, `skip`), `GET /v1/events` (SSE; `?token=` for EventSource) |
| Per provider | `/v1/{spotify,apple,youtube}/` `search`, `play`, `pause`, `next`, `prev`, `now-playing`, `playlists`, library routes |
| Spotify extras | `seek`, `volume`, `shuffle`, `repeat`, `queue`, `GET /v1/devices`, `POST /v1/device/use` |
| Auth | `POST /v1/auth/spotify/login`, `/v1/auth/youtube/login`, `/v1/auth/apple/set-user-token`, logouts |
| Recognition | `POST /v1/recognize` (base64 WAV ≤ 2 MB raw; needs `AUDD_API_TOKEN`) |

All `/v1` routes require `Authorization: Bearer $HARMON_API_TOKEN` when the token is set (OAuth callbacks exempt). Errors are uniformly `{"success": false, "error": "...", "code": "..."}`. Rate limits: 120/min global, 30/min commands, 5/15min auth.

Session policies are the heart of the engine — the full schema is in [packages/harmon-protocol/SKILL.md](packages/harmon-protocol/SKILL.md). Short version:

```jsonc
{
  "version": 1,
  "mode": "focus",                     // focus|relax|energize|meditate|workout
  "provider": "spotify",
  "durationMs": 3600000,
  "hard": { "noVocals": true, "tempo": { "min": 60, "max": 110 } },
  "soft": { "targetEnergy": 0.4, "weights": { "instrumentalness": 0.35 } },
  "sources": { "likedTracks": true, "searchQueries": ["deep focus"] },
  "limits": { "repeatArtistWithinHours": 6 }
}
```

`nudge` shifts `soft.targetEnergy`; hard constraints filter, soft weights rank.

## Environment variables

| Variable | Purpose |
|---|---|
| `HARMON_PORT` / `HARMON_BIND_ADDRESS` | Daemon bind (default `127.0.0.1:17373`) |
| `HARMON_API_TOKEN` | Bearer auth for `/v1` (required: production, non-loopback, wildcard CORS) |
| `HARMON_ENCRYPTION_SECRET` | AES-256-GCM key for credentials at rest (32+ chars) |
| `HARMON_CORS_ORIGINS` | Comma-separated explicit origins |
| `HARMON_DB_PATH` | SQLite path (default `.harmon.db`) |
| `HARMON_EVENT_LOG_RETENTION_DAYS` / `HARMON_HISTORY_RETENTION_DAYS` | Event-log pruning (30 / 365) |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` / `SPOTIFY_REDIRECT_URI` | Spotify OAuth |
| `APPLE_MUSIC_DEVELOPER_TOKEN` or `APPLE_MUSIC_TEAM_ID`+`KEY_ID`+`PRIVATE_KEY` | Apple catalog auth |
| `APPLE_MUSIC_USER_TOKEN` / `APPLE_MUSIC_STOREFRONT` / `APPLE_MUSIC_REMOTE_TOKEN` | Apple library / storefront / iOS companion |
| `YOUTUBE_MUSIC_CLIENT_ID` / `YOUTUBE_MUSIC_CLIENT_SECRET` / `YT_API_KEY` | YouTube OAuth / API key |
| `AUDD_API_TOKEN` / `ACOUSTID_API_KEY` | Song recognition backends |
| `HARMON_ENDPOINT` | Daemon URL for CLI/MCP clients |
| `HARMON_MCP_*` | MCP transport/auth — see [packages/harmon-flow/SKILL.md](packages/harmon-flow/SKILL.md) |

## Testing

```bash
pnpm test:run                                   # everything (vitest)
pnpm --filter @sriinnu/harmond test:run         # one package
pnpm test:coverage
pnpm test:companion                             # Swift tests
```

Conventions: tests live next to sources (`*.test.ts`), provider HTTP is mocked at `fetch`, the daemon suite uses supertest against an in-memory store. `TESTING.md` has the details.

## Security model

- Loopback-first: the daemon refuses non-loopback binds without an API token.
- Credentials: AES-256-GCM envelope (fresh salt+IV per record) in SQLite and in the auth-CLI files under `~/.chitragupta/…` when `HARMON_ENCRYPTION_SECRET` is set; files are `0600`.
- Timing-safe token comparison; single-use CSRF-validated OAuth state; parameterized SQL throughout; AppleScript/URL targets allowlisted per provider.
- Logger redacts token-shaped fields as a safety net.
- Details and hardening notes: `ENCRYPTION_ENFORCEMENT.md`, `ENCRYPTION_QUICK_START.md`.

## Troubleshooting

- **"No active device" on Spotify play** — open any Spotify app, or `GET /v1/devices` + `POST /v1/device/use` (MCP: `list_devices` → `use_device`).
- **Provider says not connected after OAuth** — check `harmon auth status`; the daemon logs the exact missing credential at startup.
- **Queue not refilling** — the session's sources came back empty; loosen `hard` constraints or add `searchQueries`. Session start errors state the cause.
- **`pnpm install` fails on WSL** — build on native macOS/Linux; the Swift tooling is macOS-only.

## Contributing

`CONTRIBUTING.md` covers branch/PR conventions. Run `pnpm check` before pushing — it is the same gate CI runs.

## License

[AGPL-3.0-only](LICENSE) for the apps and provider packages, with one exception: [`@sriinnu/harmon-protocol`](packages/harmon-protocol/LICENSE) is **Apache-2.0** so other tools can adopt the Command/Event/SessionPolicy contract without copyleft obligations.

Provider trademarks belong to their owners; this project is unaffiliated with Spotify, Apple, or Google.
