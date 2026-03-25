# @athena/harmon-store

![logo](./logo.svg)

> SQLite persistence layer for sessions, journal entries, events, and settings.

## Install

```bash
pnpm add @athena/harmon-store
```

## Quick Start

```typescript
import { createStore } from '@athena/harmon-store';

const store = await createStore({ dbPath: '.harmon.db' });
const sessionId = await store.createSession(JSON.stringify(policy));
await store.logEvent('track.started', { trackId: '123' }, sessionId);
await store.endSession(sessionId);
```

## API

| Export | Description |
|---|---|
| `createStore(config?)` | Create store and run migrations |
| `HarmonStore` | Store class with full CRUD |
| `store.createSession(policy)` | Start a new session |
| `store.endSession(id)` | Mark session completed |
| `store.logEvent(type, payload, sessionId?)` | Append to event log |
| `store.addJournalEntry(entry)` | Insert a mood journal entry |
| `store.getJournalEntriesByMood(mood)` | Query entries by mood tag |
| `store.getSetting(key)` / `setSetting(key, value)` | Key-value settings |
| `store.getStats()` | Aggregate counts and mood distribution |

## Architecture

harmon-store sits beneath the daemon, providing durable storage via libSQL/SQLite. It manages automatic migrations, journal entries with mood tags, session lifecycle, and a typed event log. The daemon reads and writes through this layer exclusively.

## License

MIT
