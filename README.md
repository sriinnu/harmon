# Harmon

<p align="center">
  <img src="logo.svg" alt="Harmon Logo" width="200" height="200"/>
</p>

<p align="center">
  <strong>Multi-provider music runtime for Spotify, Apple Music, and YouTube Music.</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#api">API</a> •
  <a href="#security">Security</a> •
  <a href="#configuration">Configuration</a>
</p>

---

> **New to Harmon?** Start with the [Getting Started guide](docs/getting-started.md) -- clone, install, connect a provider, and play music in under 5 minutes.

### Highlights

- **Smart Play** -- search all connected providers in parallel and play the best match: `harmon smart-play "Bohemian Rhapsody"`
- **Smart Search** -- compare results across Spotify, Apple Music, and YouTube Music side by side
- **Song Recognition** -- `harmon listen` records ambient audio and identifies the song via AudD or Chromaprint, with `--play` to immediately queue it
- **YouTube Mini Player** -- open `http://localhost:17373/player/youtube` for an embedded player that auto-syncs with daemon sessions
- **MCP for AI Assistants** -- full tool surface for Claude and ChatGPT via local stdio or remote HTTP MCP servers
- **Cross-provider sessions** -- policy-driven curation (focus, relax, energize, meditate, workout) on any provider

---

## Overview

Harmon is a **daemon-first music runtime** that lets a human, a local app, or an AI assistant ask for music in one contract and route it to the right provider surface.

What Harmon gives you on day one:

- **One control plane** for Spotify, Apple Music, and YouTube Music
- **One runtime contract** across CLI, web, companion, and MCP surfaces
- **One policy model** for focus, calm, energy shaping, and queue refill
- **One local system** with encrypted credentials, rate limits, and explicit provider truth

At runtime, Harmon stays honest about each provider:

- **Spotify** is the strongest end-to-end path with native Connect playback, queue control, device selection, and feature-aware sessions.
- **Apple Music** supports catalog and library seeding plus either local macOS playback or an iOS remote companion playback target.
- **YouTube Music** supports search, playlists, library-like liked-video flows, and browser handoff playback with daemon-managed state.

### Core Philosophy

- **Policy-driven**: I compile mood and intent into deterministic session policies.
- **Daemon-first**: I keep a long-lived runtime ready for CLI, web, MCP, and companion surfaces.
- **Provider-aware**: I do not pretend every provider has identical playback or data surfaces.
- **Production-shaped**: I keep auth, encryption, rate limiting, and error handling in the runtime, not in the UI.
- **Local-first**: I keep state and journal data on your machine.

### Provider Matrix

| Provider | Session Runtime | Playback Mode | Notes |
|---------|------------------|---------------|-------|
| Spotify | Full daemon-backed orchestration | Native Spotify Connect | Best support for queueing, device control, and feature-driven policy constraints |
| Apple Music | Provider-aware session orchestration | macOS AppleScript local playback or iOS remote companion | Catalog/library, playlist browse, recent-play signals, local-history-backed top tracks, and Apple playback that can target either the local macOS Music app or a connected iOS companion; the companion expands playback targets, but Apple browse/session seeding still depends on daemon-side Apple catalog or library auth |
| YouTube Music | Provider-aware session orchestration | Browser handoff | Search, liked-video derived tracks, owned playlist browse, related-track recommendations, local-history-backed recent/top tracks, and local queue control; pause remains intentionally unsupported |

## Features

### Session Management
- **Start/stop music sessions** with configurable policies
- **Provider-aware sessions**: Target Spotify, Apple Music, or YouTube Music from the same daemon and CLI contract
- **Policy constraints**: Hard constraints (no vocals, tempo range) and soft weights (energy, valence)
- **Energy arcs**: Ramp-up, ramp-down, flat, or wave-shaped energy progression
- **Queue auto-refill**: Intelligent queue management with policy-driven track ranking
- **Adaptive nudging**: Adjust session energy on-the-fly (calmer/sharper)

### Track Intelligence
- **Two-phase ranking algorithm**: Binary filtering + weighted scoring
- **Audio feature analysis**: Energy, instrumentalness, tempo, valence, acousticness
- **Recency penalties**: Prevent track/artist repetition
- **Multi-source candidates**: Liked tracks, playlists, recommendations, discovery, and provider-specific recent-play signals
- **Provider adapters**: Shared contract layer for Spotify, Apple Music, and YouTube Music packages

