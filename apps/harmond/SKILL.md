---
name: harmond
description: HTTP+SSE daemon API to search, play, pause, and skip music on Spotify/Apple Music/YouTube Music and run policy-driven sessions
capabilities:
  - Serve a Bearer-token HTTP API for playback, search, library, sessions, and auth on all three providers
  - Cross-provider smart search and smart play with auth hints
  - Broadcast real-time events (track changes, session state) over Server-Sent Events
  - Recognize songs from base64 WAV audio via AudD
tags:
  - daemon
  - server
  - api
  - sse
provider: harmon
version: 0.2.1
---

# Harmond — HTTP API reference

Base URL: `http://127.0.0.1:17373`. All `/v1` routes require `Authorization: Bearer $HARMON_API_TOKEN` when the token is set (it always is in production). `/health` and `/player/*` pages are unauthenticated. `/v1/events` additionally accepts `?token=` (EventSource cannot send headers). `/v1/apple/remote/*` accepts the `APPLE_MUSIC_REMOTE_TOKEN` OR the main API token. The Spotify OAuth callback is exempt from auth.

## Core

**GET /health** — liveness, no auth.
```
→ (no body)
← {"status":"ok","version":"0.2.1","timestamp":"2026-07-13T12:00:00.000Z"}
```

**GET /v1/status** — daemon + provider readiness + active session.
```
→ (no body)
← {"isRunning":true,"version":"0.2.1","spotifyConnected":true,
   "features":{"sse":true},
   "providers":{"spotify":{"connected":true,...},"apple":{...},"youtube":{...}},
   "session":{"id":"s_1","isActive":true,"provider":"spotify","currentTrack":{...},
              "queueDepth":9,"policy":{...},"elapsedMs":120000,"startedAt":1752400000000}}
```

**POST /v1/command** — session control via the shared Command envelope. Types: `session.start` (payload `{policy}`), `session.stop`, `session.nudge` (payload `{direction:"calmer"|"sharper", amount?}`), `skip` (payload `{reason?}`).
```
→ {"id":"c_1","ts":1752400000000,"source":{"kind":"cli","device":"macos"},
   "type":"session.start","payload":{"policy":{"version":1,"provider":"spotify","mode":"focus"}}}
← {"success":true,"sessionId":"s_abc"}
```

**GET /v1/events** — SSE stream (`Accept: text/event-stream`; auth via header or `?token=`). Event types: `connected`, `heartbeat` (30s), `session.started`, `session.stopped`, `session.nudged`, `queue.refilled`, `track.started`, `track.skipped`, `device.changed`, `spotify.connected/disconnected`, `youtube.connected/disconnected`, `apple.connected/disconnected`, `error`.
```
→ GET /v1/events?token=$HARMON_API_TOKEN
← data: {"id":"e_ab12cd34","ts":1752400000000,"type":"connected","payload":{}}
```

Also: `GET /v1/devices` (Spotify devices), `POST /v1/device/use` `{deviceId}`, `GET /v1/journal?limit=`, `POST /v1/journal`, `GET /v1/stats`.

## Smart (cross-provider)

**GET /v1/smart/search?q=\<query\>&limit=5** — search all connected providers in parallel.
```
→ /v1/smart/search?q=weightless&limit=3
← {"success":true,"query":"weightless",
   "results":[{"provider":"spotify","tracks":[...]},{"provider":"youtube","tracks":[...]}],
   "unavailable":[{"provider":"apple","reason":"Not configured"}],
   "connectedProviders":["spotify","youtube"]}
```

**POST /v1/smart/play** — `{query?, uri?, provider?}`. With `uri`, routes by URI prefix; with `query`, searches (preferred provider or all) and plays the best match. When a provider needs auth, responds with `needsAuth:true` + `authUrl`/`authEndpoint` instead of failing.
```
→ {"query":"Bohemian Rhapsody"}
← {"success":true,"provider":"spotify","track":{...},
   "searchedProviders":["spotify","youtube"],
   "alternateProviders":[{"provider":"youtube","track":{...}}]}
```

## Spotify (`/v1/spotify/*`)

| Route | Body / query | Notes |
|-------|--------------|-------|
| `GET /search` | `?q=&type=track&limit=&offset=` | types: track/album/artist/playlist/... |
| `GET /now-playing` | — | current track or null |
| `POST /play` | `{uri?, contextUri?}` | `uri` = single track (`spotify:track:...`); `contextUri` = album/playlist/artist context |
| `POST /pause` / `/next` / `/prev` | `{}` | |
| `POST /seek` | `{positionMs}` | |
| `POST /volume` | `{volumePercent}` (0-100) | |
| `POST /shuffle` | `{state:boolean}` | |
| `POST /repeat` | `{state:"off"\|"track"\|"context"}` | |
| `POST /queue` | `{uri}` | |
| `GET /playlists` · `GET /playlists/:id/tracks` | `?limit=&offset=` | paged `{items:[...]}` |
| `GET /history` · `GET /library/tracks` · `GET /library/albums` | `?limit=` | |
| `GET /recommendations` | `?seed=&limit=` | may return `[]` — Spotify deprecated /recommendations for post-Nov-2024 apps |

```
→ POST /v1/spotify/play  {"uri":"spotify:track:4uLU6hMCjMI75M1A2tKUQC"}
← {"success":true}
```

## Apple Music (`/v1/apple/*`)

