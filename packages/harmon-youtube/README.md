# @athena/harmon-youtube

![logo](./logo.svg)

> YouTube Music integration for the currently implemented Data API v3 surface.

## Install

```bash
pnpm add @athena/harmon-youtube
```

## Pack Auth

```bash
npm run auth
npm run auth:status
npm run auth:refresh
```

I keep Google OAuth state in `.chitragupta-ecosystem/auth/youtube-oauth.json`, and I ship `.chitragupta-ecosystem/.profile.json` so Chitragupta-style loaders can find the auth entrypoints, README, skill, and logo.

I support two runtime shapes:

- OAuth bootstrap with `YOUTUBE_MUSIC_CLIENT_ID` for liked tracks, owned playlists, and playlist-derived session seeds
- API-key mode with `YOUTUBE_MUSIC_API_KEY` for catalog-only search when user surfaces are not needed

## Quick Start

```typescript
import { createYouTubeMusicClient } from '@athena/harmon-youtube';

const client = createYouTubeMusicClient({ apiKey: process.env.YOUTUBE_MUSIC_API_KEY });
const results = await client.search('synthwave focus');
console.log(results.songs[0].name);
```

## API

| Export | Description |
|---|---|
| `createYouTubeMusicClient(config)` | Create a client for catalog search, liked-library access, playlist browsing, and related-track recommendations |
| `YouTubeMusicClient` | Interface: `search()`, `getSong()`, `getLibrarySongs()`, `getPlaylists()`, `getPlaylistTracks()`, and recommendation helpers |
| `mapSongToTrackInfo(song)` | Convert to provider-agnostic `TrackInfo` |
| `YouTubeMusicConfig` | `{ accessToken?, apiKey?, cookies? }` with `cookies` reserved for future internal-API coverage |
| `YouTubeMusicSong` | Song with id, name, artistName, durationMs, thumbnailUrl |
| `YouTubeMusicSearchResult` | Grouped results for songs, album-like playlist results, artists, and playlists |

## Architecture

harmon-youtube bridges YouTube Music into the harmon ecosystem through the official YouTube Data API v3. It supports song, playlist, and artist discovery; liked-library tracks and owned playlists when an OAuth access token is configured; playlist-track retrieval; and related-track recommendations via `relatedToVideoId`. The daemon pairs this package with a browser-handoff playback controller for provider-aware sessions. Pause remains intentionally unsupported in browser-handoff mode. The `mapSongToTrackInfo` utility converts results into the protocol's `TrackInfo` format for engine consumption.

## License

GNU Affero General Public License v3.0 only. See [LICENSE](../../LICENSE).
