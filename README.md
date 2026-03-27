# Harmon

<p align="center">
  <img src="logo.svg" alt="Harmon Logo" width="200" height="200"/>
</p>

<p align="center">
  <strong>Production-grade, multi-provider music session manager with daemon-first architecture</strong>
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

## Overview

Harmon is a **production-grade, multi-provider music session runtime** that runs as a background service and exposes a **HTTP+SSE API** for controlling policy-driven playback sessions. It keeps contracts shared through a provider-agnostic protocol layer and ships first-class provider packages for Spotify, Apple Music, and YouTube Music.

At runtime, Harmon is explicitly provider-aware:

- **Spotify** uses native Spotify Connect playback and full daemon-backed session orchestration
- **Apple Music** uses catalog/library APIs, recent-play signals, playlist browsing, and macOS AppleScript local playback
- **YouTube Music** uses official Data API search, liked-library tracks, playlist browsing, related-track recommendations, and browser handoff playback

### Core Philosophy

- **🎯 Policy-Driven**: AI preferences compile to deterministic JSON policies
- **🔒 Daemon-First**: Runs as a background service, always ready to respond
- **⚡ Event-Streaming**: Real-time updates via Server-Sent Events (SSE)
- **🛡️ Production-Ready**: Rate limiting, encryption, structured logging, comprehensive error handling
- **🔐 Privacy-First**: All data stays local, journal entries in Markdown
- **🎵 Intelligent Queue**: Two-phase ranking (hard constraints + soft scoring) with energy arc modulation

### Provider Matrix

| Provider | Session Runtime | Playback Mode | Notes |
|---------|------------------|---------------|-------|
| Spotify | Full daemon-backed orchestration | Native Spotify Connect | Best support for queueing, device control, and feature-driven policy constraints |
| Apple Music | Provider-aware session orchestration | macOS AppleScript local playback | Catalog/library, playlist browse, recent-play signals, and local playback; playback requires macOS and Apple tokens |
| YouTube Music | Provider-aware session orchestration | Browser handoff | Search, liked-library tracks, playlist browse, related-track recommendations, and local queue control; pause remains intentionally unsupported |

## Features

### Session Management
- ✅ **Start/stop music sessions** with configurable policies
- ✅ **Provider-aware sessions**: Target Spotify, Apple Music, or YouTube Music from the same daemon and CLI contract
- ✅ **Policy constraints**: Hard constraints (no vocals, tempo range) and soft weights (energy, valence)
- ✅ **Energy arcs**: Ramp-up, ramp-down, flat, or wave-shaped energy progression
- ✅ **Queue auto-refill**: Intelligent queue management with policy-driven track ranking
- ✅ **Adaptive nudging**: Adjust session energy on-the-fly (calmer/sharper)

### Track Intelligence
- ✅ **Two-phase ranking algorithm**: Binary filtering + weighted scoring
- ✅ **Audio feature analysis**: Energy, instrumentalness, tempo, valence, acousticness
- ✅ **Recency penalties**: Prevent track/artist repetition
- ✅ **Multi-source candidates**: Liked tracks, top tracks, playlists, recommendations, discovery
- ✅ **Provider adapters**: Shared contract layer for Spotify, Apple Music, and YouTube Music packages

### Current Provider Notes
- Spotify is the strongest end-to-end path for full playback, queue, device, and audio-feature policy control.
- Apple Music sessions can seed from catalog search, library tracks, playlists, and recent-play-derived personal signals when a user token is configured.
- YouTube Music sessions can seed from search, liked-library tracks, playlists, and related-track discovery when an access token is configured; they still do not provide native remote pause.

### Security & Production Features
- 🔒 **Rate limiting**: Global (120/min), Auth (5/15min), Commands (30/min)
- 🔐 **AES-256-GCM encryption**: Secure token/cookie storage
- 🛡️ **Timing-safe authentication**: Prevents timing attacks
- 🚫 **Strict CORS validation**: No wildcards in production
- 📊 **Structured logging**: Production-ready Pino logging with context
- ⚠️ **Centralized error handling**: Proper error responses and cleanup

### Data & Insights
- 📝 **Mood journaling**: Track sessions with Markdown journal entries
- 🔍 **Pattern detection**: AI-assisted pattern recognition for mood/energy trends
- 📈 **Session statistics**: Comprehensive analytics on playback history
- 🤖 **MCP integration**: Model Context Protocol server for AI assistant integration

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