| Route | Body / query | Notes |
|-------|--------------|-------|
| `GET /search` | `?q=&type=songs&limit=` | |
| `GET /songs/:id` · `/albums/:id` · `/artists/:id` · `/playlists/:id` · `/playlists/:id/tracks` | | catalog lookups |
| `GET /library/songs` · `/library/albums` · `/library/playlists` | `?limit=` | needs user token |
| `GET /history` · `GET /recommendations` | `?limit=` / `?seed=` | |
| `GET /now-playing` | — | active Apple runtime |
| `POST /play` | `{url}` | **URL required for targeted playback** — no query-based play |
| `POST /pause` / `/next` / `/prev` | `{}` | |
| `/remote/*` (status, connect, commands, ack, state) | | iOS companion bridge; accepts remote token or API token |

```
→ POST /v1/apple/play  {"url":"https://music.apple.com/us/album/weightless/1440843092?i=1440843097"}
← {"success":true}
```

## YouTube Music (`/v1/youtube/*`)

| Route | Body / query | Notes |
|-------|--------------|-------|
| `GET /search` | `?q=&type=songs&limit=` | |
| `GET /songs/:id` · `/playlists` · `/playlists/:id/tracks` · `/library/tracks` | | OAuth needed for playlists/library |
| `GET /recommendations` | `?seed=&limit=` | search-based heuristic, not YouTube related-videos |
| `GET /now-playing` | — | daemon-managed state (`playbackTruth:"daemon-managed"`) |
| `POST /play` | `{uri}` | browser handoff — opens the URL |
| `POST /pause` | `{}` | returns **501** (unsupported in browser-handoff) |
| `POST /next` / `/prev` / `/queue` | `{}` / `{uri}` | local queue control |

```
→ POST /v1/youtube/play  {"uri":"https://music.youtube.com/watch?v=dQw4w9WgXcQ"}
← {"success":true}
```

## Auth (`/v1/auth/*`)

| Route | Body | Response |
|-------|------|----------|
| `POST /spotify/login` | — | `{"url":"https://accounts.spotify.com/authorize?..."}` — user opens it |
| `GET /spotify/callback` | (OAuth redirect) | plain text; no auth required |
| `POST /spotify/logout` | — | `{"success":true}` |
| `POST /spotify/import` | `{cookies:[...]}` | deprecated path — Spotify no longer supports cookie auth; use OAuth |
| `POST /youtube/login` | — | `{"url":"https://accounts.google.com/..."}` (503 if `YOUTUBE_MUSIC_CLIENT_ID` unset) |
| `GET /youtube/callback` | (OAuth redirect) | plain text |
| `POST /youtube/refresh` / `/youtube/logout` | — | `{"success":true}` |
| `POST /apple/set-user-token` | `{token}` | `{"success":true}` — token comes from MusicKit JS |
| `POST /apple/refresh` | — | `{"success":true,"hasToken":true}` |
| `POST /apple/logout` | — | `{"success":true}` |

## Recognition

**POST /v1/recognize** — `{audio: "<base64 WAV, 3-10s, 16kHz mono>"}`. This route gets a 4 MB JSON body budget (global cap is 100 KB); the audio field itself is capped at 2 MB. Requires `AUDD_API_TOKEN`; 503 if unset, 504 on upstream timeout.
```
→ {"audio":"UklGRi..."}
← {"success":true,"recognized":true,"title":"Weightless","artist":"Marconi Union",
   "album":"Weightless (Ambient Transmissions Vol. 2)","spotify":{"uri":"spotify:track:...",...},
   "apple":{"url":"https://music.apple.com/...",...}}
```

## Error envelope

All errors are `{"success":false,"error":"<message>","code":"<CODE>","details":...}`.

| Status | Codes |
|--------|-------|
| 400 | `VALIDATION_ERROR`, `INVALID_JSON` |
| 401 | `Unauthorized` (missing/wrong Bearer token) |
| 404 | `SESSION_NOT_FOUND`, `SSE_DISABLED` |
| 413 | `PAYLOAD_TOO_LARGE` (body over the JSON limit) |
| 429 | rate limited — global 120/min, `/v1/auth` 5/15min, `/v1/command` 30/min |
| 501 | `UNSUPPORTED_PLATFORM` (e.g. YouTube pause) |
| 502/503 | `UPSTREAM_SERVICE_ERROR`, `CONFIGURATION_ERROR`, `PROVIDER_UNAVAILABLE` |
| 500 | `INTERNAL_ERROR` |

## Environment

- `HARMON_PORT` (default 17373), `HARMON_BIND_ADDRESS` (default 127.0.0.1) — binding to a non-loopback address REQUIRES `HARMON_API_TOKEN` (startup throws otherwise).
- `HARMON_API_TOKEN` — Bearer token for `/v1`; required in production.
- `HARMON_ENCRYPTION_SECRET` (32+ chars) — encrypts stored credentials; required in production, loud console WARNING when unset in dev.
- `HARMON_DB_PATH`, `HARMON_CORS_ORIGINS` (no `*` in production).
- Provider creds: `SPOTIFY_CLIENT_ID`/`SPOTIFY_REDIRECT_URI`, `APPLE_MUSIC_DEVELOPER_TOKEN`/`APPLE_MUSIC_USER_TOKEN`/`APPLE_MUSIC_REMOTE_TOKEN`, `YOUTUBE_MUSIC_API_KEY` or `YOUTUBE_MUSIC_ACCESS_TOKEN`, `YOUTUBE_MUSIC_CLIENT_ID`, `AUDD_API_TOKEN`.
- Housekeeping: the `event_log` table is pruned of rows older than 30 days (at startup, then daily). The `/player/youtube` page never embeds the API token — it prompts once and keeps it in sessionStorage.

## Library exports

```typescript
import { createDaemon, Harmond } from '@sriinnu/harmond';

const daemon = createDaemon({ port: 17373, dbPath: '.harmon.db', enableSSE: true });
await daemon.start();   // listening on http://127.0.0.1:17373
await daemon.stop();
```
