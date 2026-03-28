---
name: harmon-spotify
description: Spotify Web API client with PKCE OAuth, playback control, and MusicProvider adapter
capabilities:
  - Authenticate via Spotify OAuth with PKCE and cookie-based flows
  - Search, browse library, fetch audio features, and control playback devices
  - Adapt Spotify API to the harmon-core MusicProvider and PlaybackController interfaces
tags:
  - spotify
  - music
  - oauth
  - streaming
provider: harmon
version: 0.1.0
---

# Harmon Spotify

## What this does
harmon-spotify wraps the Spotify Web API behind typed clients for authentication, catalog access, and playback control. It handles the full OAuth PKCE flow (authorization URL, token exchange, refresh), provides a SpotifyClient for search/library/features/devices, and exposes MusicProvider and PlaybackController adapters so that harmon-core can source and play tracks without knowing Spotify-specific details.

## Pack auth
- `npm run auth` bootstraps Spotify PKCE login or imports cookies from `SPOTIFY_COOKIES_PATH` / `SPOTIFY_COOKIE_JSON`
- `npm run auth:refresh` refreshes the local token or cookie-backed access state
- `npm run auth:status` prints the current auth mode and local auth file paths
- `.chitragupta-ecosystem/.profile.json` is the loader-facing metadata contract for this pack

## When to use
- Connecting a user's Spotify account to harmon via OAuth
- Searching the Spotify catalog or reading a user's library/playlists
- Controlling playback (play, pause, skip, seek, volume, shuffle, repeat) on Spotify devices

## Key exports
- `createSpotifyAuth` — factory for the OAuth flow (auth URL, exchange, refresh, cookie import)
- `createSpotifyClient` — factory for the API client (search, library, features, devices)
- `createSpotifyProvider` — MusicProvider adapter for harmon-core
- `createSpotifyPlayback` — PlaybackController adapter for harmon-core

## Example
```typescript
import { createSpotifyAuth, createSpotifyClient } from '@sriinnu/harmon-spotify';

const auth = createSpotifyAuth({ clientId, redirectUri, tokenStore });
const url = auth.getLoginUrl();
// after callback...
const client = createSpotifyClient({ auth });
const results = await client.search('Tycho', ['track'], { limit: 5 });
```
