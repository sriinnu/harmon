
App Name: **Harmon** ✅
Your naming convention **`@athena/harmon`** fits perfectly. I’d make `@athena/harmon` the *user-facing CLI package*, and keep the daemon/core split behind it so you can evolve without breaking users.

## Naming contract (so everything stays crisp)

* NPM scope: `@athena/*`
* CLI package: `@athena/harmon` → installs binary `harmon`
* Daemon package: `@athena/harmond` → binary `harmond`
* Shared protocol/types: `@athena/harmon-protocol`
* Core engine (policy/ranker/state machine): `@athena/harmon-core`
* Spotify integration: `@athena/harmon-spotify`
* Local DB/store: `@athena/harmon-store`
* macOS menubar app (separate repo/app): `harmon-menubar` (not necessarily published to npm)

This keeps your public surface minimal: users think “Harmon,” you keep internals modular.

## System shape (one brain, many faces)

```
WSL CLI (plain) ─┐
                 ├──► harmond (localhost) ─► Spotify Web API ─► active Spotify device plays audio
macOS menubar ───┘             │
                               └──► (optional later) Apple Music mac control
```

WSL stays a dumb client. macOS menubar adds voice. **Only `harmond` owns tokens + state + learning.**

## Repo layout (monorepo that won’t rot)

```txt
harmon/
  apps/
    harmon-cli/           # thin client → calls daemon
    harmond/              # daemon: engine + store + spotify
    harmon-menubar/       # macOS client (Tauri or SwiftUI) + voice capture
  packages/
    harmon-protocol/      # Command/Event/Policy types + zod schemas
    harmon-core/          # session engine + ranking + adaptation
    harmon-store/         # sqlite + migrations
    harmon-spotify/       # spotify API client + oauth + device control
    harmon-voice/         # macOS-only: STT + intent parsing (optional LLM)
```

## Daemon API contract (simple, debuggable, future-proof)

I’d do **HTTP + SSE** (server-sent events) for streaming state. WebSockets also fine, but SSE is boring and reliable.

**Endpoint discovery**

* Default: `http://127.0.0.1:17373`
* Override: `HARMON_ENDPOINT`
* Add `harmon doctor` that prints what it found.

> WSL note: if WSL can’t reach Windows `localhost` in your setup, you’ll just set `HARMON_ENDPOINT` to the reachable host IP. That’s why this knob exists.

### REST

* `GET /v1/status` → current session, device, track, queue depth
* `POST /v1/command` → send commands (start session, nudge, skip, etc.)
* `GET /v1/devices` → spotify devices
* `POST /v1/device/use` → transfer playback
* `POST /v1/auth/spotify/login` → triggers PKCE login flow (daemon prints URL; clients can open it)
* `POST /v1/auth/spotify/logout`

### SSE stream

* `GET /v1/events` → emits events like `session.started`, `track.changed`, `queue.refilled`, `user.nudged`

**Command envelope**

```json
{
  "id": "c_01H…",
  "ts": 1760000000000,
  "source": { "kind": "cli|menubar|voice", "device": "macos|windows|wsl" },
  "type": "session.start",
  "payload": { }
}
```

**Event envelope**

```json
{
  "id": "e_01H…",
  "ts": 1760000000123,
  "type": "track.started",
  "payload": { }
}
```

This keeps the daemon deterministic and your clients trivial.

## SessionPolicy schema (the thing that keeps “AI” on a leash)

This is the heart. Everything—CLI flags, voice intent, presets—compiles into this.

### JSON shape (v1)

```json
{
  "version": 1,
  "mode": "focus",
  "durationMs": 3000000,

  "device": { "preferActive": true, "deviceId": null },

  "queue": { "target": 12, "refillWhenBelow": 5 },

  "hard": {
    "noVocals": true,
    "explicit": "avoid",
    "tempo": { "min": 60, "max": 110 },
    "energy": { "min": 0.15, "max": 0.55 },
    "instrumentalnessMin": 0.70
  },

  "soft": {
    "weights": {
      "energy": 0.20,
      "instrumentalness": 0.35,
      "speechiness": -0.40,
      "valence": 0.05,
      "acousticness": 0.10,
      "tempo": 0.10,
      "recencyPenalty": 0.50
    },
    "arc": { "shape": "flat|ramp", "warmupMs": 300000, "cooldownMs": 300000 }
  },

  "sources": {
    "likedTracks": true,
    "topTracks": true,
    "recentPlays": true,
    "seedPlaylists": ["spotify:playlist:…"],
    "seedArtists": ["spotify:artist:…"],
    "discovery": { "enabled": true, "ratio": 0.15 }
  },

  "limits": {
    "repeatTrackWithinDays": 14,
    "repeatArtistWithinHours": 6
  },

  "dhyana": {
    "breath": { "cadence": "slow|medium|none" },
    "fadeInMs": 12000,
    "fadeOutMs": 12000,
    "volumeCeiling": 40
  }
}
```

### Why this works

* “AI” never directly queues tracks. It only produces **Policy JSON**.
* Policy is validated (zod) → engine executes.
* Your skip reasons and nudges translate to small weight deltas, not random behavior.

## Voice on macOS (only)

Voice client does:

1. Push-to-talk record (3–8s)
2. STT (local preferred) → text
3. Intent → **SessionPolicy** (bounded)
4. POST `/v1/command` with `session.start` / `session.nudge` / `skip(reason)`

The daemon stays identical. Voice is just another client.

## Your first 10 TODOs (the “don’t overthink it” sequence)

1. Create monorepo + `harmond` + `harmon-cli` skeleton.
2. Implement `/v1/status` + `/v1/command` + `/v1/events` (no Spotify yet).
3. Implement Session Engine state machine with a fake “track queue” (in-memory).
4. Add SQLite store + event log.
5. Add Spotify OAuth + token persistence.
6. Implement device discovery + play/pause/next + add-to-queue.
7. Implement “session.start (focus)” that fills queue to target.
8. Implement “nudge calmer/sharper” (weight deltas) + “skip(reason)”.
9. Add macOS menubar client (status + start/stop).
10. Add push-to-talk STT + map to bounded policy.

