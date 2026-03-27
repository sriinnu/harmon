# @athena/harmond

![logo](./logo.svg)

> Background daemon that orchestrates the session engine, providers, and exposes an HTTP+SSE API.

## Install

```bash
pnpm add @athena/harmond
```

## Quick Start

```bash
# Start the daemon
harmond
# Or with explicit production config
NODE_ENV=production \
HARMON_PORT=17373 \
HARMON_API_TOKEN=secret \
HARMON_ENCRYPTION_SECRET=$(openssl rand -base64 32) \
SPOTIFY_CLIENT_ID=your_client_id \
SPOTIFY_REDIRECT_URI=https://harmon.example/v1/auth/spotify/callback \
harmond
```

Cookie-only Spotify deployments do not need `SPOTIFY_CLIENT_ID` or `SPOTIFY_REDIRECT_URI`.

```typescript
// Programmatic usage
import { createDaemon } from '@athena/harmond';

const daemon = createDaemon({ port: 17373, dbPath: '.harmon.db' });
await daemon.start();
```

## API

### HTTP Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/v1/status` | Daemon and session status |
| `POST` | `/v1/command` | Send a Command envelope with provider-aware session policy |
| `GET` | `/v1/devices` | List available Spotify Connect devices |
| `POST` | `/v1/device/use` | Switch active Spotify device |
| `POST` | `/v1/auth/spotify/login` | Initiate Spotify OAuth |
| `POST` | `/v1/auth/spotify/import` | Import `sp_dc` / `sp_key` cookies |
| `GET` | `/v1/events` | Server-sent events stream (when SSE is enabled) |
| `POST` | `/v1/spotify/play` | Start/resume Spotify playback |
| `POST` | `/v1/apple/play` | Start Apple Music playback |
| `GET` | `/v1/apple/now-playing` | Read Apple Music now-playing state |
| `GET` | `/v1/apple/playlists/:id/tracks` | Read Apple Music playlist tracks |
| `POST` | `/v1/youtube/play` | Open/start YouTube Music browser playback |
| `GET` | `/v1/youtube/search` | Search YouTube Music songs |
| `GET` | `/v1/youtube/playlists/:id/tracks` | Read YouTube Music playlist tracks |

`/v1/status` includes per-provider `status`, `auth`, `playbackMode`, and `capabilities` fields so callers can distinguish Spotify native playback, AppleScript-backed Apple Music playback, and browser-handoff YouTube Music playback.

Provider-aware sessions now accept truthful source subsets by provider:

- Spotify: full queue/discovery-oriented session surface
- Apple Music: `likedTracks`, `searchQueries`, `seedPlaylists`
- YouTube Music: `searchQueries`, `seedPlaylists`

### SSE Events

`connected`, `heartbeat`, `session.started`, `session.stopped`, `session.nudged`, `queue.refilled`, `track.started`, `track.skipped`, `device.changed`, `spotify.connected`, `spotify.disconnected`, `error`

## Architecture

harmond is the long-running process at the center of harmon. It wires together harmon-core (engine), harmon-store (persistence), harmon-crypto (encryption), and provider packages (harmon-spotify, harmon-apple, harmon-youtube) behind an Express HTTP server with rate limiting, body validation, startup hardening, and SSE broadcasting.

## License

GNU Affero General Public License v3.0 only. See [LICENSE](../../LICENSE).
