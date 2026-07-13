# harmon-menubar

Native macOS menubar cockpit for the harmon daemon. SwiftUI `MenuBarExtra`, no Electron, no Dock icon.

```bash
pnpm menubar          # run from the repo (release build, foreground)
pnpm menubar:install  # build → bundle → /Applications/Harmon Menubar.app (icon, ad-hoc signed, launches)
```

The installed app is a proper `LSUIElement` bundle (no Dock icon). Add it to *System Settings → Login Items* to start at login. Override the target directory with `HARMON_MENUBAR_INSTALL_DIR`.

## What it does

- **Live status** — icon reflects state (note = playing, list = idle, house = daemon down). Updates are pushed over the daemon's SSE stream (`/v1/events`) the moment a track changes; a 10s poll is the fallback.
- **Now playing** — track, artist, provider, session queue depth.
- **Transport** — play / pause / next / previous on the active provider, Spotify volume slider. Pause is disabled for YouTube browser-handoff (the daemon can't pause it — honest UI).
- **Play anything…** — a smart-play box: type a song, it fans out across connected providers.
- **Sessions** — start focus/relax/energize/meditate/workout, nudge calmer/sharper, stop.
- **Login from the menubar** — Connect buttons for Spotify and YouTube fetch the daemon's OAuth URL and open the browser; the provider dot flips green when the callback lands. Apple Music shows status (its MusicKit user token comes via `pnpm auth:apple`).
- **Settings** — daemon endpoint + API token, persisted in UserDefaults (also read from `HARMON_ENDPOINT` / `HARMON_API_TOKEN` env when launched from a shell).

## Requirements

macOS 14+, Swift 6 toolchain. The daemon must be reachable (default `http://127.0.0.1:17373`).

## Tests

```bash
swift test --package-path apps/harmon-menubar
```
