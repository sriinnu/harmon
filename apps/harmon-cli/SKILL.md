---
name: harmon-cli
description: Thin HTTP client for controlling the harmon daemon from the terminal
capabilities:
  - Play, pause, skip, and seek across Spotify and Apple Music via daemon endpoints
  - Manage sessions (start, stop, nudge) and discover/switch playback devices
  - Search music catalogs, handle OAuth login/logout, and import cookies
tags:
  - cli
  - terminal
  - client
provider: harmon
version: 0.1.0
---

# Harmon CLI

## What this does
harmon-cli is a stateless HTTP client library that maps every harmond endpoint to a typed async method. It handles request timeouts via AbortController, auth headers, and JSON serialization. The CLI binary wraps this library with argument parsing and formatted terminal output, giving users full control over sessions, playback, search, and authentication from the command line.

## When to use
- Controlling harmon playback (play/pause/next/prev) from a script or terminal
- Starting and managing music sessions with policy configuration
- Searching Spotify or Apple Music catalogs and managing OAuth flows programmatically

## Key exports
- `createCLI` — factory that accepts `{ endpoint, token?, timeoutMs? }` and returns a client with all daemon methods

## Example
```typescript
import { createCLI, getDefaultEndpoint } from '@sriinnu/harmon';

const cli = createCLI({ endpoint: getDefaultEndpoint() });
await cli.status();
await cli.spotifyPlay({ uri: 'spotify:track:4uLU6hMCjMI75M1A2tKUQC' });
await cli.spotifyNext();
```
