# Contributing to Harmon

Thanks for your interest in contributing to Harmon!

## Development Setup

```bash
git clone https://github.com/your-org/harmon.git
cd harmon
pnpm install
pnpm build
```

## Monorepo Structure

```
packages/
  harmon-core       # Session engine, ranking, MusicProvider interface
  harmon-protocol   # Zod schemas for commands, events, policies
  harmon-store      # SQLite persistence with versioned migrations
  harmon-crypto     # AES-256-GCM encryption
  harmon-spotify    # Spotify client + MusicProvider adapter
  harmon-apple      # Apple Music client + MusicProvider adapter
  harmon-youtube    # YouTube Music client + MusicProvider adapter
  harmon-flow       # Journal pattern detection, MCP server
  harmon-logger     # Pino structured logging
apps/
  harmond           # HTTP+SSE daemon
  harmon-cli        # CLI client
```

## Running Tests

```bash
pnpm test              # Run all tests
pnpm test:run          # Run once (no watch)
pnpm --filter @sriinnu/harmon-core test  # Single package
```

## Making Changes

1. Create a branch from `main`
2. Make your changes in the relevant package(s)
3. Add/update tests for any behavioral changes
4. Run `pnpm lint` and `pnpm test` to verify
5. Open a PR with a clear description

## Code Style

- TypeScript strict mode
- No default exports
- Prefer interfaces over type aliases for public API
- Use `MusicProvider`/`PlaybackController` for new music service integrations
- Keep packages focused — one responsibility per package

## Daemon Architecture

The daemon (`apps/harmond/src/`) uses an extracted route module pattern:

```
apps/harmond/src/
  ├── index.ts              — Harmond class (orchestrator, ~980 LOC)
  ├── daemon-context.ts     — DaemonContext interface (route contract)
  ├── helpers.ts            — Pure parsing/validation utilities
  ├── middleware.ts          — Rate limiting, CORS, auth, security headers
  ├── error-classification.ts — Error → HTTP response mapping
  ├── provider-status.ts    — Provider readiness probes
  ├── credential-stores.ts  — Encrypted token persistence
  ├── session-policy.ts     — Policy validation and normalization
  ├── youtube-auth.ts       — YouTube OAuth with auto-refresh
  ├── apple-auth.ts         — Apple JWT auto-regeneration
  ├── main.ts               — Entry point with signal handlers
  └── routes/
      ├── auth.ts           — OAuth login/callback/logout for all providers
      ├── session.ts        — Session lifecycle, command dispatch, SSE
      ├── spotify.ts        — Spotify browse/playback/library
      ├── apple.ts          — Apple Music browse/playback/remote
      ├── youtube.ts        — YouTube Music browse/playback
      ├── smart.ts          — Cross-provider smart play/search
      ├── recognize.ts      — Song recognition
      └── player.ts         — Embedded YouTube mini player
```

Route modules receive a `DaemonContext` object. Add new routes by creating a file in `routes/` and registering it in `index.ts:setupRoutes()`.

## Adding a New Music Provider

1. Create `packages/harmon-<provider>/` with `package.json`, `tsconfig.json`
2. Implement the raw API client (auth, search, library, playback)
3. Create a `MusicProvider` adapter class
4. Create a `PlaybackController` adapter class (if playback is supported)
5. Export factory functions: `create<Provider>Provider()`, `create<Provider>Playback()`
6. Add the provider to the daemon's constructor in `apps/harmond/src/index.ts`
7. Add logo.svg, README.md, SKILL.md

## License

By contributing, you agree that your contributions will be licensed under the GNU Affero General Public License v3.0 only.
