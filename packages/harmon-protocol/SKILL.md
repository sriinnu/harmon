---
name: harmon-protocol
description: Zod schemas for commands, events, policies, and track info
capabilities:
  - Validate command envelopes (session.start, session.stop, session.nudge, skip)
  - Validate event envelopes (track.started, session.stopped, heartbeat, etc.)
  - Parse and enforce SessionPolicy constraints at runtime
tags:
  - protocol
  - schema
  - validation
  - zod
provider: harmon
version: 0.2.0
---

# Harmon Protocol

## What this does
harmon-protocol defines the shared type contract between the daemon, CLI, and engine. Every Command sent by a client and every Event emitted by the daemon is validated against Zod schemas defined here. SessionPolicy, TrackInfo, DeviceInfo, and DaemonStatus are all canonical types that flow through the entire system.

Notable policy fields: `soft.targetEnergy` (0-1, optional) is the energy level ranking aims tracks toward — session nudges shift it. `hard.tempo.min/max` are bounded 0-400 BPM with `min <= max` enforced; `hard.energy` is bounded 0-1.

## When to use
- Validating user input before dispatching a command to the daemon
- Type-checking event payloads received over SSE or WebSocket
- Importing canonical types (TrackInfo, SessionPolicy) into a new package or adapter

## Key exports
- `validateCommand` — parse and validate an unknown value as a Command
- `validateEvent` — parse and validate an unknown value as an Event
- `SessionPolicy` — Zod schema and inferred type for session configuration
- `TrackInfo` — provider-agnostic track metadata (id, name, artist, album, duration)
- `Command` — envelope schema with id, timestamp, source, type, and payload
- `Event` — envelope schema for daemon-emitted events

## Example
```typescript
import { validateCommand, SessionPolicy } from '@sriinnu/harmon-protocol';

const cmd = validateCommand({
  id: 'c_1', ts: Date.now(),
  source: { kind: 'cli', device: 'macos' },
  type: 'session.start',
  payload: { policy: { version: 1, mode: 'focus' } },
});
```
