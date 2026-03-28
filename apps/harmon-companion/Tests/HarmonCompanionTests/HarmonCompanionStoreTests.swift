import Foundation
import Testing
@testable import HarmonCompanion

@MainActor
struct HarmonCompanionStoreTests {
    @Test
    func playOnDeviceUsesLauncherForYouTube() async {
        let client = StubHarmonDaemonClient()
        let launcher = StubPlaybackLauncher()
        let store = HarmonCompanionStore(daemonClient: client, launcher: launcher)
        let item = CompanionMediaItem(
            id: "video-1",
            kind: .song,
            provider: .youtube,
            subtitle: "Creator",
            title: "Focus Mix",
            uri: "youtube:video:video-1"
        )

        await store.playOnDevice(item)

        #expect(launcher.playedItems.map(\.id) == ["video-1"])
        #expect(client.playRequests.isEmpty)
    }

    @Test
    func playOnDeviceUsesLauncherForApple() async {
        let client = StubHarmonDaemonClient()
        let launcher = StubPlaybackLauncher()
        let store = HarmonCompanionStore(daemonClient: client, launcher: launcher)
        let item = CompanionMediaItem(
            id: "apple-1",
            kind: .song,
            provider: .apple,
            subtitle: "Artist",
            title: "Song",
            uri: "apple:song:apple-1"
        )

        await store.playOnDevice(item)

        #expect(launcher.playedItems.map(\.id) == ["apple-1"])
        #expect(client.playRequests.isEmpty)
    }

    @Test
    func playOnDeviceDoesNotFabricateNowPlaying() async {
        let client = StubHarmonDaemonClient()
        let launcher = StubPlaybackLauncher()
        let store = HarmonCompanionStore(daemonClient: client, launcher: launcher)
        let item = CompanionMediaItem(
            id: "video-1",
            kind: .song,
            provider: .youtube,
            subtitle: "Creator",
            title: "Focus Mix",
            uri: "youtube:video:video-1"
        )

        await store.playOnDevice(item)

        #expect(store.nowPlaying == nil)
    }

    @Test
    func playViaDaemonFetchesDaemonNowPlayingInsteadOfOptimisticItemState() async {
        let client = StubHarmonDaemonClient()
        client.nowPlaying = RemoteTrack(
            album: "",
            artist: "Alpha",
            durationMs: 0,
            id: "spotify-track-1",
            name: "Focus",
            playbackTruth: "verified",
            provider: "spotify",
            uri: "spotify:track:spotify-track-1"
        )
        let store = HarmonCompanionStore(daemonClient: client, launcher: StubPlaybackLauncher())

        await store.playViaDaemon(nil)

        #expect(store.nowPlaying?.id == "spotify-track-1")
    }

    @Test
    func playOnDeviceRejectsUnavailableLocalTargetsUpFront() async {
        let client = StubHarmonDaemonClient()
        let launcher = StubPlaybackLauncher()
        launcher.nextAvailability = CompanionPlaybackAvailability(
            enabled: false,
            mode: .handoff,
            reason: "I could not find a playable local reference for that item."
        )
        let store = HarmonCompanionStore(daemonClient: client, launcher: launcher)
        let item = CompanionMediaItem(
            id: "apple-playlist-1",
            kind: .playlist,
            provider: .apple,
            title: "Playlist",
            uri: "apple:playlist:apple-playlist-1"
        )

        await store.playOnDevice(item)

        #expect(launcher.playedItems.isEmpty)
        #expect(store.lastError == "I could not find a playable local reference for that item.")
    }
}

private final class StubHarmonDaemonClient: HarmonDaemonClientProtocol, @unchecked Sendable {
    var nowPlaying: RemoteTrack?
    var playRequests: [(provider: CompanionProvider, target: String?)] = []

    func fetchLibraryTracks(provider: CompanionProvider, limit: Int?) async throws -> [CompanionMediaItem] { [] }
    func fetchNowPlaying(provider: CompanionProvider) async throws -> RemoteTrack? { nowPlaying }
    func fetchPlaylistTracks(provider: CompanionProvider, playlistID: String, limit: Int?) async throws -> [CompanionMediaItem] { [] }
    func fetchPlaylists(provider: CompanionProvider, limit: Int?) async throws -> [CompanionMediaItem] { [] }
    func fetchStatus() async throws -> CompanionDaemonStatus {
        CompanionDaemonStatus(isRunning: true, providers: nil, spotifyConnected: false, version: "0.1.0")
    }
    func next(provider: CompanionProvider) async throws {}
    func pause(provider: CompanionProvider) async throws {}
    func play(provider: CompanionProvider, target: String?) async throws {
        playRequests.append((provider, target))
    }
    func previous(provider: CompanionProvider) async throws {}
    func search(provider: CompanionProvider, query: String, kind: CompanionSearchKind, limit: Int?) async throws -> [CompanionMediaItem] { [] }
}

private final class StubPlaybackLauncher: CompanionPlaybackLaunching, @unchecked Sendable {
    var nextAvailability = CompanionPlaybackAvailability(enabled: true, mode: .handoff)
    var playedItems: [CompanionMediaItem] = []

    func availability(for item: CompanionMediaItem) -> CompanionPlaybackAvailability {
        nextAvailability
    }

    func play(_ item: CompanionMediaItem) async throws {
        playedItems.append(item)
    }
}
