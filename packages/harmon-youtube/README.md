# @athena/harmon-youtube

![logo](./logo.svg)

> YouTube Music integration for the currently implemented Data API v3 surface.

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
| `createYouTubeMusicClient(config)` | Create a client for song search and song lookup |
| `YouTubeMusicClient` | Interface: `search()` for songs, `getSong()` for a single video |
| `mapSongToTrackInfo(song)` | Convert to provider-agnostic `TrackInfo` |
| `YouTubeMusicConfig` | `{ accessToken?, apiKey?, cookies? }` with `cookies` reserved for future internal-API coverage |
| `YouTubeMusicSong` | Song with id, name, artistName, durationMs, thumbnailUrl |
| `YouTubeMusicSearchResult` | Grouped results; only `songs` is implemented today |

## Architecture

harmon-youtube bridges YouTube Music into the harmon ecosystem. Today it uses the YouTube Data API v3 for song search and single-song lookup. Library, playlist, recommendation, and watch-playlist surfaces intentionally throw explicit `not implemented` errors until the reverse-engineered YTM response parsers are production-ready. The `mapSongToTrackInfo` utility converts results into the protocol's `TrackInfo` format for engine consumption.

## License

GNU Affero General Public License v3.0 only. See [LICENSE](../../LICENSE).