### Current Provider Notes
- Spotify is the strongest end-to-end path for full playback, queue, device, and audio-feature policy control.
- Apple Music sessions can seed from catalog search, library tracks, playlists, recent provider history, and Harmon-local top-track history when the daemon has Apple catalog or library auth; playback can run through either local macOS AppleScript or a connected iOS remote companion, and macOS local playback remains the fallback when no companion is connected.
- YouTube Music sessions can seed from search, liked-video derived tracks, playlists, related-track discovery, and Harmon-local recent/top-track history; browser handoff still reports daemon-managed playback state rather than browser-verified truth.

### Security & Production Features
- **Rate limiting**: Global (120/min), Auth (5/15min), Commands (30/min)
- **AES-256-GCM encryption**: Secure token/cookie storage
- **Timing-safe authentication**: Prevents timing attacks
- **Strict CORS validation**: No wildcards in production
- **Structured logging**: Production-ready Pino logging with context
- **Centralized error handling**: Proper error responses and cleanup

### Data & Insights
- **Mood journaling**: Track sessions with Markdown journal entries
- **Pattern detection**: AI-assisted pattern recognition for mood/energy trends
- **Session statistics**: Comprehensive analytics on playback history
- **MCP integration**: Model Context Protocol server for AI assistant integration

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Harmon System                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────┐    HTTP+SSE    ┌──────────┐                          │
│  │  Client  │───────────────▶│ harmond  │                          │
│  │ (CLI/UI) │◀───────────────│ (daemon) │                          │
│  └──────────┘                └─────┬────┘                          │
│                                    │                                │
│                          ┌─────────┼─────────┬──────────┐           │
│                          │         │         │          │           │
│                          ▼         ▼         ▼          ▼           │
│                   ┌──────────┬─────────┬──────────┬──────────┐      │
│                   │  Core    │  Store  │ Provider │ Protocol │      │
│                   │  Engine  │ (SQLite)│ Adapters │ Contract │      │
│                   └──────────┴─────────┴──────────┴──────────┘      │
│                                    │                                │
│                                    ▼                                │
│                 ┌──────────────────────────────────────────┐         │
│                 │ Spotify / Apple Music / YouTube Music   │         │
│                 │            Provider Packages             │         │
│                 └──────────────────────────────────────────┘         │
│                                    │                                │
│                                    ▼                                │
│                           ┌─────────────────┐                       │
│                           │   harmon-flow   │                       │
│                           │   (MCP Server)  │                       │
│                           └─────────────────┘                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Packages

| Package | Description |
|---------|-------------|
| **apps/harmond** | Daemon server with HTTP+SSE API |
| **apps/harmon-cli** | CLI client and SDK (`npm install -g @sriinnu/harmon`) |
| **apps/harmon-web** | React web app with onboarding wizard |
| **apps/harmon-companion** | Swift iOS companion with Apple remote bridge |
| packages/harmon-protocol | Zod schemas for Command, Event, and Policy types |
| packages/harmon-core | Session engine with track ranking and queue management |
| packages/harmon-store | SQLite persistence layer with WAL mode |
| packages/harmon-spotify | Spotify Web API integration |
| packages/harmon-apple | Apple Music integration |
| packages/harmon-youtube | YouTube Music adapter |
| packages/harmon-logger | Structured Pino logging |
| packages/harmon-crypto | AES-256-GCM encryption |
| packages/harmon-flow | MCP server for AI assistants |

One npm package: `npm install -g @sriinnu/harmon` gives you both the `harmon` CLI and the `harmond` daemon. All other packages are internal workspace dependencies.

## Quick Start

For the full walkthrough (provider auth, smart play, listen, sessions, MCP, and all env vars), see **[docs/getting-started.md](docs/getting-started.md)**.

### Prerequisites

- Node.js 22+

### 1. Install

```bash
npm install -g @sriinnu/harmon
harmon init
```

One package gives you both the `harmon` CLI and the `harmond` daemon.

Or from source:
```bash
git clone https://github.com/sriinnu/harmon.git && cd harmon
pnpm install && pnpm build
```

### 2. Configure The Daemon

```bash
export HARMON_API_TOKEN=$(openssl rand -base64 32)
export HARMON_ENCRYPTION_SECRET=$(openssl rand -base64 32)
```

