# @sriinnu/harmon-core

![logo](./logo.svg)

> Mood-aware session engine with track ranking, energy arc modulation, and adaptive playback.

## Install

```bash
pnpm add @sriinnu/harmon-core
```

## Quick Start

```typescript
import { createEngine } from '@sriinnu/harmon-core';

const engine = createEngine({ provider, playback, store });
await engine.start({ version: 1, mode: 'focus' });
engine.on('track.started', (track) => console.log(track.name));
await engine.stop();
```

## API

| Export | Description |
|---|---|
| `createEngine(config)` | Create a session engine instance |
| `rankTracks(tracks, policy)` | Score and sort tracks against a session policy |
| `fetchCandidates(sources)` | Gather candidate tracks from configured providers |
| `calculateArcModulation(elapsed, arc)` | Compute energy multiplier for current position in arc |
| `checkRecencyPenalty(track, history)` | Penalize recently played tracks/artists |
| `SessionEngine` | Engine instance type |
| `EngineConfig` | Configuration type |
| `AudioFeatures` | Spotify-style audio feature vector |
| `SessionState` | Current engine state |
| `RankedTrack` | Track with computed score |

## Architecture

harmon-core is the central orchestrator. It consumes a `SessionPolicy` from harmon-protocol, pulls candidates from provider packages (harmon-spotify, harmon-apple, harmon-youtube), ranks them against soft/hard constraints, and drives playback through the active provider's controller.

## License

GNU Affero General Public License v3.0 only. See [LICENSE](../../LICENSE).
