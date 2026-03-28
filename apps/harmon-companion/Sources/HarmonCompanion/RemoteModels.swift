import Foundation

/// I describe the static configuration the companion uses to talk to harmond.
public struct CompanionConfiguration: Equatable, Sendable {
    public var appVersion: String?
    public var daemonBaseURL: URL
    public var deviceID: String
    public var deviceName: String?
    public var heartbeatIntervalSeconds: TimeInterval
    public var platform: String
    public var remoteToken: String
    public var requestTimeoutSeconds: TimeInterval

    public init(
        daemonBaseURL: URL,
        remoteToken: String,
        deviceID: String,
        deviceName: String? = nil,
        platform: String = "ios",
        appVersion: String? = nil,
        requestTimeoutSeconds: TimeInterval = 15,
        heartbeatIntervalSeconds: TimeInterval = 5
    ) {
        self.appVersion = appVersion
        self.daemonBaseURL = daemonBaseURL
        self.deviceID = deviceID
        self.deviceName = deviceName
        self.heartbeatIntervalSeconds = heartbeatIntervalSeconds
        self.platform = platform
        self.remoteToken = remoteToken
        self.requestTimeoutSeconds = requestTimeoutSeconds
    }
}

/// I mirror one provider-aware track payload from the daemon contract.
public struct RemoteTrack: Codable, Equatable, Sendable {
    public var album: String
    public var artist: String
    public var durationMs: Int
    public var id: String
    public var imageURL: String?
    public var name: String
    public var playbackTruth: String?
    public var provider: String?
    public var uri: String?

    enum CodingKeys: String, CodingKey {
        case album
        case artist
        case durationMs
        case id
        case imageURL = "imageUrl"
        case name
        case playbackTruth
        case provider
        case uri
    }

    public init(
        album: String,
        artist: String,
        durationMs: Int,
        id: String,
        imageURL: String? = nil,
        name: String,
        playbackTruth: String? = nil,
        provider: String? = nil,
        uri: String? = nil
    ) {
        self.album = album
        self.artist = artist
        self.durationMs = durationMs
        self.id = id
        self.imageURL = imageURL
        self.name = name
        self.playbackTruth = playbackTruth
        self.provider = provider
        self.uri = uri
    }
}

/// I represent the playback state values the daemon accepts from the companion.
public enum RemotePlaybackState: String, Codable, Equatable, Sendable {
    case paused
    case playing
    case stopped
}

/// I describe one command harmond wants the companion to execute.
public struct AppleRemoteCommand: Codable, Equatable, Sendable {
    public enum CommandType: String, Codable, Equatable, Sendable {
        case next
        case pause
        case play
        case previous
    }

    public var createdAt: String
    public var id: String
    public var track: RemoteTrack?
    public var type: CommandType
    public var uri: String?

    public init(
        createdAt: String,
        id: String,
        track: RemoteTrack? = nil,
        type: CommandType,
        uri: String? = nil
    ) {
        self.createdAt = createdAt
        self.id = id
        self.track = track
        self.type = type
        self.uri = uri
    }
}

/// I describe the bridge status harmond exposes to the companion.
public struct AppleRemoteBridgeStatus: Codable, Equatable, Sendable {
    public struct CompanionInfo: Codable, Equatable, Sendable {
        public var appVersion: String?
        public var connectedAt: String
        public var deviceID: String
        public var lastSeenAt: String
        public var name: String?
        public var platform: String?

        enum CodingKeys: String, CodingKey {
            case appVersion
            case connectedAt
            case deviceID = "deviceId"
            case lastSeenAt
            case name
            case platform
        }
    }

    public var companion: CompanionInfo?
    public var connected: Bool
    public var currentTrack: RemoteTrack?
    public var pendingCommands: Int
    public var playbackState: RemotePlaybackState

    public init(
        companion: CompanionInfo? = nil,
        connected: Bool,
        currentTrack: RemoteTrack? = nil,
        pendingCommands: Int,
        playbackState: RemotePlaybackState
    ) {
        self.companion = companion
        self.connected = connected
        self.currentTrack = currentTrack
        self.pendingCommands = pendingCommands
        self.playbackState = playbackState
    }
}

/// I describe the playback snapshot the companion pushes back into harmond.
public struct CompanionPlaybackSnapshot: Equatable, Sendable {
    public var currentTrack: RemoteTrack?
    public var playbackState: RemotePlaybackState

    public init(currentTrack: RemoteTrack?, playbackState: RemotePlaybackState) {
        self.currentTrack = currentTrack
        self.playbackState = playbackState
    }
}

/// I describe one state payload sent from the companion to harmond.
public struct CompanionStateUpdate: Equatable, Sendable {
    public var ackCommandID: String?
    public var snapshot: CompanionPlaybackSnapshot

    public init(ackCommandID: String? = nil, snapshot: CompanionPlaybackSnapshot) {
        self.ackCommandID = ackCommandID
        self.snapshot = snapshot
    }
}

/// I model the main sync result the app host can render after a loop turn.
public struct CompanionSyncResult: Equatable, Sendable {
    public var appliedCommands: [AppleRemoteCommand]
    public var bridgeStatus: AppleRemoteBridgeStatus
    public var snapshot: CompanionPlaybackSnapshot

    public init(
        appliedCommands: [AppleRemoteCommand],
        bridgeStatus: AppleRemoteBridgeStatus,
        snapshot: CompanionPlaybackSnapshot
    ) {
        self.appliedCommands = appliedCommands
        self.bridgeStatus = bridgeStatus
        self.snapshot = snapshot
    }
}