Then add only the providers you actually want:

```bash
# Spotify OAuth
export SPOTIFY_CLIENT_ID="your_client_id"
export SPOTIFY_REDIRECT_URI="http://127.0.0.1:17373/v1/auth/spotify/callback"

# Apple Music browse and session seeding
export APPLE_MUSIC_DEVELOPER_TOKEN="your_apple_token"

# Optional Apple iPhone/iPad remote playback companion
export APPLE_MUSIC_REMOTE_TOKEN="your_remote_companion_token"

# YouTube Music browse and search
export YOUTUBE_MUSIC_API_KEY="your_youtube_key"
```

### 3. Authenticate Providers

These commands bootstrap provider auth from the repo root:

```bash
pnpm auth:spotify
pnpm auth:apple
pnpm auth:youtube
```

I keep provider-pack auth state under `~/.chitragupta/harmon/provider-packs/<pack-id>/` by default. Set `HARMON_PACK_STATE_DIR` if you need a different local root.

### 4. Start The Runtime

```bash
pnpm start:daemon
```

### 5. Verify The Runtime

```bash
curl http://localhost:17373/health

curl -H "Authorization: Bearer $HARMON_API_TOKEN" \
  http://localhost:17373/v1/status
```

### 6. Pick A Control Surface

```bash
# Web app
pnpm start:web

# MCP / remote app surface
pnpm start:mcp:http

# CLI from the repo checkout
pnpm --filter @sriinnu/harmon exec harmon --help
```

### 7. Play Music

```bash
# Spotify
pnpm --filter @sriinnu/harmon exec harmon --provider spotify session start --mode focus

# Apple Music
pnpm --filter @sriinnu/harmon exec harmon --provider apple session start --mode relax

# YouTube Music
pnpm --filter @sriinnu/harmon exec harmon --provider youtube session start --mode energize
```

### 8. Raw API Example

```bash
# Start a focus session over HTTP

curl -X POST http://localhost:17373/v1/command \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $HARMON_API_TOKEN" \
  -d '{
    "id": "c_001",
    "ts": 1704067200000,
    "source": {"kind": "cli", "device": "macos"},
    "type": "session.start",
    "payload": {
      "policy": {
        "version": 1,
        "provider": "spotify",
        "mode": "focus",
        "hard": {"noVocals": true, "tempo": {"min": 90, "max": 130}},
        "soft": {
          "weights": {"energy": 0.7, "instrumentalness": 0.8},
          "arc": {"shape": "ramp-up", "warmupMs": 300000}
        }
      }
    }
  }'

# Subscribe to real-time events
curl -H "Authorization: Bearer $HARMON_API_TOKEN" \
  http://localhost:17373/v1/events
```

### Root Scripts

```bash
pnpm start:daemon
pnpm start:web
pnpm start:mcp
pnpm start:mcp:http
pnpm auth:spotify
pnpm auth:apple
pnpm auth:youtube
pnpm test:web
pnpm test:companion
pnpm check
```

## Security

### Production Requirements

Harmon enforces strict security in production environments:

- **API Token Required**: Set `HARMON_API_TOKEN` (required in production)
- **Credential Encryption REQUIRED**: Set `HARMON_ENCRYPTION_SECRET` (min 32 chars) - **daemon will not start without it**
- **CORS Whitelist**: No wildcard origins allowed in production
- **Explicit OAuth Callback**: Set `SPOTIFY_CLIENT_ID` + `SPOTIFY_REDIRECT_URI` together when Spotify OAuth is enabled
- **Rate Limiting**: Automatic protection against abuse
- **Timing-Safe Auth**: Constant-time token comparison prevents timing attacks

**Critical**: The daemon will **refuse to start** in production (`NODE_ENV=production`) unless `HARMON_API_TOKEN` and `HARMON_ENCRYPTION_SECRET` are set and `HARMON_CORS_ORIGINS` does not contain `*`. If Spotify OAuth is enabled, `SPOTIFY_CLIENT_ID` and `SPOTIFY_REDIRECT_URI` must be configured together. Cookie-only Spotify deployments remain valid without OAuth callback config. Journal, session, and event rows still remain unencrypted local SQLite data.

### Generating Secrets

