# Getting Started with Harmon

Harmon is a daemon-first music runtime that gives you one control plane for Spotify, Apple Music, and YouTube Music. This guide gets you from zero to playing music.

## Prerequisites

- **Node.js 22+**
- **pnpm 10+**
- **sox** (for `harmon listen` song recognition)
  ```bash
  brew install sox          # macOS
  sudo apt install sox      # Ubuntu
  ```

## Install

### Option 1: npm (recommended)

```bash
npm install -g @sriinnu/harmon
harmon init          # Interactive setup wizard
harmond             # Start daemon
```

One package gives you both the `harmon` CLI and the `harmond` daemon server.

### Option 2: From source

```bash
git clone https://github.com/sriinnu/harmon.git
cd harmon
pnpm install
pnpm build
```

## Start the Daemon

```bash
harmond              # If installed via npm
# or
pnpm start:daemon    # If running from source
```

The daemon listens on `http://127.0.0.1:17373` by default.

Verify it is running:

```bash
curl http://localhost:17373/health
```

## Connect a Provider

You need at least one music provider authenticated. Spotify is the easiest path.

### Spotify (Full OAuth)

1. Create an app at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Add redirect URI: `http://127.0.0.1:17373/v1/auth/spotify/callback`
3. Set environment variables:

```bash
export SPOTIFY_CLIENT_ID=your_client_id
export SPOTIFY_CLIENT_SECRET=your_client_secret          # optional for server-side refresh
export SPOTIFY_REDIRECT_URI=http://127.0.0.1:17373/v1/auth/spotify/callback
```

4. Authenticate (pick one method):

```bash
# Cookie import (fastest if you're already logged into Spotify in a browser)
harmon auth import --browser chrome

# OR: OAuth flow
curl -X POST http://localhost:17373/v1/auth/spotify/login
# Open the returned URL in your browser and approve access
```

5. Verify:

```bash
harmon auth status
# or
curl http://localhost:17373/v1/status
```

### YouTube Music (OAuth or API Key)

**API key only** (search, no library access):

```bash
export YT_API_KEY=your_key
# or
export YOUTUBE_MUSIC_API_KEY=your_key
```

**Full OAuth** (library, playlists, liked tracks):

```bash
export YOUTUBE_MUSIC_CLIENT_ID=your_client_id
export YOUTUBE_MUSIC_REDIRECT_URI=http://127.0.0.1:17373/v1/auth/youtube/callback
```

```bash
# Start OAuth login
harmon auth youtube login
# Opens browser — approve access
```

### Apple Music (Static Tokens or Auto-JWT)

**Option 1: Static tokens**

```bash
export APPLE_MUSIC_DEVELOPER_TOKEN=your_jwt_developer_token
export APPLE_MUSIC_USER_TOKEN=your_user_token              # for library access
export APPLE_MUSIC_STOREFRONT=us                           # default: us
```

**Option 2: Auto-regenerating JWT (recommended for production)**

```bash
export APPLE_MUSIC_TEAM_ID=your_team_id
export APPLE_MUSIC_KEY_ID=your_key_id
export APPLE_MUSIC_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----..."
```

See also: [docs/spotify.md](spotify.md), [docs/apple-music.md](apple-music.md)

## Play Music

```bash
# Play a Spotify track by URI
harmon play spotify:track:4cOdK2wGLETKBW3PvgPWqT

# Play an Apple Music URL
harmon --provider apple play "https://music.apple.com/us/album/1132331970"

# Play a YouTube Music video
harmon --provider youtube play "https://music.youtube.com/watch?v=dQw4w9WgXcQ"

# Resume playback (no argument)
harmon play
```

### Smart Play (Cross-Provider)

Searches all connected providers in parallel and plays the best match:

```bash
harmon smart-play "Bohemian Rhapsody"
```

### Smart Search

Compare results across every connected provider:

```bash
harmon smart-search "lofi beats"
```

### Search a Single Provider

