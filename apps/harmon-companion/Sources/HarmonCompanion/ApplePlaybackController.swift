import Foundation

/// I abstract Apple Music playback so the companion loop can stay transport-focused.
public protocol ApplePlaybackControlling: Sendable {
    func apply(_ command: AppleRemoteCommand) async throws
    func snapshot() async -> CompanionPlaybackSnapshot
}

/// I surface companion-side playback failures with simple user-facing messages.
public enum ApplePlaybackControllerError: Error, LocalizedError, Sendable {
    case missingPlayableReference

    public var errorDescription: String? {
        switch self {
        case .missingPlayableReference:
            return "I could not find a playable Apple Music reference in the remote command."
        }
    }
}

/// I provide a deterministic test double for the companion service and store.
public actor InMemoryApplePlaybackController: ApplePlaybackControlling {
    public private(set) var appliedCommands: [AppleRemoteCommand] = []
    private var currentTrack: RemoteTrack?
    private var playbackState: RemotePlaybackState = .stopped

    public init() {}

    public func apply(_ command: AppleRemoteCommand) async throws {
        appliedCommands.append(command)

        switch command.type {
        case .pause:
            playbackState = .paused
        case .next, .previous:
            playbackState = .playing
        case .play:
            guard let track = command.track ?? minimalTrack(from: command.uri) else {
                throw ApplePlaybackControllerError.missingPlayableReference
            }
            currentTrack = track
            playbackState = .playing
        }
    }

    public func snapshot() async -> CompanionPlaybackSnapshot {
        CompanionPlaybackSnapshot(
            currentTrack: currentTrack,
            playbackState: playbackState
        )
    }
}

private func minimalTrack(from uri: String?) -> RemoteTrack? {
    guard let uri, !uri.isEmpty else {
        return nil
    }

    let fallbackID = uri.split(separator: "/").last.map(String.init) ?? uri
    return RemoteTrack(
        album: "",
        artist: "Apple Music",
        durationMs: 0,
        id: fallbackID,
        name: fallbackID,
        provider: "apple",
        uri: uri
    )
}
