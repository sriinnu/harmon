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
# Or with environment config
HARMON_PORT=17373 HARMON_API_TOKEN=secret harmond
```

```typescript
// Programmatic usage
import { startDaemon } from '@athena/harmond';
await startDaemon({ port: 17373, dbPath: '.harmon.db' });
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
| `GET` | `/v1/sse` | Server-sent events stream |
| `POST` | `/v1/spotify/play` | Start/resume Spotify playback |
| `POST` | `/v1/apple/play` | Start Apple Music playback |

### SSE Events

`session.started`, `track.started`, `track.skipped`, `queue.refilled`, `heartbeat`

## Architecture

harmond is the long-running process at the center of harmon. It wires together harmon-core (engine), harmon-store (persistence), harmon-crypto (encryption), and provider packages (harmon-spotify, harmon-apple) behind an Express HTTP server with rate limiting, body validation, and SSE broadcasting.

## License

MIT
