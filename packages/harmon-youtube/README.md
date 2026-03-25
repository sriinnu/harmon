# @athena/harmon-youtube

![logo](./logo.svg)

> YouTube Music integration via Data API v3 and internal YTM endpoints.

## Install

```bash
pnpm add @athena/harmon-youtube
```

## Quick Start

```typescript
import { createYouTubeMusicClient } from '@athena/harmon-youtube';

const client = createYouTubeMusicClient({ apiKey: process.env.YT_API_KEY });
const results = await client.search('synthwave focus');
console.log(results.songs[0].name);
```

## API

| Export | Description |
|---|---|
| `createYouTubeMusicClient(config)` | Create a YouTube Music client |
| `YouTubeMusicClient` | Interface: search, getSong, getLibrarySongs, getPlaylists, getRecommendations |
| `client.getWatchPlaylist(videoId)` | Get auto-generated radio queue for a video |
| `client.getPlaylistTracks(playlistId)` | Fetch tracks from a playlist |
| `mapSongToTrackInfo(song)` | Convert to provider-agnostic `TrackInfo` |
| `YouTubeMusicConfig` | `{ accessToken?, apiKey?, cookies? }` |
| `YouTubeMusicSong` | Song with id, name, artistName, durationMs, thumbnailUrl |
| `YouTubeMusicSearchResult` | Grouped results: songs, albums, artists, playlists |

## Architecture

harmon-youtube bridges YouTube Music into the harmon ecosystem. Public search uses the YouTube Data API v3; authenticated features (library, recommendations) use reverse-engineered YTM internal endpoints. The `mapSongToTrackInfo` utility converts results into the protocol's `TrackInfo` format for engine consumption.

## License

MIT
