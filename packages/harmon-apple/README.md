# @sriinnu/harmon-apple

![logo](./logo.svg)

> Apple Music API client and provider adapter for catalog search, playlist tracks, library access, recent-play signals, and Apple-backed session discovery.

## Install

```bash
pnpm add @sriinnu/harmon-apple
```

## Pack Auth

These commands are for the provider pack checkout or a profile-aware loader that executes inside the pack root. They are not exposed as a global installed binary. From a fresh repo checkout, run `pnpm build` once before you use them.

```bash
npm run auth
npm run auth:status
npm run auth:refresh
```

I keep local Apple Music auth state in `~/.chitragupta/harmon/provider-packs/harmon-apple/apple-music.json` by default. Set `HARMON_PACK_STATE_DIR` if you need a different local root. I also ship `.chitragupta-ecosystem/.profile.json` so Chitragupta-style loaders can discover the pack entrypoints and env contract directly.

I keep the auth flow honest:

- `npm run auth` uses `APPLE_MUSIC_DEVELOPER_TOKEN` directly, or generates one from `APPLE_MUSIC_TEAM_ID`, `APPLE_MUSIC_KEY_ID`, and `APPLE_MUSIC_PRIVATE_KEY_PATH`
- I then open a local MusicKit page to mint and save the Apple `Music-User-Token`
- `npm run auth:refresh` refreshes the developer-token side only; if the user token expires, rerun `npm run auth`

## Quick Start

```typescript
import { createAppleMusicClient } from '@sriinnu/harmon-apple';

const client = createAppleMusicClient({
  developerToken: process.env.APPLE_MUSIC_DEVELOPER_TOKEN!,
  userToken: process.env.APPLE_MUSIC_USER_TOKEN,
});
const results = await client.search('ambient study', ['songs']);
console.log(results.songs[0].name);
```

## API

| Export | Description |
|---|---|
| `createAppleMusicClient(config)` | Create authenticated API client |
| `AppleMusicClient` | Interface: search, getSong, getAlbum, getArtist, getPlaylist, getPlaylistTracks |
| `client.getLibrarySongs()` | Fetch user's library songs (requires user token) |
| `client.getLibraryAlbums()` | Fetch user's library albums |
| `client.getLibraryPlaylists()` | Fetch user's library playlists |
| `client.getRecentlyPlayedTracks()` | Fetch the user's recent Apple Music tracks (requires user token) |
| `client.getPlaylistTracks()` | Fetch playlist tracks from catalog playlists, or library playlists when a user token is available |
| `AppleMusicConfig` | `{ developerToken, userToken?, storefront? }` |
| `AppleMusicSong` | Song type with id, name, artistName, durationMs |
| `AppleMusicSearchResult` | Grouped results: songs, albums, artists, playlists |

## Architecture

harmon-apple wraps the Apple Music REST API (`api.music.apple.com/v1`) and exposes a `MusicProvider` adapter for catalog search, library access, playlist browsing, recent-play signals, and recommendation seeding. The daemon pairs this package with either macOS AppleScript local playback or a daemon-side iOS remote companion contract, and it keeps local playback available on macOS even when remote companion auth is configured. Catalog endpoints use the developer token; personal library and recent-play endpoints additionally require a user Music-User-Token. I do not synthesize a separate Apple `topTracks` surface because the provider contract cannot distinguish that honestly from recent plays; harmond layers local playback history on top when that signal is needed for sessions.

## License

GNU Affero General Public License v3.0 only. See [LICENSE](../../LICENSE).
