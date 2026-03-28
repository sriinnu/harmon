import Foundation
import Testing
@testable import HarmonCompanion

@MainActor
struct AppleRemoteCompanionStoreTests {
    @Test
    func syncNowClearsStalePlaybackTruthAfterFailure() async {
        let client = FlakyAppleRemoteDaemonClient()
        let playback = FixedApplePlaybackController()
        let service = AppleRemoteCompanionService(
            configuration: CompanionConfiguration(
                daemonBaseURL: URL(string: "http://127.0.0.1:9797")!,
                remoteToken: "remote-token",
                deviceID: "iphone-1"
            ),
            client: client,
            playbackController: playback
        )
        let store = AppleRemoteCompanionStore(service: service)

        await store.syncNow()
        #expect(store.currentTrack?.id == "apple-track-1")
        #expect(store.playbackState == .playing)
        #expect(store.bridgeStatus?.connected == true)

        client.failNextStateUpdate = true
        await store.syncNow()

        #expect(store.currentTrack == nil)
        #expect(store.playbackState == .stopped)
        #expect(store.bridgeStatus == nil)
        #expect(store.lastError != nil)
    }
}

private final class FlakyAppleRemoteDaemonClient: AppleRemoteDaemonClientProtocol, @unchecked Sendable {
    var failNextStateUpdate = false

    func acknowledgeCommand(id: String) async throws {}

    func connect() async throws -> AppleRemoteBridgeStatus {
        AppleRemoteBridgeStatus(connected: true, pendingCommands: 0, playbackState: .stopped)
    }

    func fetchCommands() async throws -> [AppleRemoteCommand] {
        []
    }

    func fetchStatus() async throws -> AppleRemoteBridgeStatus {
        AppleRemoteBridgeStatus(connected: true, pendingCommands: 0, playbackState: .stopped)
    }

    func sendState(_ update: CompanionStateUpdate) async throws -> AppleRemoteBridgeStatus {
        if failNextStateUpdate {
            failNextStateUpdate = false
            throw AppleRemoteDaemonClientError.requestFailed(503, "temporary failure")
        }

        return AppleRemoteBridgeStatus(
            connected: true,
            currentTrack: update.snapshot.currentTrack,
            pendingCommands: 0,
            playbackState: update.snapshot.playbackState
        )
    }
}

private actor FixedApplePlaybackController: ApplePlaybackControlling {
    func apply(_ command: AppleRemoteCommand) async throws {
        _ = command
    }

    func snapshot() async -> CompanionPlaybackSnapshot {
        CompanionPlaybackSnapshot(
            currentTrack: RemoteTrack(
                album: "",
                artist: "Apple Music",
                durationMs: 0,
                id: "apple-track-1",
                name: "Track 1",
                playbackTruth: "verified",
                provider: "apple",
                uri: "apple:song:apple-track-1"
            ),
            playbackState: .playing
        )
    }
}
