# Harmon Companion

I am the iOS companion vertical for Harmon.

This package does four things:

- I model the daemon-side Apple remote protocol.
- I provide an authenticated daemon client for `/v1/apple/remote/*`.
- I provide a provider-aware daemon browser for Spotify, Apple Music, and YouTube Music.
- I expose a small SwiftUI companion shell so an iPhone app host can stay thin.

## Scope

I am the companion shell and runtime core, not a signed Xcode app bundle.

- The daemon contract already lives in `apps/harmond`.
- This package gives that contract a first-class Swift vertical.
- A final iPhone app target can embed this package without inventing another runtime contract.

## Getting Started

I am a Swift package, not a signed app bundle. The day-one host flow is:

1. Start `harmond` on the machine that owns provider auth.
2. Configure Apple remote if you want the daemon to drive on-device Apple playback.
3. Create a thin iPhone or iPad host app that embeds this package.
4. Use `HarmonDaemonClient` for browse and daemon-play routes.
5. Use `IOSSystemMusicPlayerController` plus `ProviderPlaybackLauncher` when you want truthful on-device Apple playback.

## Main Types

- `CompanionConfiguration`: daemon URL, remote token, device identity, and polling cadence.
- `HarmonDaemonConfiguration`: daemon URL, bearer auth, and request timeouts for provider browse/play routes.
- `AppleRemoteDaemonClient`: authenticated client for connect, status, command polling, ack, and state push.
- `AppleRemoteCompanionService`: one command-processing loop over the daemon contract.
- `AppleRemoteCompanionStore`: `ObservableObject` state for a SwiftUI app.
- `HarmonDaemonClient`: normalized provider-aware browse/play client for all three providers.
- `HarmonCompanionStore`: SwiftUI-facing provider-aware state container.
- `HarmonCompanionView`: small SwiftUI shell for search, library, playlists, and play actions.
- `IOSSystemMusicPlayerController`: iOS-only `MediaPlayer` adapter for Apple Music playback.

## Remote Contract

I target these endpoints from harmond:

- `GET /v1/apple/remote/status`
- `POST /v1/apple/remote/connect`
- `GET /v1/apple/remote/commands`
- `POST /v1/apple/remote/commands/:id/ack`
- `POST /v1/apple/remote/state`

The companion authenticates with `APPLE_MUSIC_REMOTE_TOKEN`.

## Multi-Provider Surface

I also target the daemon's normal provider routes:

- `GET /v1/status`
- `GET /v1/{provider}/search`
- `GET /v1/spotify/library/tracks`
- `GET /v1/spotify/playlists`
- `GET /v1/apple/library/songs`
- `GET /v1/apple/library/playlists`
- `GET /v1/youtube/library/tracks`
- `GET /v1/youtube/playlists`
- `GET /v1/{provider}/playlists/:id/tracks`
- `GET /v1/{provider}/now-playing`
- `POST /v1/{provider}/play`
- `POST /v1/{provider}/pause`
- `POST /v1/{provider}/next`
- `POST /v1/{provider}/prev`

That lets the companion browse all three providers, open Spotify and YouTube locally, and play Apple Music locally on iPhone or iPad when the host app has Music access.

## Host App Shape

The intended host app is small:

1. Create `CompanionConfiguration` if you want Apple remote playback on iPhone.
2. Create `HarmonDaemonConfiguration` for general browse/play daemon access.
3. Create `AppleRemoteDaemonClient` and `AppleRemoteCompanionService` if you want daemon-driven Apple remote execution.
4. Create `HarmonDaemonClient`, `SystemPlaybackLauncher`, and `HarmonCompanionStore` for the provider-aware app shell.
5. Render `HarmonCompanionView`.

Apple remote playback expands where Apple can play, but Apple session seeding still depends on daemon-side Apple catalog or library auth.

## Repo Workflow

```bash
pnpm start:daemon
pnpm auth:apple
cd apps/harmon-companion
swift test
```

## Testing

I am testable on macOS without an iPhone app host:

```bash
cd apps/harmon-companion
swift test
```
