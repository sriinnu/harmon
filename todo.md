# Harmon Planning Doc

## Overview
Policy-driven music session manager. Daemon-first architecture with multiple clients (CLI, menubar, voice).

---

## Naming Convention

| Package | Binary | Purpose |
|---------|--------|---------|
| `@athena/harmon` | `harmon` | User-facing CLI |
| `@athena/harmond` | `harmond` | Daemon (engine + store + spotify) |
| `@athena/harmon-protocol` | — | Command/Event types + Zod schemas |
| `@athena/harmon-core` | — | Session engine, ranking, adaptation |
| `@athena/harmon-store` | — | SQLite + migrations |
| `@athena/harmon-spotify` | — | Spotify API client + OAuth + device control |
| `@athena/harmon-voice` | — | macOS STT + intent parsing |
| `@athena/harmon-flow` | — | User choice journal (markdown + SQLite index) |

---

## System Architecture

```
WSL CLI ─┐
         ├──► harmond (localhost:17373) ─► Spotify Web API
macOS menubar ───┘                       │
                                       └──► (future) Apple Music
```

**Only `harmond` owns tokens, state, and learning.**

---

## Daemon API

**Endpoint:** `http://127.0.0.1:17373` (override: `HARMON_ENDPOINT`)

### REST Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/status` | Current session, device, track, queue depth |
| POST | `/v1/command` | Send commands (start, nudge, skip, etc.) |
| GET | `/v1/devices` | Spotify devices |
| POST | `/v1/device/use` | Transfer playback |
| POST | `/v1/auth/spotify/login` | Trigger PKCE login |
| POST | `/v1/auth/spotify/logout` | Clear tokens |

### SSE Stream

| Event | Description |
|-------|-------------|
| `GET /v1/events` | Emits: `session.started`, `track.changed`, `queue.refilled`, `user.nudged` |

### Envelope Shapes

**Command:**
```json
{
  "id": "c_01H...",
  "ts": 1760000000000,
  "source": { "kind": "cli|menubar|voice", "device": "macos|windows|wsl" },
  "type": "session.start",
  "payload": { }
}
```

**Event:**
```json
{
  "id": "e_01H...",
  "ts": 1760000000123,
  "type": "track.started",
  "payload": { }
}
```

---

## SessionPolicy Schema (v1)

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
    "seedPlaylists": ["spotify:playlist:..."],
    "seedArtists": ["spotify:artist:..."],
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

**Key principle:** AI never directly queues tracks. It produces Policy JSON. Policy is validated → engine executes.

---

## User Choice Journal (`.harmonic-flow/`)

### Purpose
Track user choices over time so the AI agent can:
1. Interpret patterns → suggest auto-start sessions
2. Learn preferences → adjust policy weights

### Storage Layout

```
.harmonic-flow/
  2024-01-13T10-30-uuid.md   # raw journal entry (human-readable)
  2024-01-13T11-45-uuid.md
  ...
```

### Dual-Backing Strategy

| Storage | Purpose |
|---------|---------|
| **Markdown files** | Human-readable audit trail, LLM context, version-control friendly |
| **SQLite index (harmon-store)** | Fast queries for auto-suggestions, pattern analysis |

### Entry Shape

```markdown
---
ts: 2024-01-13T10:30:00Z
source: cli | menubar | voice
device: macos
sessionId: sess_xxx
policy: { "mode": "focus", "durationMs": 3600000, ... }
---

# Session Request

**Mood:** calm, tired
**Duration:** 60mins
**Explicit:** avoid
**Energy:** low
**Note:** need to focus on coding but feeling drained

---
*Auto-suggested based on similar sessions: 2024-01-11, 2024-01-08*
```

### Workflow

1. User makes choice → write `.md` file (atomic)
2. Daemon updates SQLite index (`choice_type`, `mood`, `duration`, `ts`, `policy_hash`)
3. AI agent reads `.md` files for reasoning + context
4. Fast lookups use SQLite index

---

## Implementation Phases

### Phase 1: Foundation
- [ ] Create monorepo (Turborepo + TypeScript + ESM)
- [ ] Set up `harmon-protocol` package with Zod schemas

### Phase 2: Core Daemon
- [ ] Implement `harmon-store` (SQLite + event log + index)
- [ ] Build `harmond` daemon with HTTP+SSE endpoints

### Phase 3: Spotify Integration
- [ ] Implement Spotify OAuth (PKCE + token refresh)
- [ ] Build `harmon-spotify` (device control, queue, Now Playing)

### Phase 4: Session Engine
- [ ] Build `harmon-core` (session state machine, policy ranking, queue refill)

### Phase 5: Flow & Journal
- [ ] Implement `harmon-flow` (markdown journal + SQLite index)

### Phase 6: Clients
- [ ] Add `harmon-cli` thin client
- [ ] Add `harmon-menubar` skeleton (Tauri)

### Phase 7: Voice (macOS)
- [ ] Add `harmon-voice` (STT + intent→Policy mapping)

---

## WSL Considerations

- Default endpoint: `http://127.0.0.1:17373`
- If WSL can't reach Windows localhost, use `HARMON_ENDPOINT` to override
- `harmon doctor` command to diagnose connectivity

---

## Voice on macOS

1. Push-to-talk record (3–8s)
2. STT (local preferred) → text
3. Intent → SessionPolicy (bounded)
4. POST `/v1/command` with `session.start` / `session.nudge` / `skip(reason)`

---

## Open Questions

1. **WSL/Windows bridge** — How will daemon discover reachable hosts?
2. **LLM integration** — Where does the AI agent live? Who owns it?
3. **Offline mode** — Behavior without Spotify connectivity?
4. **Policy compiler** — Who translates natural language → Policy JSON?
5. **Pattern detection** — What algorithm for auto-suggestions?

---

## References

- Spotify Web API: https://developer.spotify.com/documentation/web-api
- SSE: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events
- PKCE: https://auth0.com/docs/authenticate/login/pkce
