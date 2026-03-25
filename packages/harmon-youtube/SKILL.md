---
name: harmon-youtube
description: YouTube Music client using Data API v3 and internal YTM endpoints with MusicProvider adapter
capabilities:
  - Search YouTube Music for songs, albums, artists, and playlists
  - Access user library, playlists, recommendations, and watch playlists
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
harmon-youtube integrates YouTube Music into the harmon ecosystem. It uses the YouTube Data API v3 for public search and reverse-engineered YouTube Music internal endpoints (WEB_REMIX client) for library access, recommendations, and radio-style watch playlists. Songs are mapped to the shared TrackInfo format, and the YouTubeMusicProvider adapter lets harmon-core treat YouTube Music as a standard track source.

## When to use
- Searching YouTube Music or accessing a user's liked videos and playlists
- Generating radio-style queues from a seed track via the watch playlist endpoint
- Adding YouTube Music as a candidate source in a harmon session

## Key exports
- `createYouTubeMusicClient` — factory that returns a YouTubeMusicClient (needs accessToken, apiKey, or cookies)
- `YouTubeMusicProvider` — MusicProvider adapter for harmon-core
- `mapSongToTrackInfo` — converts a YouTubeMusicSong to the provider-agnostic TrackInfo format

## Example
```typescript
import { createYouTubeMusicClient, YouTubeMusicProvider } from '@athena/harmon-youtube';

const client = createYouTubeMusicClient({ apiKey: 'AIza...' });
const results = await client.search('Bonobo', ['songs'], { limit: 10 });
const provider = new YouTubeMusicProvider(client);
const tracks = await provider.search('Bonobo', 10);
```
