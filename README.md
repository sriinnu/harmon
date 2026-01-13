# Harmon

<p align="center">
  <svg width="200" height="200" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    <!-- Outer circle -->
    <circle cx="100" cy="100" r="90" stroke="#6366f1" stroke-width="4" fill="none"/>
    <!-- Inner harmonious waves -->
    <path d="M40 100 Q60 60 100 60 T160 100" stroke="#8b5cf6" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M40 100 Q60 140 100 140 T160 100" stroke="#a78bfa" stroke-width="3" fill="none" stroke-linecap="round"/>
    <!-- Center pulse -->
    <circle cx="100" cy="100" r="15" fill="#6366f1"/>
    <circle cx="100" cy="100" r="25" stroke="#8b5cf6" stroke-width="2" fill="none" opacity="0.6"/>
    <!-- Sound waves -->
    <path d="M25 100 Q35 85 25 70" stroke="#6366f1" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.5"/>
    <path d="M175 100 Q165 85 175 70" stroke="#6366f1" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.5"/>
  </svg>
</p>

<p align="center">
  <strong>Policy-driven music session manager with daemon-first architecture</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#api">API</a> •
  <a href="#configuration">Configuration</a>
</p>

---

## Overview

Harmon is a daemon-first music session manager that runs as a background service, exposing a **HTTP+SSE API** for controlling music playback sessions. It's designed to work with Spotify (and other music providers via plugins), running on macOS, Windows WSL, or Linux.

### Core Philosophy

- **Daemon-First**: Runs as a background service, always ready to respond
- **Policy-Driven**: Define session constraints (energy, tempo, vocals) as policies
- **Event-Streaming**: Real-time updates via Server-Sent Events (SSE)
- **Privacy-First**: All data stays local, journal entries in Markdown

## Features

- **Session Management**: Start/stop music sessions with configurable policies
- **Policy Constraints**: Hard constraints (no vocals, tempo range) and soft weights (energy, valence)
- **Energy Arcs**: Ramp-up, ramp-down, flat, or wave-shaped energy progression
- **Mood Journaling**: Track sessions with Markdown journal entries
- **Pattern Detection**: AI-assisted pattern recognition for mood/energy trends
- **Real-time Events**: SSE streaming for session updates, track changes, nudges
- **MCP Integration**: Model Context Protocol server for AI assistant integration

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Harmon System                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐  │
│  │   Client    │───▶│   harmond   │───▶│  harmon-store       │  │
│  │  (CLI/UI)   │    │  (daemon)   │    │  (SQLite)           │  │
│  └─────────────┘    └──────┬──────┘    └─────────────────────┘  │
│                            │                                    │
│                   HTTP+SSE │                                    │
│                            ▼                                    │
│                  ┌─────────────────┐                            │
│                  │  harmon-flow    │                            │
│                  │  (MCP Server)   │                            │
│                  └─────────────────┘                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Packages

| Package | Description |
|---------|-------------|
| `@athena/harmon-protocol` | Zod schemas for Command, Event, and Policy types |
| `@athena/harmon-store` | SQLite persistence layer with migrations |
| `@athena/harmon-core` | Core session engine and policy evaluation |
| `@athena/harmon-spotify` | Spotify Web API integration |
| `@athena/harmon-flow` | MCP server for journal analysis |
| `@athena/harmond` | Daemon with HTTP+SSE API |

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm 8+
- Spotify developer credentials (for Spotify integration)

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
# Default port (17373)
harmond

# Custom port
harmond --port 8080

# Custom database path
harmond --db-path /path/to/harmon.db
```

### Daemon Endpoints

```bash
# Health check
curl http://localhost:17373/health

# Get daemon status
curl http://localhost:17373/v1/status

# Start a session
curl -X POST http://localhost:17373/v1/command \
  -H "Content-Type: application/json" \
  -d '{
    "id": "c_001",
    "ts": 1704067200000,
    "source": {"kind": "cli", "device": "macos"},
    "type": "session.start",
    "payload": {"policy": {"version": 1, "mode": "focus"}}
  }'

# Subscribe to events (SSE)
curl http://localhost:17373/v1/events
```

## API Reference

### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/v1/status` | Daemon status |
| GET | `/v1/devices` | List Spotify devices |
| POST | `/v1/command` | Send a command |
| POST | `/v1/device/use` | Switch audio device |
| GET | `/v1/events` | SSE event stream |
| GET | `/v1/journal` | List journal entries |
| POST | `/v1/journal` | Add journal entry |
| GET | `/v1/stats` | Session statistics |

### SSE Events

```typescript
interface Event {
  id: string;      // e_abc12345
  ts: number;      // Unix timestamp
  type: EventType;
  payload: Record<string, unknown>;
}

type EventType =
  | 'session.started'
  | 'session.stopped'
  | 'session.nudged'
  | 'track.started'
  | 'track.ended'
  | 'heartbeat';
```

### Commands

```typescript
// Start a session
{
  id: "c_001",
  ts: 1704067200000,
  source: { kind: "cli", device: "macos" },
  type: "session.start",
  payload: { policy: SessionPolicy }
}

// Nudge session energy
{
  id: "c_002",
  ts: 1704067200000,
  source: { kind: "cli", device: "macos" },
  type: "session.nudge",
  payload: { direction: "calmer" | "sharper", amount?: number }
}

// Skip current track
{
  id: "c_003",
  ts: 1704067200000,
  source: { kind: "cli", device: "macos" },
  type: "skip",
  payload: { reason?: string }
}

// Stop session
{
  id: "c_004",
  ts: 1704067200000,
  source: { kind: "cli", device: "macos" },
  type: "session.stop",
  payload: {}
}
```

## Configuration

### Session Policy

```typescript
interface SessionPolicy {
  version: 1;
  mode?: 'focus' | 'relax' | 'energize' | 'meditate' | 'workout' | 'custom';
  durationMs?: number;

  device?: {
    preferActive?: boolean;
    deviceId?: string;
  };

  queue?: {
    target?: number;
    refillWhenBelow?: number;
  };

  hard?: {
    noVocals?: boolean;
    explicit?: 'allow' | 'avoid' | 'require';
    tempo?: { min?: number; max?: number };
    energy?: { min?: number; max?: number };
  };

  soft?: {
    weights?: {
      energy?: number;
      instrumentalness?: number;
      valence?: number;
      // ...
    };
    arc?: {
      shape?: 'flat' | 'ramp-up' | 'ramp-down' | 'wave';
      warmupMs?: number;
      cooldownMs?: number;
    };
  };

  sources?: {
    likedTracks?: boolean;
    topTracks?: boolean;
    recentPlays?: boolean;
    seedPlaylists?: string[];
    seedArtists?: string[];
  };
}
```

## MCP Server

Harmon includes an MCP (Model Context Protocol) server for AI assistant integration:

```bash
# Start MCP server
pnpm --filter @athena/harmon-flow start
```

### Available MCP Tools

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

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Lint
pnpm lint

# Watch mode
pnpm dev
```

## Environment Variables

```bash
# Spotify credentials
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_REDIRECT_URI=http://localhost:17373/v1/auth/spotify/callback

# Daemon configuration
HARMON_PORT=17373
HARMON_DB_PATH=.harmon.db
```

## Performance

- **Zero memory leaks**: Careful resource management with proper cleanup
- **Efficient SQLite**: Uses libsql for fast, embedded storage
- **Streaming**: SSE for real-time updates without polling
- **Lightweight**: Minimal dependencies, focused on performance

## License

MIT License - see [LICENSE](LICENSE) for details.

---

<p align="center">
  Made with ⚡ by Athena
</p>