```bash
# Generate API token
export HARMON_API_TOKEN=$(openssl rand -base64 32)

# Generate encryption secret (min 32 characters)
export HARMON_ENCRYPTION_SECRET=$(openssl rand -base64 32)
```

### Rate Limits

| Endpoint Type | Limit | Window |
|---------------|-------|--------|
| Global | 120 requests | 1 minute |
| Auth endpoints (`/v1/auth/*`) | 5 requests | 15 minutes |
| Commands (`/v1/command`) | 30 requests | 1 minute |
| Health check | Unlimited | - |

## Configuration

### Environment Variables

#### Required in Production
```bash
HARMON_API_TOKEN=your_api_token              # API authentication
HARMON_ENCRYPTION_SECRET=your_secret         # Token/cookie encryption (min 32 chars) - REQUIRED
HARMON_CORS_ORIGINS=https://app.example.com  # Comma-separated, no wildcards
```

**Optional for Spotify OAuth**
```bash
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_REDIRECT_URI=https://harmon.example/v1/auth/spotify/callback
```

**Note**: production startup is blocked unless `HARMON_API_TOKEN` and `HARMON_ENCRYPTION_SECRET` are set and `HARMON_CORS_ORIGINS` stays explicit. If you enable Spotify OAuth, set `SPOTIFY_CLIENT_ID` and `SPOTIFY_REDIRECT_URI` together. Generate a secure encryption secret using:
```bash
export HARMON_ENCRYPTION_SECRET=$(openssl rand -base64 32)
```

#### Optional
```bash
# Daemon Configuration
HARMON_PORT=17373                            # Server port (default: 17373)
HARMON_BIND_ADDRESS=127.0.0.1                # Bind address (default: 127.0.0.1)
HARMON_DB_PATH=.harmon.db                    # Database path (default: .harmon.db)
LOG_LEVEL=debug                              # trace|debug|info|warn|error|fatal|silent (default: info)
NODE_ENV=production                          # Affects logging, CORS, auth enforcement

# Spotify Configuration
SPOTIFY_CLIENT_SECRET=your_secret            # Optional for server-side OAuth

# Apple Music Configuration
APPLE_MUSIC_DEVELOPER_TOKEN=your_token       # Apple Music developer token
APPLE_MUSIC_USER_TOKEN=your_token            # Apple Music user token
APPLE_MUSIC_STOREFRONT=us                    # Storefront (default: us)
APPLE_MUSIC_REMOTE_TOKEN=your_remote_token   # Optional iOS companion playback token

# YouTube Music Configuration
YOUTUBE_MUSIC_API_KEY=your_key               # YouTube Data API key
# or
YOUTUBE_MUSIC_ACCESS_TOKEN=your_token        # OAuth access token
```

### Session Policy Schema

**Provider note**: feature-dependent hard constraints and soft weights are currently a Spotify-first surface. Apple Music and YouTube Music sessions support provider selection plus truthful source seeding, but they reject audio-feature policy knobs the runtime cannot honor honestly.

```typescript
interface SessionPolicy {
  version: 1;
  provider?: 'spotify' | 'apple' | 'youtube';
  mode?: 'focus' | 'relax' | 'energize' | 'meditate' | 'workout' | 'custom';
  durationMs?: number;

  // Device selection
  device?: {
    preferActive?: boolean;
    deviceId?: string;
  };

  // Queue management
  queue?: {
    target?: number;           // Target queue size (default: 12)
    refillWhenBelow?: number;  // Refill threshold (default: 5)
  };

  // Hard constraints (binary pass/fail)
  hard?: {
    noVocals?: boolean;                    // Require instrumentalness > 0.5
    explicit?: 'allow' | 'avoid' | 'require';
    tempo?: { min?: number; max?: number };      // BPM range
    energy?: { min?: number; max?: number };     // 0-1 range
    instrumentalnessMin?: number;                // Minimum instrumentalness
  };

  // Soft preferences (weighted scoring)
  soft?: {
    weights?: {
      energy?: number;              // Weight for energy matching
      instrumentalness?: number;    // Weight for instrumental tracks
      speechiness?: number;         // Weight for speech content (usually negative)
      valence?: number;             // Weight for positive mood
      acousticness?: number;        // Weight for acoustic sound
      tempo?: number;               // Weight for tempo matching
      recencyPenalty?: number;      // Penalty strength for recently played
    };
    arc?: {
      shape?: 'flat' | 'ramp-up' | 'ramp-down' | 'wave';
      warmupMs?: number;   // Warmup period (ms)
      cooldownMs?: number; // Cooldown period (ms)
    };
  };

  // Track sources
  sources?: {
    likedTracks?: boolean;        // User's saved tracks
    topTracks?: boolean;          // Spotify provider history or Harmon-local history for Apple/YouTube
    recentPlays?: boolean;        // Provider recent history or Harmon-local playback history
    searchQueries?: string[];     // Search-seeded candidate collection
    seedPlaylists?: string[];     // Playlist URIs (Spotify, Apple Music, YouTube Music)
    seedArtists?: string[];       // Artist URIs
    discovery?: {
      enabled: boolean;
      ratio: number;              // 0-1, percentage of discovery tracks
    };
  };

  // Repetition limits
  limits?: {
    repeatTrackWithinDays?: number;    // Don't repeat track within N days
    repeatArtistWithinHours?: number;  // Don't repeat artist within N hours
  };
}
```