| Package | Description | Status |
|---------|-------------|--------|
| `@athena/harmon-protocol` | Zod schemas for Command, Event, and Policy types | ✅ Production |
| `@athena/harmon-store` | SQLite persistence layer with migrations | ✅ Production |
| `@athena/harmon-core` | Core session engine with track ranking & queue management | ✅ Production |
| `@athena/harmon` | CLI client and terminal interface for harmond | ✅ Production |
| `@athena/harmon-spotify` | Spotify Web API integration (OAuth, playback, recommendations) | ✅ Production |
| `@athena/harmon-apple` | Apple Music integration (catalog, playlist tracks, library, provider sessions, macOS local playback routes) | ✅ Production |
| `@athena/harmon-youtube` | YouTube Music adapter for search, playlist tracks, provider sessions, browser-handoff playback, and session seeding | ✅ Production |
| `@athena/harmon-logger` | Structured logging with Pino | ✅ Production |
| `@athena/harmon-crypto` | AES-256-GCM encryption utilities | ✅ Production |
| `@athena/harmon-flow` | MCP servers for journal analysis and remote OpenAI/ChatGPT app integration | ✅ Production |
| `@athena/harmond` | Daemon with HTTP+SSE API, rate limiting, auth | ✅ Production |

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm 8+
- Provider credentials for the providers you want to enable

### Installation

```bash
# Clone the repository
git clone https://github.com/athena/harmon.git
cd harmon

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Start the daemon
pnpm --filter @athena/harmond start
```

### Running harmond

```bash
# Default configuration (port 17373)
harmond

# Custom configuration
harmond --port 8080 --db-path /path/to/harmon.db

# With environment variables
export HARMON_API_TOKEN=$(openssl rand -base64 32)
export HARMON_ENCRYPTION_SECRET=$(openssl rand -base64 32)
export SPOTIFY_CLIENT_ID="your_client_id"
export APPLE_MUSIC_DEVELOPER_TOKEN="your_apple_token"
export YOUTUBE_MUSIC_API_KEY="your_youtube_key"
harmond
```

### Quick Test

```bash
# Health check
curl http://localhost:17373/health

# Get daemon status (requires auth token if set)
curl -H "Authorization: Bearer $HARMON_API_TOKEN" \
  http://localhost:17373/v1/status

# Start a focus session
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

### Quick Provider Examples

```bash
# Spotify
harmon --provider spotify session start --mode focus

# Apple Music on macOS
harmon --provider apple session start --mode relax

# YouTube Music browser-handoff
harmon --provider youtube session start --mode energize
```

### Standalone Provider Pack Auth

Each first-class provider package now ships a local Chitragupta ecosystem profile plus package-scoped auth commands:

```bash
# Spotify pack
npm --prefix packages/harmon-spotify run auth

# Apple Music pack
npm --prefix packages/harmon-apple run auth

