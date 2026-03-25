---
name: harmon-core
description: Session engine with track ranking, candidate sourcing, and energy arc modulation
capabilities:
  - Create and manage music listening sessions with policy-driven behavior
  - Rank candidate tracks using soft weights, hard constraints, and recency penalties
  - Fetch candidates from multiple music providers and blend discovery ratios
tags:
  - engine
  - ranking
  - session
  - music
provider: harmon
version: 0.1.0
---

# Harmon Core

## What this does
harmon-core is the decision-making engine at the heart of harmon. It accepts a SessionPolicy, sources candidate tracks from one or more MusicProvider adapters, ranks them according to soft weights, energy arcs, and hard constraints, and drives playback through a PlaybackController. It also tracks play history to apply recency penalties and prevent repetition.

## When to use
- Building a new session orchestrator or daemon that needs track selection logic
- Integrating a new music provider that must participate in ranking and queue filling
- Customizing how tracks are scored, filtered, or ordered during a session

## Key exports
- `createEngine` — factory that wires providers, store, and policy into a running SessionEngine
- `MusicProvider` — interface for any streaming backend (Spotify, Apple, YouTube, etc.)
- `PlaybackController` — interface for play/pause/skip/seek on a device
- `AudioFeatures` — normalized audio feature vector (energy, tempo, valence, etc.)
- `rankTracks` — pure function that scores and sorts a list of TrackWithFeatures
- `fetchCandidates` — pulls tracks from configured sources and deduplicates them

## Example
```typescript
import { createEngine } from '@athena/harmon-core';

const engine = createEngine({
  providers: [spotifyProvider],
  playback: spotifyPlayback,
  store,
  policy: { version: 1, mode: 'focus' },
});
engine.on('track.started', (e) => console.log(e));
await engine.start();
```
