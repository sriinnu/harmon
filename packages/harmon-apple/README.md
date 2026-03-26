# @athena/harmon-apple

![logo](./logo.svg)

> Apple Music API client for catalog search, library access, and playback via AppleScript.

## Install

```bash
pnpm add @athena/harmon-apple
```

## Quick Start

```typescript
import { createAppleMusicClient } from '@athena/harmon-apple';

const client = createAppleMusicClient({
  developerToken: process.env.APPLE_DEVELOPER_TOKEN!,
  userToken: process.env.APPLE_USER_TOKEN,
});
const results = await client.search('ambient study', ['songs']);
console.log(results.songs[0].name);
```

## API

| Export | Description |
|---|---|
| `createAppleMusicClient(config)` | Create authenticated API client |
| `AppleMusicClient` | Interface: search, getSong, getAlbum, getArtist, getPlaylist |
| `client.getLibrarySongs()` | Fetch user's library songs (requires user token) |
| `client.getLibraryAlbums()` | Fetch user's library albums |
| `client.getLibraryPlaylists()` | Fetch user's library playlists |
| `AppleMusicConfig` | `{ developerToken, userToken?, storefront? }` |
| `AppleMusicSong` | Song type with id, name, artistName, durationMs |
| `AppleMusicSearchResult` | Grouped results: songs, albums, artists, playlists |

## Architecture

harmon-apple wraps the Apple Music REST API (`api.music.apple.com/v1`). The daemon pairs it with macOS AppleScript for local playback control. Catalog endpoints use the developer token; library endpoints additionally require a user Music-User-Token.

## License

GNU Affero General Public License v3.0 only. See [LICENSE](../../LICENSE).
