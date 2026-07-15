# Getting Started with Harmon

Zero to playing music, then a verification pass over every surface: daemon, CLI, web player, and the MCP server for AI assistants.

## Prerequisites

- **Node.js 22+**, **pnpm 10+**
- **sox** for `harmon listen` song recognition (`brew install sox` / `sudo apt install sox`)
- A **Spotify developer app** (free) for the most capable provider path: create one at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) with redirect URI `http://127.0.0.1:17373/v1/auth/spotify/callback`

## 1. Install

**From npm** (CLI + daemon in one package):

```bash
npm install -g @sriinnu/harmon
harmon init          # interactive setup wizard
```

**From source:**

```bash
git clone https://github.com/sriinnu/harmon.git
cd harmon
pnpm install && pnpm build
alias harmon="node apps/harmon-cli/bin/harmon.js"
```

## 2. Configure — secure by default

Do this before first start. Both values are enforced in production and warned about loudly everywhere else:

```bash
echo "HARMON_API_TOKEN=$(openssl rand -base64 32)" >> .env
echo "HARMON_ENCRYPTION_SECRET=$(openssl rand -base64 32)" >> .env
echo "SPOTIFY_CLIENT_ID=your_client_id" >> .env
echo "SPOTIFY_REDIRECT_URI=http://127.0.0.1:17373/v1/auth/spotify/callback" >> .env

# For the curl examples below (harmon/harmond read .env themselves):
export HARMON_API_TOKEN=$(grep '^HARMON_API_TOKEN' .env | cut -d= -f2-)
```

The daemon, CLI, and MCP server all load `./.env` from the directory they start in; variables already exported in your shell take precedence. On macOS, secrets can live in the **Keychain** instead of `.env` — see [secrets.md](secrets.md).

- `HARMON_API_TOKEN` — Bearer auth for every `/v1` endpoint. Without it, any local process can control the daemon.
- `HARMON_ENCRYPTION_SECRET` — AES-256-GCM key; without it, OAuth tokens are stored unencrypted.

The CLI and MCP clients pick the token up from the `HARMON_API_TOKEN` env var automatically.

## 3. Start and verify the daemon

```bash
pnpm start:daemon        # or just `harmond` if npm-installed
```

Startup log should say `Credential encryption enabled` and show **no** missing-token warning. Then:

```bash
curl -s http://127.0.0.1:17373/health          # → {"status":"ok",...}   (no auth needed)
curl -s http://127.0.0.1:17373/v1/status       # → 401                   (auth is working)
curl -s -H "Authorization: Bearer $HARMON_API_TOKEN" http://127.0.0.1:17373/v1/status
```

## 4. Connect providers

### Spotify (OAuth PKCE)

```bash
curl -s -X POST -H "Authorization: Bearer $HARMON_API_TOKEN" \
  http://127.0.0.1:17373/v1/auth/spotify/login
# → open the returned URL in a browser, approve, then:
harmon auth status
```

> Cookie-based Spotify auth (`sp_dc` import) is no longer supported — Spotify retired the underlying endpoint. Use OAuth.

### YouTube Music

Needs a one-time Google Cloud OAuth client — **follow [youtube-music.md](youtube-music.md)**, it encodes every gotcha (Web application type, exact redirect URI, the Test-users requirement, the show-once client secret). Then:

```bash
harmon auth youtube login        # opens Google consent
```

### Apple Music

Requires an Apple Developer Program membership ($99/yr) + Apple Music subscription — **follow [apple-music.md](apple-music.md)** (Media ID with the `media.` prefix, MusicKit key, Keychain storage for the `.p8`). The daemon auto-mints and auto-refreshes the developer JWT from key material; library access additionally needs the MusicKit user token via `pnpm auth:apple`.

Per-provider deep dives: [spotify.md](spotify.md), [apple-music.md](apple-music.md), [youtube-music.md](youtube-music.md).

## 5. Test the CLI

Have a Spotify app open somewhere (any device), then:

```bash
harmon status
harmon search track "daft punk"
harmon smart-play "Vienna Billy Joel"     # cross-provider search → plays best match
harmon pause && harmon play && harmon next
harmon library tracks
harmon queue add spotify:track:4uLU6hMCjMI75M1A2tKUQC
```

If play fails with "no active device": `harmon device list` then `harmon device use <id>` (or just open Spotify anywhere).

**Sessions** (policy-driven curation):

```bash
harmon session start --mode focus         # modes: focus|relax|energize|meditate|workout
harmon session nudge calmer               # shifts the energy target down
harmon session stop
```

**Song recognition:**

```bash
export AUDD_API_TOKEN=...                 # free at https://audd.io/
harmon listen --play                      # hear it, identify it, play it
```

## 6. Test the web player

The daemon serves the web player itself — no separate server:

```
http://127.0.0.1:17373/app
```

