---
name: harmon-apple
description: Apple Music API client with catalog search, library access, and MusicProvider adapter
capabilities:
  - Search the Apple Music catalog for songs, albums, artists, and playlists
  - Access user library songs, albums, and playlists with Music-User-Token auth
  - Adapt Apple Music API to the harmon-core MusicProvider interface
tags:
  - apple-music
  - music
  - api
  - streaming
provider: harmon
version: 0.2.0
---

# Harmon Apple

## What this does
harmon-apple provides a typed client for the Apple Music API, covering the public catalog (search, get song/album/artist/playlist) and the authenticated user library. It maps Apple song data to the provider-agnostic TrackInfo format and implements MusicProvider so harmon-core can treat Apple Music as a first-class source.

## Behavior notes (verify before relying)
- **Playback needs a direct URL**: Apple has no query-based play path in harmon — search the catalog first, then hand the returned track URL to the playback surface (daemon `POST /v1/apple/play {url}` or MCP `play_music` with `target`).
- **`isConnected()` is credential-derived**: the client reports connected iff a developer token is present (`hasUserToken()` separately reports library access); the provider adapter delegates to it. No network probe.
- **Retry on 429/5xx**: requests retry up to 2 times, honoring `Retry-After` capped at 10s.
- **Playlist routing by ID prefix**: `pl.` = catalog playlist, `p.`/`i.` = library playlist; ambiguous IDs try library first and fall back to catalog on 404.

## Pack auth (build first: `pnpm build` — scripts run `./dist/auth-cli.js`)
- `npm run auth` — resolves a developer token and opens a local MusicKit bootstrap page for the user token
- `npm run auth:refresh` — refreshes the developer token and validates any stored user token
- `npm run auth:status` — prints the current Apple Music auth posture
- Token files live under `~/.chitragupta/harmon/provider-packs/` and are **encrypted at rest when `HARMON_ENCRYPTION_SECRET` is set** (legacy plaintext files still load and are re-encrypted on next write)

## Key exports
- `createAppleMusicClient` — AppleMusicClient for catalog and library calls (`developerToken` required, `userToken` for library)
- `createAppleMusicProvider` — MusicProvider adapter for harmon-core

## Example
```typescript
import { createAppleMusicClient, createAppleMusicProvider } from '@sriinnu/harmon-apple';

const client = createAppleMusicClient({ developerToken, userToken });
client.isConnected();   // true — derived from developerToken presence
const results = await client.search('Nils Frahm', ['songs'], { limit: 10 });
// results[0].url is what playback needs — Apple play requires a direct URL
const provider = createAppleMusicProvider(client);
const tracks = await provider.search('Nils Frahm', 10);
```