# YouTube Music pack
npm --prefix packages/harmon-youtube run auth
```

I keep provider-pack auth state under each package’s `.chitragupta-ecosystem/auth/` directory, and each package ships `.chitragupta-ecosystem/.profile.json` so external loaders can discover the auth bootstrap, refresh, status, logo, README, and skill artifacts directly.

## Security

### Production Requirements

Harmon enforces strict security in production environments:

- ✅ **API Token Required**: Set `HARMON_API_TOKEN` (required in production)
- 🔐 **Credential Encryption REQUIRED**: Set `HARMON_ENCRYPTION_SECRET` (min 32 chars) - **daemon will not start without it**
- ✅ **CORS Whitelist**: No wildcard origins allowed in production
- ✅ **Explicit OAuth Callback**: Set `SPOTIFY_CLIENT_ID` + `SPOTIFY_REDIRECT_URI` together when Spotify OAuth is enabled
- ✅ **Rate Limiting**: Automatic protection against abuse
- ✅ **Timing-Safe Auth**: Constant-time token comparison prevents timing attacks

**⚠️ Critical**: The daemon will **refuse to start** in production (`NODE_ENV=production`) unless `HARMON_API_TOKEN` and `HARMON_ENCRYPTION_SECRET` are set and `HARMON_CORS_ORIGINS` does not contain `*`. If Spotify OAuth is enabled, `SPOTIFY_CLIENT_ID` and `SPOTIFY_REDIRECT_URI` must be configured together. Cookie-only Spotify deployments remain valid without OAuth callback config. Journal, session, and event rows still remain unencrypted local SQLite data.

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
    topTracks?: boolean;          // User's top tracks
    recentPlays?: boolean;        // Recently played tracks
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
| GET | `/v1/apple/now-playing` | Current Apple Music track |
| GET | `/v1/apple/songs/:id` | Song details |
| GET | `/v1/apple/albums/:id` | Album details |
| GET | `/v1/apple/artists/:id` | Artist details |
| GET | `/v1/apple/playlists/:id` | Playlist details |
| GET | `/v1/apple/playlists/:id/tracks` | Playlist tracks |
| GET | `/v1/apple/library/*` | Library access (songs/albums/playlists) |
| GET | `/v1/apple/history` | Recent Apple Music tracks |
| GET | `/v1/apple/recommendations` | Apple recommendations from recent/seed signals |
| POST | `/v1/apple/play` | Play (AppleScript on macOS, Apple runtime required) |
| POST | `/v1/apple/pause` | Pause (AppleScript on macOS) |
| POST | `/v1/apple/next` | Next track (AppleScript on macOS) |
| POST | `/v1/apple/prev` | Previous track (AppleScript on macOS) |

#### YouTube Music
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/youtube/search` | Search YouTube Music songs, playlists, artists, and album-like playlist results |
| GET | `/v1/youtube/songs/:id` | Song details |
| GET | `/v1/youtube/playlists` | List owned YouTube playlists (OAuth required) |
| GET | `/v1/youtube/playlists/:id/tracks` | Playlist tracks |
| GET | `/v1/youtube/library/tracks` | Liked-library tracks (OAuth required) |
| GET | `/v1/youtube/recommendations` | Related-track recommendations |
| GET | `/v1/youtube/now-playing` | Current browser-handoff track |
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
│   └── harmond/              # Main daemon application
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
pnpm --filter @athena/harmon-flow start

# Start the remote streamable HTTP server for ChatGPT/OpenAI app use
pnpm --filter @athena/harmon-flow start:http
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
| `get_library_tracks` | List saved or liked tracks for a provider |
| `list_playlists` | List playlists for a provider |
| `get_playlist_tracks` | Fetch tracks from a playlist |
| `get_now_playing` | Read the active track for a provider runtime |
| `play_music` | Play a track immediately or search and play the first match |
| `pause_music` | Pause provider playback |
| `next_track` | Skip to the next track |
| `previous_track` | Return to the previous track |
| `start_session` | Start a session using the shared `SessionPolicy` contract |
| `nudge_session` | Nudge the active session calmer or sharper |
| `stop_session` | Stop the active session |

### OpenAI App Setup

OpenAI's MCP guidance for ChatGPT apps and API integrations expects a remote MCP server over streamable HTTP, with `search` and `fetch` for knowledge-style retrieval and a review-safe tool surface for write actions. Harmon's remote MCP server now matches that shape.

```bash
# Required for daemon-backed tools
export HARMON_API_TOKEN="your_daemon_token"

# Optional: protect the remote MCP server itself
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
pnpm --filter @athena/harmon-flow start:http
```

By default the remote MCP server listens on `http://127.0.0.1:17400/mcp`.
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
4. **Start Daemon**: `harmond`
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

- ⚡ **Zero memory leaks**: Careful resource management with proper cleanup
- 🚀 **Efficient SQLite**: Uses libsql for fast, embedded storage
- 📡 **Streaming**: SSE for real-time updates without polling
- 🪶 **Lightweight**: Minimal dependencies, focused on performance
- 🔄 **Smart caching**: Audio features cached to reduce API calls
- 📊 **Batched requests**: Spotify API calls batched up to 100 items

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

**⚠️ Important**: The daemon will not start if `HARMON_API_TOKEN` or `HARMON_ENCRYPTION_SECRET` are missing in production, or if `HARMON_CORS_ORIGINS` contains `*`. If Spotify OAuth is enabled, `SPOTIFY_CLIENT_ID` and `SPOTIFY_REDIRECT_URI` must also be set.

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
  <strong>Built with TypeScript, Express, SQLite, and ⚡</strong><br/>
  Made with ❤️ by <a href="https://github.com/sriinnu">Sriinnu</a>
</p>
