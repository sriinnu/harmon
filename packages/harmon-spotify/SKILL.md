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

## When to use
- Connecting a user's Spotify account to harmon via OAuth
- Searching the Spotify catalog or reading a user's library/playlists
- Controlling playback (play, pause, skip, seek, volume, shuffle, repeat) on Spotify devices

## Key exports
- `createSpotifyAuth` — factory for the OAuth flow (auth URL, exchange, refresh, cookie import)
- `createSpotifyClient` — factory for the API client (search, library, features, devices)
- `SpotifyMusicProvider` — MusicProvider adapter for harmon-core
- `SpotifyPlaybackController` — PlaybackController adapter for harmon-core

## Example
```typescript
import { createSpotifyAuth, createSpotifyClient } from '@athena/harmon-spotify';

const auth = createSpotifyAuth({ clientId, redirectUri, tokenStore });
const url = await auth.getAuthorizationUrl();
// after callback...
const client = createSpotifyClient({ tokenStore });
const results = await client.search('Tycho', 'track', { limit: 5 });
```
