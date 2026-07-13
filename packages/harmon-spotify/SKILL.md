---
name: harmon-spotify
description: Spotify Web API client with PKCE OAuth, playback control, and MusicProvider adapter
capabilities:
  - Authenticate via Spotify OAuth (PKCE) with encrypted-at-rest token storage
  - Search, browse library, control playback devices, and read playback state
  - Adapt Spotify API to the harmon-core MusicProvider and PlaybackController interfaces
tags:
  - spotify
  - music
  - oauth
  - streaming
provider: harmon
version: 0.2.0
---

# Harmon Spotify

## What this does
harmon-spotify wraps the Spotify Web API behind typed clients for authentication, catalog access, and playback control. It handles the full OAuth PKCE flow (authorization URL, token exchange, refresh) and exposes MusicProvider and PlaybackController adapters so harmon-core can source and play tracks without Spotify-specific details.

## Behavior notes (verify before relying)
- **Cookie auth (sp_dc/sp_key) is deprecated and non-functional**: Spotify's `get_access_token` endpoint now requires a TOTP handshake this client deliberately does not implement. `setCookies` is `@deprecated` and cookie-based token minting throws "Spotify cookie-based auth is no longer supported by Spotify ... Use OAuth (PKCE) login instead."
- **Recommendations / audio features degrade gracefully**: Spotify returns 403/404 for `/recommendations` and `/audio-features` on apps created after November 2024. `getRecommendations` returns `[]` and `getAudioFeatures` returns per-track `null`s (index-preserving) instead of throwing; a one-time console warning names the deprecated endpoint.

## Pack auth (build first: `pnpm build` — scripts run `./dist/auth-cli.js`)
- `npm run auth` — bootstrap Spotify PKCE login
- `npm run auth:refresh` — refresh the stored token
- `npm run auth:status` — print auth mode and local auth file paths
- Token files live under `~/.chitragupta/harmon/provider-packs/` and are **encrypted at rest when `HARMON_ENCRYPTION_SECRET` is set** (legacy plaintext files still load and are re-encrypted on next write)

## Key exports
- `createSpotifyAuth` — OAuth flow factory (auth URL, exchange, refresh, logout, token store)
- `createSpotifyClient` — API client (search, library, playback state, devices)
- `createSpotifyProvider` — MusicProvider adapter for harmon-core
- `createSpotifyPlayback` — PlaybackController adapter for harmon-core

## Example
```typescript
import { createSpotifyAuth, createSpotifyClient } from '@sriinnu/harmon-spotify';

const auth = createSpotifyAuth({ clientId, redirectUri, tokenStore });
const url = auth.getLoginUrl();     // user opens this
// after callback...
const client = createSpotifyClient({ auth });
const results = await client.search('Tycho', ['track'], { limit: 5 });
const recs = await client.getRecommendations({ seedTrackIds: ['...'] }); // [] on post-Nov-2024 apps
```
