# Harmon Web

I am the small browser control surface for Harmon.

I do three things:

- I browse search, library tracks, playlists, and playlist tracks for Spotify, Apple Music, and YouTube Music.
- I can tell the daemon to play on its configured runtime.
- I can also open provider-native playback URLs in the current browser or provider app where that is more truthful.
- I only expose daemon controls that the selected provider/runtime actually supports on the current host.

## Run

```bash
# From the repo root
pnpm start:web

# Or package-local
pnpm --filter @sriinnu/harmon-web start
```

Then open `http://127.0.0.1:4173`.

## Before You Open Me

From a fresh repo checkout, run `pnpm build` once first. After that, I expect a running daemon plus at least one authenticated provider:

```bash
pnpm auth:spotify
pnpm auth:apple
pnpm auth:youtube
pnpm start:daemon
pnpm start:web
```

## Inputs

- `Daemon URL`: usually `http://127.0.0.1:17373`
- `API Token`: optional unless the daemon requires bearer auth. I only send it to HTTPS or loopback daemon URLs.

## Scope

I am intentionally small and static.

- No framework runtime
- No server dependency beyond a tiny local static file server
- Provider browse/search/play surfaces only
- YouTube still reflects the daemon's browser-handoff playback reality
- I only expose daemon transport and daemon-play actions when the selected provider runtime can actually honor them on the current host