```bash
harmon search track "daft punk"
harmon --provider apple search track "chill vibes"
harmon --provider youtube search track "late night focus"
```

## Sessions (Policy-Driven Curation)

Sessions let Harmon pick, rank, and queue tracks for you based on a mood policy.

```bash
# Start a focus session on Spotify (default provider)
harmon session start --mode focus

# Start on a specific provider
harmon --provider youtube session start --mode relax
harmon --provider apple session start --mode energize

# Adjust a live session
harmon session nudge calmer
harmon session nudge sharper

# Stop the session
harmon session stop
```

Available modes: `focus`, `relax`, `energize`, `meditate`, `workout`, `custom`

Session options:

```bash
harmon session start --mode focus --duration 30m --instrumental
harmon session start --mode workout --energy 0.9
```

## Song Recognition

Harmon can listen to ambient audio and identify the playing song.

```bash
# Auto mode (uses AudD if token set, else Chromaprint)
harmon listen

# Recognize AND play the song
harmon listen --play

# Force a specific backend
harmon listen --backend audd
harmon listen --backend chromaprint

# Longer recording for noisy environments
harmon listen --duration 10
```

### Recognition Backends

**AudD (commercial, best accuracy):**

```bash
export AUDD_API_TOKEN=your_token   # Get one free at https://audd.io/
harmon listen
```

**Chromaprint + AcoustID (open-source, free):**

```bash
brew install chromaprint ffmpeg   # macOS
# sudo apt install libchromaprint-tools ffmpeg   # Ubuntu
harmon listen --backend chromaprint
```

## YouTube Mini Player

Harmon serves a built-in YouTube Music player page from the daemon:

```
http://localhost:17373/player/youtube
```

Open this in a browser. When you start a YouTube session or play YouTube tracks, the embedded player picks up tracks automatically via the daemon SSE stream.

## Encryption (Production)

For production deployments, both secrets are mandatory:

```bash
export HARMON_ENCRYPTION_SECRET=$(openssl rand -base64 32)
export HARMON_API_TOKEN=$(openssl rand -base64 32)
```

The daemon refuses to start in `NODE_ENV=production` without these.

## For AI Assistants

Harmon exposes three integration surfaces:

| Surface | Entry Point | Notes |
|---------|-------------|-------|
| **CLI** | `harmon` with `--json` flag | Structured JSON output for scripting |
| **HTTP API** | `http://localhost:17373/v1/*` | REST + SSE events |
| **MCP** | Model Context Protocol server | For Claude, ChatGPT, and other LLM tools |

### MCP Setup

```bash
# Local stdio MCP (journal tools)
pnpm start:mcp

# Remote streamable HTTP MCP (full tool surface for ChatGPT/OpenAI)
pnpm start:mcp:http
```

Key MCP tools: `play_music`, `search_music`, `start_session`, `nudge_session`, `stop_session`, `get_now_playing`, `get_status`, `get_library_tracks`, `list_playlists`, `pause_music`, `next_track`, `previous_track`

## Environment Variables Reference

### Daemon

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `HARMON_API_TOKEN` | Production | — | Bearer token for API auth |
| `HARMON_ENCRYPTION_SECRET` | Production | — | AES-256-GCM key (min 32 chars) |
| `HARMON_PORT` | No | `17373` | Daemon listen port |
| `HARMON_BIND_ADDRESS` | No | `127.0.0.1` | Bind address |
| `HARMON_DB_PATH` | No | `.harmon.db` | SQLite database path |
| `HARMON_CORS_ORIGINS` | Production | `*` | Comma-separated allowed origins |
| `HARMON_ENDPOINT` | No | `http://127.0.0.1:17373` | CLI/client daemon URL override |
| `HARMON_PACK_STATE_DIR` | No | `~/.chitragupta/harmon/provider-packs/` | Provider-pack auth state root |
| `LOG_LEVEL` | No | `info` | `trace\|debug\|info\|warn\|error\|fatal\|silent` |
| `NODE_ENV` | No | — | `production` enforces security checks |

