# @sriinnu/harmon-spotify

![logo](./logo.svg)

> Spotify Web API client with OAuth PKCE, device control, and MusicProvider adapter.

## Install

```bash
pnpm add @sriinnu/harmon-spotify
```

## Pack Auth

These commands are for the provider pack checkout or a profile-aware loader that executes inside the pack root. They are not exposed as a global installed binary. From a fresh repo checkout, run `pnpm build` once before you use them.

```bash
npm run auth
npm run auth:status
npm run auth:refresh
```

I keep local auth state in `~/.chitragupta/harmon/provider-packs/harmon-spotify/spotify.tokens.json` and `~/.chitragupta/harmon/provider-packs/harmon-spotify/spotify.cookies.json` by default. Set `HARMON_PACK_STATE_DIR` if you need a different local root. I also ship `.chitragupta-ecosystem/.profile.json`, so Chitragupta-style loaders can discover the auth entrypoints, logo, README, and env contract without guessing.

I support two bootstrap paths:

- PKCE OAuth with `SPOTIFY_CLIENT_ID` and an optional `SPOTIFY_REDIRECT_URI`
- Cookie import with `SPOTIFY_COOKIES_PATH`, `SPOTIFY_COOKIE_JSON`, or direct `SPOTIFY_SP_DC` / `SPOTIFY_SP_KEY`

> **Deprecated:** cookie-based auth no longer works — Spotify's `open.spotify.com/get_access_token` endpoint now requires a TOTP handshake, so cookie token minting fails with 401. Cookie mode remains only as an experimental/unsupported path; use PKCE OAuth login instead.

Set `HARMON_ENCRYPTION_SECRET` (32+ characters) to encrypt the stored token files at rest; without it, tokens are written as plaintext JSON and the auth CLI prints a warning.

## Quick Start

```typescript
import { createSpotifyAuth, createSpotifyClient, createSpotifyProvider } from '@sriinnu/harmon-spotify';

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
