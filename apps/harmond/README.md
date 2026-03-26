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
| `POST` | `/v1/command` | Send a Command envelope |
| `GET` | `/v1/devices` | List available playback devices |
| `POST` | `/v1/device/use` | Switch active device |
| `POST` | `/v1/auth/spotify/login` | Initiate Spotify OAuth |
| `POST` | `/v1/auth/spotify/import` | Import `sp_dc` / `sp_key` cookies |
| `GET` | `/v1/events` | Server-sent events stream (when SSE is enabled) |
| `POST` | `/v1/spotify/play` | Start/resume Spotify playback |
| `POST` | `/v1/apple/play` | Start Apple Music playback |

`/v1/status` includes per-provider `status`, `auth`, and `capabilities` fields so callers can distinguish live provider readiness from Apple catalog/library/playback coverage.

### SSE Events

`connected`, `heartbeat`, `session.started`, `session.stopped`, `session.nudged`, `queue.refilled`, `track.started`, `track.skipped`, `device.changed`, `spotify.connected`, `spotify.disconnected`, `error`

## Architecture

harmond is the long-running process at the center of harmon. It wires together harmon-core (engine), harmon-store (persistence), harmon-crypto (encryption), and provider packages (harmon-spotify, harmon-apple) behind an Express HTTP server with rate limiting, body validation, startup hardening, and SSE broadcasting.

## License

GNU Affero General Public License v3.0 only. See [LICENSE](../../LICENSE).
