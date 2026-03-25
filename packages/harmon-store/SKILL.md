---
name: harmon-store
description: SQLite persistence layer with versioned migrations for sessions, journals, and events
capabilities:
  - Store and query journal entries with mood tags, energy levels, and embeddings
  - Manage session lifecycle (create, end, cancel) with status tracking
  - Log and retrieve events with session correlation and time-based queries
tags:
  - database
  - sqlite
  - persistence
  - storage
provider: harmon
version: 0.1.0
---

# Harmon Store

## What this does
harmon-store provides the persistence layer for the entire harmon system. It manages a SQLite database (via libsql) with automatic versioned migrations, storing journal entries, sessions, event logs, and key-value settings. The store enforces WAL mode for concurrent read performance and validates that encryption is enabled in production environments.

## When to use
- Persisting session history, event logs, or journal entries to disk
- Querying past sessions, mood distributions, or recent play statistics
- Adding a new migration when the schema needs to evolve

## Key exports
- `HarmonStore` — class with methods for journals, sessions, events, settings, and stats
- `createStore` — async factory that instantiates HarmonStore and runs pending migrations
- `JournalEntry` — interface for a parsed journal record (mood, energy, content, embedding)
- `Session` — interface for a session record (id, policy, status, timestamps)

## Example
```typescript
import { createStore } from '@athena/harmon-store';

const store = await createStore({ dbPath: '.harmon.db' });
const sessionId = await store.createSession(JSON.stringify(policy));
await store.logEvent('session.started', { sessionId });
const stats = await store.getStats();
```
