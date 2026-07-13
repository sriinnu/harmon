---
name: harmon-logger
description: Pino-based structured logger with pretty-print in dev and JSON in production
capabilities:
  - Create named, leveled logger instances with consistent formatting
  - Pretty-print colorized logs in development via pino-pretty
  - Emit structured JSON logs with ISO timestamps in production
tags:
  - logging
  - pino
  - observability
provider: harmon
version: 0.2.0
---

# Harmon Logger

## What this does
harmon-logger is a thin factory around Pino that standardizes logging across all harmon packages and apps. In development it outputs colorized, human-readable logs via pino-pretty. In production it emits structured JSON with ISO timestamps, suitable for log aggregation. All harmon components (daemon, engine, CLI) use this factory to ensure consistent, queryable log output.

## When to use
- Creating a logger for a new harmon package or application
- Switching between human-readable and structured JSON output based on environment
- Adding contextual fields (sessionId, provider, trackId) to structured logs

## Key exports
- `createLogger` — factory that accepts `{ level?, prettyPrint?, name? }` and returns a Pino Logger
- `Logger` — re-exported Pino Logger type for use in function signatures

## Example
```typescript
import { createLogger } from '@sriinnu/harmon-logger';

const log = createLogger({ name: 'harmond', level: 'debug' });
log.info({ sessionId: 'sess_abc' }, 'Session started');
log.error({ err }, 'Playback failed');
```
