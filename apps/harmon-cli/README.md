# @athena/harmon

![logo](./logo.svg)

> Thin HTTP client for controlling the harmon daemon from the terminal.

## Install

```bash
pnpm add @athena/harmon
```

## Quick Start

```typescript
import { createCLI, getDefaultEndpoint } from '@athena/harmon';

const cli = createCLI({ endpoint: getDefaultEndpoint() });
const status = await cli.status();
await cli.spotifyPlay({ uri: 'spotify:track:...' });
await cli.command({
  id: 'c_1',
  ts: Date.now(),
  source: { kind: 'cli', device: 'macos' },
  type: 'session.start',
  payload: { policy: { version: 1, mode: 'focus' } },
});
```

## API

| Export | Description |
|---|---|
| `createCLI(config)` | Create a CLI client instance |
| `getDefaultEndpoint()` | Returns `HARMON_ENDPOINT` or `http://127.0.0.1:17373` |
| `cli.status()` | Get daemon status |
| `cli.command(cmd)` | Send a command envelope |
| `cli.devices()` | List playback devices |
| `cli.spotifyPlay(opts?)` | Play on Spotify |
| `cli.spotifyPause()` | Pause Spotify |
| `cli.spotifySearch(query, type)` | Search Spotify catalog |
| `cli.applePlay(opts?)` | Play on Apple Music |
| `cli.authLogin()` / `authLogout()` | Manage Spotify auth |
| `CLIConfig` | `{ endpoint, token?, timeoutMs? }` |

## Architecture

harmon-cli is a stateless HTTP client that sends requests to the harmond daemon. It handles timeout/abort, auth headers, and maps every daemon endpoint to a typed async method. The CLI binary wraps this library with argument parsing and formatted output.

## License

GNU Affero General Public License v3.0 only. See [LICENSE](../../LICENSE).