## API Reference

### REST Endpoints

#### Session Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check (no auth required) |
| GET | `/v1/status` | Daemon status with session info, provider auth mode, and capabilities |
| POST | `/v1/command` | Send command (session.start, session.stop, session.nudge, skip) |
| GET | `/v1/devices` | List available Spotify devices |
| POST | `/v1/device/use` | Switch active device |

#### Spotify Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/auth/spotify/login` | Get OAuth login URL |
| GET | `/v1/auth/spotify/callback` | OAuth callback (no auth required) |
| POST | `/v1/auth/spotify/logout` | Clear tokens and cookies |
| POST | `/v1/auth/spotify/import` | Import Spotify auth cookies (`sp_dc`, `sp_key`) |

#### Spotify Playback & Library
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/spotify/now-playing` | Currently playing track |
| POST | `/v1/spotify/play` | Start/resume playback |
| POST | `/v1/spotify/pause` | Pause playback |
| POST | `/v1/spotify/next` | Skip to next track |
| POST | `/v1/spotify/prev` | Skip to previous track |
| POST | `/v1/spotify/seek` | Seek to position (ms) |
| POST | `/v1/spotify/volume` | Set volume (0-100) |
| POST | `/v1/spotify/shuffle` | Toggle shuffle |
| POST | `/v1/spotify/repeat` | Set repeat mode (off/track/context) |
| POST | `/v1/spotify/queue` | Add track to queue |
| GET | `/v1/spotify/search` | Search tracks/albums/artists/playlists/episodes/shows |
| GET | `/v1/spotify/playlists` | List user playlists |
| GET | `/v1/spotify/playlists/:id/tracks` | Get playlist tracks |
| GET | `/v1/spotify/history` | Recently played history |
| GET | `/v1/spotify/library/tracks` | User's saved tracks |
| GET | `/v1/spotify/library/albums` | User's saved albums |

#### Apple Music
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/apple/search` | Search Apple Music |
| GET | `/v1/apple/now-playing` | Current Apple Music track from the active Apple playback runtime |
| GET | `/v1/apple/songs/:id` | Song details |
| GET | `/v1/apple/albums/:id` | Album details |
| GET | `/v1/apple/artists/:id` | Artist details |
| GET | `/v1/apple/playlists/:id` | Playlist details |
| GET | `/v1/apple/playlists/:id/tracks` | Playlist tracks |
| GET | `/v1/apple/library/*` | Library access (songs/albums/playlists) |
| GET | `/v1/apple/history` | Recent Apple Music tracks |
| GET | `/v1/apple/recommendations` | Apple recommendations from recent/seed signals |
| POST | `/v1/apple/play` | Play on the active Apple playback runtime (macOS local or iOS remote companion) |
| POST | `/v1/apple/pause` | Pause on the active Apple playback runtime |
| POST | `/v1/apple/next` | Next track on the active Apple playback runtime |
| POST | `/v1/apple/prev` | Previous track on the active Apple playback runtime |
| GET | `/v1/apple/remote/status` | Read companion connectivity, pending command count, and remote playback state |
| POST | `/v1/apple/remote/connect` | Register the active iOS Apple companion |
| GET | `/v1/apple/remote/commands` | Poll queued Apple remote commands for the companion |
| POST | `/v1/apple/remote/commands/:id/ack` | Acknowledge one Apple remote command after the companion applies it |
| POST | `/v1/apple/remote/state` | Push verified Apple remote playback state back into harmond |

