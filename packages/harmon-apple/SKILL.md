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
version: 0.1.0
---

# Harmon Apple

## What this does
harmon-apple provides a typed client for the Apple Music API, covering both the public catalog (search, get song/album/artist/playlist) and the authenticated user library. It maps Apple Music song data to the provider-agnostic TrackInfo format and implements the MusicProvider interface so harmon-core can treat Apple Music as a first-class track source alongside Spotify and YouTube Music.

## When to use
- Searching the Apple Music catalog or reading a user's Apple Music library
- Adding Apple Music as a track source in a harmon session
- Converting Apple Music song metadata to the shared TrackInfo format

## Key exports
- `createAppleMusicClient` — factory that returns an AppleMusicClient for catalog and library calls
- `AppleMusicProvider` — MusicProvider adapter for harmon-core

## Example
```typescript
import { createAppleMusicClient, AppleMusicProvider } from '@athena/harmon-apple';

const client = createAppleMusicClient({ developerToken, userToken });
const results = await client.search('Nils Frahm', ['songs'], { limit: 10 });
const provider = new AppleMusicProvider(client);
const tracks = await provider.search('Nils Frahm', 10);
```
