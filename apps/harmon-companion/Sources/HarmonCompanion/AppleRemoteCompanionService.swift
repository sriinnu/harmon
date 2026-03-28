import Foundation

/// I run one authenticated Apple companion sync cycle against harmond.
public actor AppleRemoteCompanionService {
    private var appliedCommandIDs: Set<String> = []
    private let client: AppleRemoteDaemonClientProtocol
    private let configuration: CompanionConfiguration
    private let playbackController: ApplePlaybackControlling

    public init(
        configuration: CompanionConfiguration,
        client: AppleRemoteDaemonClientProtocol,
        playbackController: ApplePlaybackControlling
    ) {
        self.client = client
        self.configuration = configuration
        self.playbackController = playbackController
    }

    public func connect() async throws -> AppleRemoteBridgeStatus {
        try await client.connect()
    }

    public func fetchStatus() async throws -> AppleRemoteBridgeStatus {
        try await client.fetchStatus()
    }

    /// I process the pending command queue and push the resulting playback state.
    public func syncOnce() async throws -> CompanionSyncResult {
        let commands = try await client.fetchCommands()
        var appliedCommands: [AppleRemoteCommand] = []
        var latestStatus = try await client.fetchStatus()
        var latestSnapshot = await playbackController.snapshot()

        if commands.isEmpty {
            latestStatus = try await client.sendState(CompanionStateUpdate(snapshot: latestSnapshot))
            return CompanionSyncResult(
                appliedCommands: appliedCommands,
                bridgeStatus: latestStatus,
                snapshot: latestSnapshot
            )
        }

        for command in commands {
            if !appliedCommandIDs.contains(command.id) {
                try await playbackController.apply(command)
                appliedCommandIDs.insert(command.id)
            }
            latestSnapshot = await playbackController.snapshot()
            latestStatus = try await client.sendState(
                CompanionStateUpdate(
                    ackCommandID: command.id,
                    snapshot: latestSnapshot
                )
            )
            appliedCommandIDs.remove(command.id)
            appliedCommands.append(command)
        }

        return CompanionSyncResult(
            appliedCommands: appliedCommands,
            bridgeStatus: latestStatus,
            snapshot: latestSnapshot
        )
    }

    public func heartbeatIntervalNanoseconds() -> UInt64 {
        UInt64(configuration.heartbeatIntervalSeconds * 1_000_000_000)
    }
}
