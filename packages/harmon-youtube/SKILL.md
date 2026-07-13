---
name: harmon-youtube
description: YouTube Music client for the currently implemented Data API v3 surface with MusicProvider adapter
capabilities:
  - Search YouTube Music for songs and look up songs/playlists by id
  - Read liked-library tracks and owned playlists with Google OAuth
  - Adapt YouTube Music to the harmon-core MusicProvider interface
tags:
  - youtube-music
  - music
  - api
  - streaming
provider: harmon
version: 0.2.0
---

# Harmon YouTube

## What this does
harmon-youtube integrates YouTube Music through the official YouTube Data API v3: song search, single-song lookup, owned-playlist reads, liked-library tracks, and playlist-track retrieval when OAuth is configured, plus catalog-only search with just an API key. Songs map to the shared TrackInfo format so harmon-core can treat YouTube Music as a standard source without private YTM endpoints.

## Behavior notes (verify before relying)
- **Recommendations are a search-based heuristic**, NOT YouTube related-videos: the Data API removed `relatedToVideoId`, so `getRecommendations` searches seeded from the seed video's title/artist (or the user's liked tracks). Treat results as approximate.
- **Recently played is unsupported**: `getRecentlyPlayed` throws ("not supported by the YouTube Data API. Use library tracks instead."), as does `getTopTracks`. The daemon layers Harmon-local history on top for those signals.
- **Auto-refreshing auth**: `createYouTubeMusicClient` accepts a `getAccessToken: () => Promise<string | null>` callback in addition to a static `accessToken` — the client caches the callback's token and re-fetches on a 401, so long-lived daemons keep working across token expiry.
- 429 responses surface as "rate limited; retry after Ns"; quota exhaustion as "daily quota exceeded".

## Pack auth (build first: `pnpm build` — scripts run `./dist/auth-cli.js`)
- `npm run auth` — bootstrap Google OAuth for playlist/liked-track/library access
- `npm run auth:refresh` — refresh the stored Google token
- `npm run auth:status` — print OAuth / API-key / disconnected mode
- Token files live under `~/.chitragupta/harmon/provider-packs/` and are **encrypted at rest when `HARMON_ENCRYPTION_SECRET` is set** (legacy plaintext files still load and are re-encrypted on next write)

## Key exports
- `createYouTubeMusicClient` — needs `accessToken`, `getAccessToken` callback, or `apiKey`
- `createYouTubeMusicProvider` — MusicProvider adapter for harmon-core
- `mapSongToTrackInfo` — converts a YouTubeMusicSong to TrackInfo

## Example
```typescript
import { createYouTubeMusicClient, createYouTubeMusicProvider } from '@sriinnu/harmon-youtube';

const client = createYouTubeMusicClient({
  apiKey: 'AIza...',
  getAccessToken: async () => refreshGoogleToken(),  // optional auto-refresh
});
const results = await client.search('Bonobo', ['songs'], { limit: 10 });
const provider = createYouTubeMusicProvider(client);
const recs = await provider.getRecommendations({ seedTrackIds: ['dQw4w9WgXcQ'] }); // heuristic
```
