# @sriinnu/harmon-protocol

![logo](./logo.svg)

> Zod-validated schemas for commands, events, and session policies across the harmon system.

## Install

```bash
pnpm add @sriinnu/harmon-protocol
```

## Quick Start

```typescript
import { SessionPolicy, validateCommand, Command } from '@sriinnu/harmon-protocol';

const policy = SessionPolicy.parse({ version: 1, mode: 'focus' });
const cmd = validateCommand({
  id: 'c_1',
  ts: Date.now(),
  source: { kind: 'cli', device: 'macos' },
  type: 'session.start',
  payload: { policy },
});
```

## API

| Export | Description |
|---|---|
| `SessionPolicy` | Zod schema for session configuration |
| `Command` | Zod schema for command envelope |
| `Event` | Zod schema for event envelope |
| `validateCommand(data)` | Parse and validate a command (throws on error) |
| `validateEvent(data)` | Parse and validate an event |
| `validatePolicy(data)` | Parse and validate a session policy |
| `parseCommandSafe(data)` | Safe parse returning `{ success, data/error }` |
| `SessionMode` | Enum: focus, relax, energize, meditate, workout, custom |
| `HardConstraints` | Schema for tempo, energy, vocal filters |
| `SoftWeights` | Schema for ranking weight preferences |
| `TrackInfo` | Provider-agnostic track representation |
| `DaemonStatus` | Daemon health and session status |

## Architecture

harmon-protocol is the shared contract layer. Every package imports its types from here, ensuring CLI, daemon, and engine all speak the same language. Zero runtime dependencies beyond Zod.

## License

GNU Affero General Public License v3.0 only. See [LICENSE](../../LICENSE).
