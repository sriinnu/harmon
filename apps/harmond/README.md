# @sriinnu/harmond

![logo](./logo.svg)

> Background daemon that owns the session engine, provider runtimes, and HTTP plus SSE control plane.

## Install

```bash
# Global install
pnpm add -g @sriinnu/harmond

# Or run from the repo
pnpm build
pnpm --filter @sriinnu/harmond start
```

## Quick Start

```bash
export HARMON_API_TOKEN=secret
export HARMON_ENCRYPTION_SECRET=$(openssl rand -base64 32)

# Optional provider setup
export SPOTIFY_CLIENT_ID=your_client_id
export SPOTIFY_REDIRECT_URI=http://127.0.0.1:17373/v1/auth/spotify/callback
export APPLE_MUSIC_DEVELOPER_TOKEN=your_apple_token
export APPLE_MUSIC_REMOTE_TOKEN=your_remote_companion_token
export YOUTUBE_MUSIC_API_KEY=your_youtube_key

# Start from an installed binary
harmond

# Or run from the repo
pnpm start:daemon

# Or run the installed binary with explicit production config
NODE_ENV=production \
HARMON_PORT=17373 \
HARMON_API_TOKEN=$HARMON_API_TOKEN \
HARMON_ENCRYPTION_SECRET=$HARMON_ENCRYPTION_SECRET \
harmond
```

Cookie-only Spotify deployments do not need `SPOTIFY_CLIENT_ID` or `SPOTIFY_REDIRECT_URI`.

```typescript
// Programmatic usage
import { createDaemon } from '@sriinnu/harmond';

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
| `POST` | `/v1/apple/play` | Start Apple Music playback on the active Apple runtime |
| `GET` | `/v1/apple/now-playing` | Read Apple Music now-playing state |
| `GET` | `/v1/apple/playlists/:id/tracks` | Read Apple Music playlist tracks |
| `GET` | `/v1/apple/remote/status` | Read Apple companion status and pending command state |
| `POST` | `/v1/apple/remote/connect` | Register the active iOS Apple companion |
| `GET` | `/v1/apple/remote/commands` | Poll queued Apple remote commands |
| `POST` | `/v1/apple/remote/commands/:id/ack` | Acknowledge an Apple remote command |
| `POST` | `/v1/apple/remote/state` | Push verified Apple remote playback state |
| `POST` | `/v1/youtube/play` | Open/start YouTube Music browser playback |
| `GET` | `/v1/youtube/search` | Search YouTube Music songs |
| `GET` | `/v1/youtube/playlists/:id/tracks` | Read YouTube Music playlist tracks |

`/v1/status` includes per-provider `status`, `auth`, `playbackMode`, and `capabilities` fields so callers can distinguish Spotify native playback, AppleScript-backed Apple Music playback, iOS remote Apple playback, and browser-handoff YouTube Music playback.

Apple remote notes:
- When `APPLE_MUSIC_REMOTE_TOKEN` is configured, `/v1/apple/remote/*` accepts that remote token instead of the general daemon API token.
- Companion polling and state updates act as the heartbeat that keeps the remote Apple runtime connected.
- On macOS, a configured Apple companion does not disable local AppleScript playback; local playback remains the fallback until a companion is actively connected.
- Apple remote expands playback targets only; Apple browse routes and Apple session seeding still require daemon-side Apple catalog or library auth.

Provider-aware sessions now accept truthful source subsets by provider:

- Spotify: full queue/discovery-oriented session surface
- Apple Music: `likedTracks`, `topTracks`, `recentPlays`, `searchQueries`, `seedPlaylists`
- YouTube Music: `searchQueries`, `seedPlaylists`

### SSE Events

`connected`, `heartbeat`, `session.started`, `session.stopped`, `session.nudged`, `queue.refilled`, `track.started`, `track.skipped`, `device.changed`, `spotify.connected`, `spotify.disconnected`, `error`

## Repo Workflow

```bash
pnpm start:daemon
pnpm auth:spotify
pnpm auth:apple
pnpm auth:youtube
```

## Architecture

harmond is the long-running process at the center of harmon. It wires together harmon-core (engine), harmon-store (persistence), harmon-crypto (encryption), and provider packages (harmon-spotify, harmon-apple, harmon-youtube) behind an Express HTTP server with rate limiting, body validation, startup hardening, and SSE broadcasting.

## License

GNU Affero General Public License v3.0 only. See [LICENSE](../../LICENSE).
