---
name: harmond
description: HTTP+SSE daemon that orchestrates sessions, providers, and playback
capabilities:
  - Serve an HTTP API for commands, status, device management, and auth flows
  - Broadcast real-time events (track changes, session state) over Server-Sent Events
  - Wire together harmon-core engine, harmon-store, harmon-crypto, and provider packages
tags:
  - daemon
  - server
  - api
  - sse
provider: harmon
version: 0.1.0
---

# Harmond

## What this does
harmond is the long-running background process at the center of harmon. It starts an Express HTTP server on port 17373 (configurable) that accepts Command envelopes, manages Spotify/Apple Music OAuth, controls playback devices, and streams events to connected clients via SSE. Internally it wires harmon-core (session engine), harmon-store (SQLite persistence), harmon-crypto (token encryption), and provider packages behind rate limiting, body validation, and graceful shutdown handling.

## When to use
- Running the harmon backend as a local service that the CLI or menubar app connects to
- Orchestrating a music session with policy-driven track selection and queue refilling
- Exposing harmon functionality over HTTP for integration with other tools or automations

## Key exports
- `createDaemon` — factory that configures the daemon instance with all routes
- `Harmond` — the daemon class managing lifecycle, SSE clients, engine, and providers

## Example
```typescript
import { createDaemon } from '@athena/harmond';

const daemon = createDaemon({
  port: 17373,
  dbPath: '.harmon.db',
  enableSSE: true,
});
await daemon.start();
// daemon is now listening on http://127.0.0.1:17373
```
