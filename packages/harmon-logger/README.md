# @sriinnu/harmon-logger

![logo](./logo.svg)

> Structured Pino-based logging with pretty-print in dev and JSON in production.

## Install

```bash
pnpm add @sriinnu/harmon-logger
```

## Quick Start

```typescript
import { createLogger } from '@sriinnu/harmon-logger';

const log = createLogger({ name: 'harmond', level: 'debug' });
log.info({ sessionId: 'sess_abc' }, 'Session started');
log.error({ err }, 'Playback failed');
```

## API

| Export | Description |
|---|---|
| `createLogger(config?)` | Create a configured Pino logger |
| `LoggerConfig` | `{ level?, prettyPrint?, name? }` |
| `Logger` | Re-exported Pino `Logger` type |

### Behavior

- **Development** (`NODE_ENV !== 'production'`): colorized, human-readable output via `pino-pretty`
- **Production**: structured JSON logs with ISO timestamps

## Architecture

harmon-logger is a thin wrapper around Pino that standardizes log formatting across all harmon packages and apps. The daemon, CLI, and engine all create child loggers from this factory to ensure consistent, queryable log output.

## License

GNU Affero General Public License v3.0 only. See [LICENSE](../../LICENSE).