(For web development with hot reload, `pnpm start:web` still serves a
standalone copy at http://127.0.0.1:4173.)

Walk the onboarding wizard: daemon URL + API token → connection should go live **without a page reload**. To paste the token quickly: `grep '^HARMON_API_TOKEN' .env | cut -d= -f2- | pbcopy`. Once a working connection exists, the app treats the daemon as the source of truth — already-connected providers show "Connected ✓" and the wizard never re-asks. Then try search on each provider tab and a smart-play (with the Auto/provider selector). When connected, the connection/token panels collapse into a "● Connected" bar — expand them via **Settings** (per-provider Disconnect, plus "Reset web app" which clears only this browser).

### Browser player — no Spotify app needed (Premium)

The **"Browser player"** card (below Now Playing, shown when Spotify is connected) turns the tab into a real Spotify Connect device via the Web Playback SDK:

1. Click **Enable** → wait for **"● ready as \"Harmon Player\""** — the tab is now registered as a device.
2. Click **Play here** once to make it active.
3. Quit the Spotify app everywhere — playback now streams **from the browser tab**, and the daemon prefers "Harmon Player" automatically when picking devices.

Notes: requires Spotify **Premium**; accounts authorized before the `streaming` scope existed must reconnect once (`harmon auth spotify logout && harmon auth spotify login`); the device exists only while the tab is open — pin it.

### Spotify device model (why "no active device" happens)

Spotify's API is a remote control: something must *be* a player — the desktop app, your phone, or the Browser player above. If nothing is open, harmon now activates any available device automatically and, failing that, returns a clear "open Spotify on any device" error. Target a specific device with `harmon device list` / `harmon device use <id>` (MCP: `list_devices` / `use_device`).

## 6b. The macOS menubar app

```bash
pnpm menubar          # run from the repo; or install it properly:
pnpm menubar:install  # → /Applications/Harmon.app (icon, signed, add to Login Items)
```

A note icon appears in the menu bar (green while a track plays, house icon when the daemon is down). The panel gives you: live now-playing with album art, transport + Spotify volume, a "Play anything…" box with an **Auto/Spotify/Apple/YouTube target picker**, session start/nudge/stop, per-provider **Connect** buttons (opens the OAuth browser flow and flips green on approval), and daemon **start/stop**. It adopts `HARMON_API_TOKEN` from the repo's `.env` automatically; endpoint/token/repo-path are editable under ⚙️.

## 7. Wire up an AI assistant (MCP)

The MCP server (`harmon-mcp`) maps tools like `smart_play`, `get_now_playing`, `search_music`, `set_volume`, and `start_session` onto the daemon.

**Claude Code / Claude Desktop (stdio — full tool surface):**

```bash
claude mcp add harmon --env HARMON_API_TOKEN=<your token> \
  -- node <repo>/packages/harmon-flow/dist/mcp/cli.js
```

(This repo's own `.mcp.json` already registers it for sessions inside the checkout.)

**ChatGPT / HTTP transport:**

```bash
pnpm start:mcp:http                       # http://127.0.0.1:17400/mcp
curl -s http://127.0.0.1:17400/healthz
```

Note the startup line about write tools: with no MCP auth configured, playback tools are hidden until you set `HARMON_MCP_ALLOW_UNAUTHENTICATED_WRITES=1` (loopback only) or a `HARMON_MCP_BEARER_TOKEN`. The stdio transport always exposes everything.

**The end-to-end test:** ask your assistant *"what's playing?"* then *"play Vienna by Billy Joel"*. The first exercises the unified `get_now_playing`, the second `smart_play`. Full tool reference: [packages/harmon-flow/SKILL.md](../packages/harmon-flow/SKILL.md).

## 8. YouTube mini player (optional)

Open `http://127.0.0.1:17373/player/youtube`, paste your API token when prompted (it is kept in sessionStorage, never embedded in the page), and it live-syncs with YouTube sessions over SSE.

## Verification checklist

| Check | Expected |
|---|---|
| `curl /health` | `{"status":"ok"}` without auth |
| `curl /v1/status` without token | `401` |
| Daemon startup | `Credential encryption enabled`, no token warning |
| `harmon smart-play "<song>"` | music plays; response names the provider |
| `harmon search track x --limit abc` | clean usage error, not a stack trace |
| Web onboarding | connects without reload; search works on all provider tabs |
| Browser player | Enable → "ready as Harmon Player"; plays with all Spotify apps closed |
| Menubar | icon turns green while playing; Connect buttons complete OAuth |
| MCP `/healthz` | `{"ok":true}`; startup names hidden write tools if unauthenticated |
| Assistant "what's playing?" | answers without being told the provider |

## Environment variable reference

See the [README table](../README.md#environment-variables) for the full list — daemon, providers, recognition, and `HARMON_MCP_*`.

## CLI quick reference

```bash
harmon status / auth status               # health + provider readiness
harmon play <uri-or-url>                  # direct play (spotify:… / URLs)
harmon --provider apple play <url>        # provider-scoped
harmon smart-play "query" | smart-search "query"
harmon search track "query"
harmon session start --mode focus | nudge calmer | stop
harmon listen [--play]
harmon library tracks / playlist list / queue add <uri>
harmon device list / device use <id>
harmon --json <cmd>                       # structured output for scripts
```

## Next steps

- Full HTTP API: [apps/harmond/SKILL.md](../apps/harmond/SKILL.md)
- MCP tool schemas: [packages/harmon-flow/SKILL.md](../packages/harmon-flow/SKILL.md)
- Session policy schema: [packages/harmon-protocol/SKILL.md](../packages/harmon-protocol/SKILL.md)
- Encryption details: [ENCRYPTION_QUICK_START.md](../ENCRYPTION_QUICK_START.md)