### Spotify

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SPOTIFY_CLIENT_ID` | For OAuth | — | Spotify app client ID |
| `SPOTIFY_CLIENT_SECRET` | No | — | Spotify app secret (server-side refresh) |
| `SPOTIFY_REDIRECT_URI` | For OAuth | — | Must match Spotify dashboard |

### Apple Music

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `APPLE_MUSIC_DEVELOPER_TOKEN` | For Apple | — | JWT developer token |
| `APPLE_MUSIC_USER_TOKEN` | For library | — | User token (MusicKit JS) |
| `APPLE_MUSIC_STOREFRONT` | No | `us` | Storefront country code |
| `APPLE_MUSIC_REMOTE_TOKEN` | No | — | iOS companion playback token |
| `APPLE_MUSIC_TEAM_ID` | For auto-JWT | — | Apple Developer team ID |
| `APPLE_MUSIC_KEY_ID` | For auto-JWT | — | MusicKit key ID |
| `APPLE_MUSIC_PRIVATE_KEY` | For auto-JWT | — | MusicKit private key (PEM) |

### YouTube Music

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `YOUTUBE_MUSIC_API_KEY` | For search | — | YouTube Data API key |
| `YOUTUBE_MUSIC_ACCESS_TOKEN` | For library | — | OAuth access token |
| `YOUTUBE_MUSIC_CLIENT_ID` | For OAuth | — | OAuth client ID |
| `YOUTUBE_MUSIC_REDIRECT_URI` | For OAuth | — | OAuth redirect URI |

### Song Recognition

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AUDD_API_TOKEN` | For AudD | — | AudD API token |
| `ACOUSTID_API_KEY` | No | — | AcoustID key (higher rate limits) |

### MCP Server

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `HARMON_MCP_BEARER_TOKEN` | No | — | Protect the remote MCP server |
| `HARMON_MCP_HOST` | No | `127.0.0.1` | MCP server bind address |
| `HARMON_MCP_PORT` | No | `17400` | MCP server port |
| `HARMON_MCP_PATH` | No | `/mcp` | MCP server path |
| `HARMON_MCP_PUBLIC_URL` | For OAuth | — | Public MCP URL for metadata |

## CLI Quick Reference

```bash
harmon status                              # Daemon + provider status
harmon play <uri-or-url>                   # Play a track/album/playlist
harmon --provider apple play <url>         # Play on a specific provider
harmon smart-play "song name"              # Cross-provider smart play
harmon smart-search "query"                # Cross-provider search
harmon search track "query"                # Search on default provider
harmon session start --mode focus          # Start a session
harmon session nudge calmer                # Adjust live session
harmon session stop                        # Stop session
harmon listen                              # Recognize ambient song
harmon listen --play                       # Recognize and play
harmon auth status                         # Auth status
harmon auth import --browser chrome        # Import Spotify cookies
harmon auth youtube login                  # YouTube OAuth
harmon library tracks                      # Browse saved tracks
harmon playlist list                       # Browse playlists
harmon queue add <uri>                     # Add to queue
harmon device list                         # List playback devices
harmon --json status                       # JSON output (for scripts)
```

## Root pnpm Scripts

```bash
pnpm start:daemon       # Start harmond
pnpm start:web          # Start the web app
pnpm start:mcp          # Start local stdio MCP server
pnpm start:mcp:http     # Start remote HTTP MCP server
pnpm auth:spotify       # Bootstrap Spotify auth
pnpm auth:apple         # Bootstrap Apple Music auth
pnpm auth:youtube       # Bootstrap YouTube Music auth
pnpm build              # Build all packages
pnpm dev                # Dev mode (watch)
pnpm test               # Run tests
pnpm lint               # Type check
pnpm format             # Format code
```

## Next Steps

- Read the full [API reference](../README.md#api-reference) in the root README
- Set up the [MCP server](../README.md#mcp-server) for AI assistant integration
- Explore per-provider docs: [Spotify](spotify.md), [Apple Music](apple-music.md)
