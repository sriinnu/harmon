---
name: harmon-cli
description: Thin HTTP client for controlling the harmon daemon from the terminal
capabilities:
  - Play, pause, skip, and seek across Spotify, Apple Music, and YouTube Music via daemon endpoints
  - Manage sessions (start, stop, nudge) and discover/switch playback devices
  - Cross-provider smart search / smart play, song recognition, and OAuth login/logout
tags:
  - cli
  - terminal
  - client
provider: harmon
version: 0.3.0
---

# Harmon CLI

## What this does
harmon-cli is a stateless HTTP client library that maps harmond endpoints to typed async methods, plus the `harmon` binary that wraps it with argument parsing. It handles request timeouts (AbortController), Bearer auth headers, and JSON serialization.

## Key exports
- `createCLI({ endpoint, token?, timeoutMs? })` — returns the client
- `getDefaultEndpoint()` — `HARMON_ENDPOINT` or `http://127.0.0.1:17373`

## createCLI methods (grouped)

- **Status / session**: `status()`, `command(cmd)` (session.start / session.stop / session.nudge / skip envelopes), `devices()`, `useDevice(deviceId)`
- **Smart (cross-provider)**: `smartSearch(query, {limit?})`, `smartPlay({query?, uri?, provider?})` — plays best match across providers, returns auth hints when a provider needs login
- **Recognition**: `recognize(audioBase64)` — base64 WAV → song identity via `/v1/recognize`
- **Spotify playback**: `spotifyPlay({uri?, contextUri?})`, `spotifyPause()`, `spotifyNext()`, `spotifyPrev()`, `spotifySeek(positionMs)`, `spotifyVolume(pct)`, `spotifyShuffle(bool)`, `spotifyRepeat('off'|'track'|'context')`, `spotifyQueueAdd(uri)`, `spotifyNowPlaying()`
- **Apple playback**: `applePlay({url?})` (direct URL required for targeted play), `applePause()`, `appleNext()`, `applePrev()`, `appleNowPlaying()`
- **YouTube playback**: `youtubePlay({uri?})` (browser handoff), `youtubeNext()`, `youtubePrev()`, `youtubeQueueAdd(uri)`, `youtubeNowPlaying()` — `youtubePause()` exists but the daemon returns 501 in browser-handoff mode
- **Search / browse**: `spotifySearch`, `appleSearch`, `youtubeSearch` (query, type, {limit}); `spotifyPlaylists`, `applePlaylists`, `youtubePlaylists`; `*PlaylistTracks(playlistId)`; `spotifyLibraryTracks`, `appleLibraryTracks`, `youtubeLibraryTracks`; `spotifyRecommendations`, `appleRecommendations`, `youtubeRecommendations` ({limit?, seed?})
- **Auth**: `authLogin()` / `authLogout()` / `authImportCookies(cookies)` (Spotify; cookie import is deprecated upstream), `youtubeAuthLogin()` / `youtubeAuthRefresh()` / `youtubeAuthLogout()`, `appleAuthSetUserToken(token)` / `appleAuthRefresh()` / `appleAuthLogout()`

## uri vs contextUri (Spotify)
`spotifyPlay({uri})` plays a single track (`spotify:track:...`). `spotifyPlay({contextUri})` starts playback of a context — an album, playlist, artist, or show URI (`spotify:album:...`, `spotify:playlist:...`, `spotify:artist:...`) — letting Spotify sequence the tracks.

## Example
```typescript
import { createCLI, getDefaultEndpoint } from '@sriinnu/harmon';

const cli = createCLI({ endpoint: getDefaultEndpoint(), token: process.env.HARMON_API_TOKEN });
await cli.status();
await cli.smartPlay({ query: 'Weightless Marconi Union' });          // any provider
await cli.spotifyPlay({ contextUri: 'spotify:playlist:37i9dQZF1DX3Ogo9pFvBkY' }); // whole playlist
```