Apple remote companion notes:
- `/v1/apple/remote/*` is authenticated with `APPLE_MUSIC_REMOTE_TOKEN`, not the general daemon API token, when a remote token is configured.
- Companion polling and state updates act as the remote heartbeat; if they stop for too long, Harmon drops companion-verified playback truth until the device reconnects.
- This workspace now ships the daemon-side Apple remote bridge and the SwiftUI companion shell in `apps/harmon-companion`. It still does not ship a signed Xcode/iOS app bundle.
- The companion extends Apple playback targets; it does not replace daemon-side Apple catalog or library auth for Apple browse routes or session seeding.

#### YouTube Music
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/youtube/search` | Search YouTube Music songs, playlists, artists, and album-like playlist results |
| GET | `/v1/youtube/songs/:id` | Song details |
| GET | `/v1/youtube/playlists` | List owned YouTube playlists (OAuth required) |
| GET | `/v1/youtube/playlists/:id/tracks` | Playlist tracks |
| GET | `/v1/youtube/library/tracks` | Liked-library tracks (OAuth required) |
| GET | `/v1/youtube/recommendations` | Related-track recommendations |
| GET | `/v1/youtube/now-playing` | Returns the daemon-managed track state with `playbackTruth: "daemon-managed"` |
| POST | `/v1/youtube/play` | Open/start YouTube Music playback |
| POST | `/v1/youtube/pause` | Returns `501` in browser-handoff mode |
| POST | `/v1/youtube/next` | Advance to next queued YouTube track |
| POST | `/v1/youtube/prev` | Return to previous queued YouTube track |
| POST | `/v1/youtube/queue` | Add a YouTube track to the local queue |

#### Events & Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/events` | SSE event stream (real-time updates, when enabled) |
| GET | `/v1/journal` | List journal entries |
| POST | `/v1/journal` | Create journal entry |
| GET | `/v1/stats` | Session statistics |

### SSE Events

Events are streamed in real-time via Server-Sent Events:

```typescript
interface Event {
  id: string;      // e_abc12345
  ts: number;      // Unix timestamp (ms)
  type: EventType;
  payload: Record<string, unknown>;
}

type EventType =
  | 'connected'           // Initial SSE handshake event
  | 'heartbeat'           // Keepalive ping every 30s
  | 'session.started'     // Session began
  | 'session.stopped'     // Session ended
  | 'session.nudged'      // Energy adjusted
  | 'queue.refilled'      // Queue replenished
  | 'track.started'       // Track began playing
  | 'track.skipped'       // Track skip was requested
  | 'device.changed'      // Playback device changed
  | 'spotify.connected'   // Spotify auth successful
  | 'spotify.disconnected'// Spotify auth cleared
  | 'youtube.connected'   // YouTube auth successful
  | 'youtube.disconnected'// YouTube auth cleared
  | 'apple.connected'     // Apple Music auth successful
  | 'apple.disconnected'  // Apple Music auth cleared
  | 'error';              // Error occurred
```

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Development mode (watch)
pnpm dev

# Type checking
pnpm lint

# Run tests
pnpm test

# Code formatting
pnpm format
```

### Project Structure

```
harmon/
├── apps/
│   ├── harmon-cli/           # CLI package and terminal entrypoint
│   ├── harmond/              # Main daemon application
│   ├── harmon-companion/       # Swift iOS companion vertical for Apple remote and multi-provider browse/play
│   └── harmon-web/             # Small static web app for all three providers
├── packages/
│   ├── harmon-protocol/      # Shared command, event, and policy schemas
│   ├── harmon-store/         # SQLite persistence and migrations
│   ├── harmon-core/          # Session engine, ranking, and adaptation
│   ├── harmon-spotify/       # Spotify API client and playback adapter
│   ├── harmon-apple/         # Apple Music client
│   ├── harmon-youtube/       # YouTube Music adapter
│   ├── harmon-logger/        # Structured logging
│   ├── harmon-crypto/        # Encryption utilities
│   └── harmon-flow/          # MCP server
└── tools/
    └── Silo/                 # Cookie extraction utility
```

## MCP Server

Harmon includes MCP (Model Context Protocol) servers for both local stdio tooling and remote OpenAI/ChatGPT app integration.

```bash
# Start the local stdio server for journal-analysis tools
pnpm --filter @sriinnu/harmon-flow start

