import Foundation
import Testing
@testable import HarmonCompanion

struct AppleRemoteCompanionServiceTests {
    @Test
    func syncOnceProcessesCommandsAndPushesAckedState() async throws {
        let client = StubDaemonClient()
        client.commands = [
            AppleRemoteCommand(
                createdAt: "2026-03-28T10:00:00Z",
                id: "apple_remote_1",
                track: RemoteTrack(
                    album: "",
                    artist: "Apple Music",
                    durationMs: 0,
                    id: "apple-track-1",
                    name: "Track 1",
                    provider: "apple",
                    uri: "apple:song:apple-track-1"
                ),
                type: .play,
                uri: "apple:song:apple-track-1"
            )
        ]

        let playback = InMemoryApplePlaybackController()
        let service = AppleRemoteCompanionService(
            configuration: CompanionConfiguration(
                daemonBaseURL: URL(string: "http://127.0.0.1:9797")!,
                remoteToken: "remote-token",
                deviceID: "iphone-1"
            ),
            client: client,
            playbackController: playback
        )

        let result = try await service.syncOnce()

        #expect(result.appliedCommands.count == 1)
        #expect(result.snapshot.playbackState == .playing)
        #expect(client.sentUpdates.map(\.ackCommandID) == ["apple_remote_1"])
    }

    @Test
    func syncOnceSendsHeartbeatStateWhenNoCommandsExist() async throws {
        let client = StubDaemonClient()
        let playback = InMemoryApplePlaybackController()
        let service = AppleRemoteCompanionService(
            configuration: CompanionConfiguration(
                daemonBaseURL: URL(string: "http://127.0.0.1:9797")!,
                remoteToken: "remote-token",
                deviceID: "iphone-1",
                heartbeatIntervalSeconds: 2
            ),
            client: client,
            playbackController: playback
        )

        let result = try await service.syncOnce()

        #expect(result.appliedCommands.isEmpty)
        #expect(client.sentUpdates.count == 1)
        #expect(client.sentUpdates[0].ackCommandID == nil)
        #expect(await service.heartbeatIntervalNanoseconds() == 2_000_000_000)
    }

    @Test
    func syncOnceDoesNotReplayAppliedCommandAfterStatePushFailure() async throws {
        let client = StubDaemonClient()
        client.failNextStateUpdate = true
        client.commands = [
            AppleRemoteCommand(
                createdAt: "2026-03-28T10:00:00Z",
                id: "apple_remote_1",
                track: RemoteTrack(
                    album: "",
                    artist: "Apple Music",
                    durationMs: 0,
                    id: "apple-track-1",
                    name: "Track 1",
                    provider: "apple",
                    uri: "apple:song:apple-track-1"
                ),
                type: .play,
                uri: "apple:song:apple-track-1"
            )
        ]

        let playback = CountingApplePlaybackController()
        let service = AppleRemoteCompanionService(
            configuration: CompanionConfiguration(
                daemonBaseURL: URL(string: "http://127.0.0.1:9797")!,
                remoteToken: "remote-token",
                deviceID: "iphone-1"
            ),
            client: client,
            playbackController: playback
        )

        await #expect(throws: Error.self) {
            try await service.syncOnce()
        }
        let result = try await service.syncOnce()

        #expect(await playback.applyCount == 1)
        #expect(result.appliedCommands.map(\.id) == ["apple_remote_1"])
    }
}

private final class StubDaemonClient: AppleRemoteDaemonClientProtocol, @unchecked Sendable {
    var commands: [AppleRemoteCommand] = []
    var failNextStateUpdate = false
    var sentUpdates: [CompanionStateUpdate] = []

    func acknowledgeCommand(id: String) async throws {}

    func connect() async throws -> AppleRemoteBridgeStatus {
        AppleRemoteBridgeStatus(connected: true, pendingCommands: 0, playbackState: .stopped)
    }

    func fetchCommands() async throws -> [AppleRemoteCommand] {
        commands
    }

    func fetchStatus() async throws -> AppleRemoteBridgeStatus {
        AppleRemoteBridgeStatus(connected: true, pendingCommands: commands.count, playbackState: .stopped)
    }

    func sendState(_ update: CompanionStateUpdate) async throws -> AppleRemoteBridgeStatus {
        if failNextStateUpdate {
            failNextStateUpdate = false
            throw AppleRemoteDaemonClientError.requestFailed(503, "temporary failure")
        }
        sentUpdates.append(update)
        return AppleRemoteBridgeStatus(
            connected: true,
            currentTrack: update.snapshot.currentTrack,
            pendingCommands: 0,
            playbackState: update.snapshot.playbackState
        )
    }
}

private actor CountingApplePlaybackController: ApplePlaybackControlling {
    private(set) var applyCount = 0

    func apply(_ command: AppleRemoteCommand) async throws {
        _ = command
        applyCount += 1
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
