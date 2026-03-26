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
harmon-youtube integrates YouTube Music into the harmon ecosystem. It currently uses the YouTube Data API v3 for song search and single-song lookup. Library access, recommendations, and watch playlists remain intentionally disabled until their reverse-engineered YTM response parsers are reliable enough to ship. Songs are mapped to the shared TrackInfo format, and the YouTubeMusicProvider adapter lets harmon-core treat YouTube Music as a standard track source.

## When to use
- Searching YouTube Music songs through the Data API
- Looking up an individual song/video by id
- Adding YouTube Music as a candidate source in a harmon session when song search is sufficient

## Key exports
- `createYouTubeMusicClient` — factory that returns a YouTubeMusicClient (needs an accessToken or apiKey)
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