# Start the remote streamable HTTP server for ChatGPT/OpenAI app use
pnpm --filter @sriinnu/harmon-flow start:http
```

### Stdio MCP Tools

| Tool | Description |
|------|-------------|
| `get_suggestions` | Get track suggestions based on mood |
| `find_similar_sessions` | Find similar past sessions |
| `get_patterns` | Detect patterns in session history |
| `get_stats` | Get session statistics |
| `get_entries` | Retrieve journal entries |
| `write_entry` | Create journal entry |
| `analyze_mood_trends` | Analyze mood trends over time |
| `get_graph` | Get pattern detection graph |

### Remote App MCP Tools

These tools are exposed by the streamable HTTP server and are the app-facing surface for ChatGPT/OpenAI:

| Tool | Description |
|------|-------------|
| `search` | Search Harmon journal entries with ChatGPT-compatible MCP `search` output |
| `fetch` | Fetch a full journal entry with ChatGPT-compatible MCP `fetch` output |
| `get_status` | Get daemon/provider readiness and active session state |
| `search_music` | Search Spotify, Apple Music, or YouTube Music catalogs |
| `smart_search` | Compare results across all connected providers side by side |
| `smart_play` | Search all providers in parallel and play the best match |
| `recognize_song` | Record ambient audio and identify the song via AudD or Chromaprint |
| `get_library_tracks` | List saved or liked tracks for a provider |
| `list_playlists` | List playlists for a provider |
| `get_playlist_tracks` | Fetch tracks from a playlist |
| `get_now_playing` | Read the active track for a provider runtime |
| `play_music` | Play a track immediately or search and play the first match |
| `pause_music` | Pause provider playback; YouTube browser-handoff is intentionally unsupported |
| `next_track` | Skip to the next track |
| `previous_track` | Return to the previous track |
| `start_session` | Start a session using the shared `SessionPolicy` contract |
| `nudge_session` | Nudge the active session calmer or sharper |
| `stop_session` | Stop the active session |
| `auth_spotify` | Initiate Spotify OAuth login flow |
| `auth_apple` | Connect Apple Music with a developer token |
| `auth_youtube` | Connect YouTube Music with an API key or OAuth token |
| `auth_status` | Check authentication status for all providers |

### OpenAI App Setup

OpenAI's MCP guidance for ChatGPT apps and API integrations expects a remote MCP server over streamable HTTP, with `search` and `fetch` for knowledge-style retrieval and a review-safe tool surface for write actions. Harmon's remote MCP server now matches that shape.

```bash
# Required for daemon-backed tools
export HARMON_API_TOKEN="your_daemon_token"

# Protect the remote MCP server itself
export HARMON_MCP_BEARER_TOKEN="your_mcp_token"

# Optional: advertise OAuth metadata for app-review-friendly protected servers
export HARMON_MCP_OAUTH_ISSUER_URL="https://auth.example.com"
export HARMON_MCP_OAUTH_AUTHORIZATION_ENDPOINT="https://auth.example.com/authorize"
export HARMON_MCP_OAUTH_TOKEN_ENDPOINT="https://auth.example.com/token"
export HARMON_MCP_OAUTH_JWKS_URL="https://auth.example.com/.well-known/jwks.json"
export HARMON_MCP_PUBLIC_URL="https://harmon.example.com/mcp"

# Optional: override daemon endpoint
export HARMON_ENDPOINT="http://127.0.0.1:17373"

# Start remote MCP app server
pnpm --filter @sriinnu/harmon-flow start:http
```

By default the remote MCP server listens on `http://127.0.0.1:17400/mcp`.
Without MCP auth, the remote server stays read-only by default. Write tools require OAuth or a bearer token with `harmon.write`, unless you explicitly opt into local-only unauthenticated writes with `HARMON_MCP_ALLOW_UNAUTHENTICATED_WRITES=1`.
If you enable OAuth JWT mode, `HARMON_MCP_PUBLIC_URL` is required so the protected-resource metadata advertises the real public MCP URL instead of a local bind address.
Set `HARMON_MCP_HOST`, `HARMON_MCP_PORT`, `HARMON_MCP_PATH`, or `HARMON_MCP_TRANSPORT` to override the runtime contract.
Set `HARMON_MCP_READ_SCOPES` and `HARMON_MCP_WRITE_SCOPES` if you want different tool-scope boundaries than the defaults (`harmon.read` and `harmon.write`).

