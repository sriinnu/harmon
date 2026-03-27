# @athena/harmon-spotify

![logo](./logo.svg)

> Spotify Web API client with OAuth PKCE, device control, and MusicProvider adapter.

## Install

```bash
pnpm add @athena/harmon-spotify
```

## Pack Auth

```bash
npm run auth
npm run auth:status
npm run auth:refresh
```

I keep local auth state in `.chitragupta-ecosystem/auth/spotify.tokens.json` and `.chitragupta-ecosystem/auth/spotify.cookies.json`. I also ship `.chitragupta-ecosystem/.profile.json`, so Chitragupta-style loaders can discover the auth entrypoints, logo, README, and env contract without guessing.

I support two bootstrap paths:

- PKCE OAuth with `SPOTIFY_CLIENT_ID` and an optional `SPOTIFY_REDIRECT_URI`
- Cookie import with `SPOTIFY_COOKIES_PATH`, `SPOTIFY_COOKIE_JSON`, or direct `SPOTIFY_SP_DC` / `SPOTIFY_SP_KEY`

## Quick Start

```typescript
import { createSpotifyAuth, createSpotifyClient, createSpotifyProvider } from '@athena/harmon-spotify';

const auth = createSpotifyAuth({
  clientId: '...',
  redirectUri: 'http://localhost:17373/v1/auth/spotify/callback',
});
const url = auth.getLoginUrl(); // redirect user here
const client = createSpotifyClient({ auth });
const tracks = await client.search('lofi chill', ['track']);
```

## API

| Export | Description |
|---|---|
| `createSpotifyAuth(config)` | OAuth manager with PKCE flow |
| `createSpotifyClient({ auth })` | API client: search, library, playlists, audio features |
| `createSpotifyProvider(client)` | Adapter implementing `MusicProvider` interface |
| `createSpotifyPlayback(client)` | Playback controller: play, pause, skip, seek, volume |
| `SpotifyAuth` | Auth lifecycle: login, callback, refresh, logout |
| `SpotifyClient` | Full Spotify Web API surface |
| `SpotifyTokens` | Token storage shape |
| `TokenStore` / `CookieStore` | Persistence interfaces for tokens and cookies |

## Architecture

harmon-spotify is the Spotify integration layer. It wraps the Spotify Web API behind the `MusicProvider` and `PlaybackController` interfaces defined by harmon-core, enabling the engine to fetch candidates and control playback without direct Spotify coupling.

## License

GNU Affero General Public License v3.0 only. See [LICENSE](../../LICENSE).
