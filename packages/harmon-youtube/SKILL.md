---
name: harmon-youtube
description: YouTube Music client for the currently implemented Data API v3 surface with MusicProvider adapter
capabilities:
  - Search YouTube Music for songs
  - Look up a single song/video by id
  - Adapt YouTube Music to the harmon-core MusicProvider interface
tags:
  - youtube-music
  - music
  - api
  - streaming
provider: harmon
version: 0.1.0
---

# Harmon YouTube

## What this does
harmon-youtube integrates YouTube Music into the harmon ecosystem through the official YouTube Data API v3. It supports song search, owned playlist reads, liked-library tracks, playlist-track retrieval, and related-track recommendations when OAuth is configured, plus catalog-only search when an API key is sufficient. Songs are mapped to the shared TrackInfo format, and the provider adapter lets harmon-core treat YouTube Music as a standard track source without depending on private YTM endpoints.

## Pack auth
- `npm run auth` bootstraps Google OAuth for playlist, liked-track, and user-library access
- `npm run auth:refresh` refreshes the stored Google token
- `npm run auth:status` prints whether the pack is in OAuth, API-key, or disconnected mode
- `.chitragupta-ecosystem/.profile.json` is the loader-facing metadata contract for this pack

## When to use
- Searching YouTube Music songs through the Data API
- Reading liked tracks or owned playlists with Google OAuth
- Adding YouTube Music as a candidate source in a harmon session through search, liked, playlist, or related-track seeds

## Key exports
- `createYouTubeMusicClient` — factory that returns a YouTubeMusicClient (needs an accessToken or apiKey)
- `createYouTubeMusicProvider` — MusicProvider adapter for harmon-core
- `mapSongToTrackInfo` — converts a YouTubeMusicSong to the provider-agnostic TrackInfo format

## Example
```typescript
import { createYouTubeMusicClient, createYouTubeMusicProvider } from '@sriinnu/harmon-youtube';

const client = createYouTubeMusicClient({ apiKey: 'AIza...' });
const results = await client.search('Bonobo', ['songs'], { limit: 10 });
const provider = createYouTubeMusicProvider(client);
const tracks = await provider.search('Bonobo', 10);
```
