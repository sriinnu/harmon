# @sriinnu/harmon

![logo](./logo.svg)

> Thin CLI and TypeScript client for controlling the Harmon daemon from the terminal.

## Install

```bash
# Global CLI install
pnpm add -g @sriinnu/harmon

# Or run it without installing
pnpm dlx @sriinnu/harmon --help
```

## Quick Start

```bash
# Start the daemon first
pnpm start:daemon

# If the daemon is protected
export HARMON_API_TOKEN="your_harmond_token"

# From an installed CLI
harmon --help
harmon status
harmon --provider spotify session start --mode focus

# From a repo checkout
pnpm --filter @sriinnu/harmon exec harmon --help
pnpm --filter @sriinnu/harmon exec harmon --provider youtube search song "late night focus"
```

Browser-cookie auth import is safest against loopback or HTTPS daemon endpoints. When I am not running from a repo checkout, use `--cookie-path` or set `HARMON_SILO_HELPER` before `harmon auth import`.

## Programmatic Use

```typescript
import { createCLI, getDefaultEndpoint } from '@sriinnu/harmon';

const cli = createCLI({ endpoint: getDefaultEndpoint() });
const status = await cli.status();

await cli.command({
  id: 'c_1',
  ts: Date.now(),
  source: { kind: 'cli', device: 'macos' },
  type: 'session.start',
  payload: { policy: { version: 1, provider: 'spotify', mode: 'focus' } },
});
```

## API Highlights

- `createCLI(config)`: create a typed daemon client
- `getDefaultEndpoint()`: resolve `HARMON_ENDPOINT` or `http://127.0.0.1:17373`
- `cli.status()`: read daemon and provider status
- `cli.command(cmd)`: send a typed command envelope
- `cli.spotifyPlay()` / `cli.applePlay()` / `cli.youtubePlay()`: provider play helpers
- `cli.youtubeNowPlaying()`: read daemon-managed YouTube browser-handoff state

## Architecture

I am a stateless HTTP client over `harmond`. The TypeScript surface stays thin, and the CLI binary adds argument parsing, output formatting, and provider-aware ergonomics on top of the same daemon contract.

## License

GNU Affero General Public License v3.0 only. See [LICENSE](../../LICENSE).
