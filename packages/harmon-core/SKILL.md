---
name: harmon-core
description: Session engine with track ranking, candidate sourcing, and energy arc modulation
capabilities:
  - Create and manage music listening sessions with policy-driven behavior
  - Rank candidate tracks using soft weights, hard constraints, and recency penalties
  - Fetch candidates from one provider across multiple sources (liked, top, recent, search, playlists) with discovery blending
tags:
  - engine
  - ranking
  - session
  - music
provider: harmon
version: 0.2.0
---

# Harmon Core

## What this does
harmon-core is the decision-making engine at the heart of harmon. Each engine instance binds ONE MusicProvider plus a PlaybackController and a store; it sources candidate tracks from the policy's configured sources (likedTracks, topTracks, recentPlays, searchQueries, seedPlaylists, seedArtists, discovery), ranks them by soft weights, energy target, arcs, and hard constraints, and feeds the playback queue. Play history applies recency penalties to prevent repetition.

`soft.targetEnergy` (0-1, default 0.5) is the energy level ranking aims tracks toward; `nudge('calmer'|'sharper', amount)` shifts this target (and softly adjusts valence) rather than flipping weight signs.

## When to use
- Building a session orchestrator or daemon that needs track selection logic
- Integrating a new music provider that must participate in ranking and queue filling
- Customizing how tracks are scored, filtered, or ordered during a session

## Key exports
- `createEngine(config)` — wires provider, playback, store, and event callback into a SessionEngine
- `SessionEngine` — `start(policy)`, `stop()`, `pause()`, `resume()`, `nudge(direction, amount?)`, `getQueue()`, `getState()`, `refillQueue()`, `recordPlay(track)`
- `MusicProvider` — interface for any streaming backend (Spotify, Apple, YouTube)
- `PlaybackController` — interface for play/pause/skip/queue on a device
- `rankTracks` — pure function that scores and sorts candidates
- `fetchCandidates(provider, sources, limit, logger)` — pulls tracks from one provider's configured sources and deduplicates

## Example
```typescript
import { createEngine } from '@sriinnu/harmon-core';

const engine = createEngine({
  provider: spotifyProvider,      // one MusicProvider per engine
  playback: spotifyPlayback,
  store,
  onEvent: (e) => console.log(e.type, e.payload),  // events via config callback (no .on())
});

await engine.start({
  version: 1,
  mode: 'focus',
  soft: { targetEnergy: 0.4, weights: { energy: 0.7, instrumentalness: 0.8 } },
  sources: { likedTracks: true },
});
await engine.nudge('calmer', 0.1);  // shifts targetEnergy down 0.1
```