## Spotify Setup

1. **Create Spotify App**: Visit [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. **Add Redirect URI**: `http://localhost:17373/v1/auth/spotify/callback`
3. **Set Environment Variables**:
   ```bash
   export SPOTIFY_CLIENT_ID="your_client_id"
   export SPOTIFY_CLIENT_SECRET="your_client_secret"  # Optional
   ```
4. **Start Daemon**: `pnpm start:daemon`
5. **Get Login URL**: `POST /v1/auth/spotify/login`
6. **Open in Browser**: Approve access
7. **Verify**: `GET /v1/status` shows `providers.spotify.status: "ready"`

### Required Spotify Scopes

- `user-read-playback-state` - Read current playback state
- `user-modify-playback-state` - Control playback
- `user-read-currently-playing` - Read currently playing track
- `playlist-read-private` - Access private playlists
- `playlist-read-collaborative` - Access collaborative playlists
- `user-read-recently-played` - Read recent playback history
- `user-library-read` - Access saved tracks/albums
- `user-top-read` - Access top tracks/artists (NEW)

## Performance

- **Zero memory leaks**: Careful resource management with proper cleanup
- **Efficient SQLite**: Uses libsql for fast, embedded storage
- **Streaming**: SSE for real-time updates without polling
- **Lightweight**: Minimal dependencies, focused on performance
- **Smart caching**: Audio features cached to reduce API calls
- **Batched requests**: Spotify API calls batched up to 100 items

## Production Checklist

Before deploying to production:

- [ ] Set `NODE_ENV=production`
- [ ] Generate and set `HARMON_API_TOKEN`
- [ ] **Generate and set `HARMON_ENCRYPTION_SECRET` (min 32 chars) - MANDATORY**
- [ ] Configure `HARMON_CORS_ORIGINS` (no wildcards)
- [ ] Set up Spotify OAuth credentials if you need browser login
- [ ] Set `SPOTIFY_CLIENT_ID` and `SPOTIFY_REDIRECT_URI` together if OAuth is enabled
- [ ] Configure logging level (`LOG_LEVEL=info`)
- [ ] Set up process manager (PM2, systemd)
- [ ] Configure reverse proxy (nginx, caddy)
- [ ] Set up SSL/TLS certificates
- [ ] Monitor logs and error rates
- [ ] Set up database backups

**Important**: The daemon will not start if `HARMON_API_TOKEN` or `HARMON_ENCRYPTION_SECRET` are missing in production, or if `HARMON_CORS_ORIGINS` contains `*`. If Spotify OAuth is enabled, `SPOTIFY_CLIENT_ID` and `SPOTIFY_REDIRECT_URI` must also be set.

## Roadmap

### Phase 6: Testing (In Progress)
- [ ] Vitest workspace configuration
- [ ] Unit tests for all packages (target: 80%+ coverage)
- [ ] Integration tests for daemon API
- [ ] E2E tests for session flows
- [ ] CI/CD pipeline with GitHub Actions

### Future Enhancements
- [ ] Adaptive learning from skip behavior
- [ ] Multi-source playlist blending
- [ ] Context awareness (time of day, weather)
- [ ] Genre diversity enforcement
- [ ] Voice integration
- [ ] macOS menubar app
- [ ] Web UI dashboard

## Troubleshooting

### Build Issues on WSL

If you encounter permission errors on WSL:
```bash
# Try running on native macOS/Linux instead, or
# Use sudo (not recommended for development)
sudo pnpm install
```

### Spotify Authentication Failed

- Verify `SPOTIFY_CLIENT_ID` is correct
- Check redirect URI matches exactly
- Ensure app is not in development mode restrictions

### Queue Not Refilling

- Check Spotify is connected: `GET /v1/status`
- Verify session has valid policy with sources
- Check logs for error messages (`LOG_LEVEL=debug`)

## License

GNU Affero General Public License v3.0 only - see [LICENSE](LICENSE) for details.

## Contributing

Contributions welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

<p align="center">
  <strong>Built with TypeScript, Express, SQLite, and React.</strong><br/>
  <a href="https://github.com/sriinnu">Sriinnu</a>
</p>
