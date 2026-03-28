import Foundation

/// I describe the authenticated daemon endpoint the companion app talks to.
public struct HarmonDaemonConfiguration: Equatable, Sendable {
    public var apiToken: String?
    public var baseURL: URL
    public var requestTimeoutSeconds: TimeInterval

    public init(
        baseURL: URL,
        apiToken: String? = nil,
        requestTimeoutSeconds: TimeInterval = 15
    ) {
        self.apiToken = apiToken
        self.baseURL = baseURL
        self.requestTimeoutSeconds = requestTimeoutSeconds
    }
}

/// I enumerate the providers the companion app can browse and launch.
public enum CompanionProvider: String, CaseIterable, Codable, Identifiable, Sendable {
    case spotify
    case apple
    case youtube

    public var id: String { rawValue }

    public var displayName: String {
        switch self {
        case .spotify:
            return "Spotify"
        case .apple:
            return "Apple Music"
        case .youtube:
            return "YouTube Music"
        }
    }
}

/// I enumerate the browse/search shapes the daemon can return.
public enum CompanionSearchKind: String, CaseIterable, Codable, Identifiable, Sendable {
    case song
    case album
    case artist
    case playlist

    public var id: String { rawValue }
}

/// I model one normalized media item across Spotify, Apple Music, and YouTube Music.
public struct CompanionMediaItem: Equatable, Identifiable, Sendable {
    public var album: String?
    public var durationMs: Int?
    public var id: String
    public var imageURL: String?
    public var kind: CompanionSearchKind
    public var provider: CompanionProvider
    public var subtitle: String?
    public var title: String
    public var uri: String?
    public var url: String?

    public init(
        album: String? = nil,
        durationMs: Int? = nil,
        id: String,
        imageURL: String? = nil,
        kind: CompanionSearchKind,
        provider: CompanionProvider,
        subtitle: String? = nil,
        title: String,
        uri: String? = nil,
        url: String? = nil
    ) {
        self.album = album
        self.durationMs = durationMs
        self.id = id
        self.imageURL = imageURL
        self.kind = kind
        self.provider = provider
        self.subtitle = subtitle
        self.title = title
        self.uri = uri
        self.url = url
    }

    /// I return the most useful provider-native target for daemon-side playback.
    public var daemonPlaybackTarget: String? {
        uri ?? url ?? fallbackDaemonTarget
    }

    /// I turn a normalized media item back into the shared track shape the UI already uses.
    public var asRemoteTrack: RemoteTrack {
        RemoteTrack(
            album: album ?? "",
            artist: subtitle ?? provider.displayName,
            durationMs: durationMs ?? 0,
            id: id,
            imageURL: imageURL,
            name: title,
            provider: provider.rawValue,
            uri: daemonPlaybackTarget
        )
    }

    private var fallbackDaemonTarget: String? {
        switch (provider, kind) {
        case (.spotify, .song):
            return "spotify:track:\(id)"
        case (.spotify, .album):
            return "spotify:album:\(id)"
        case (.spotify, .artist):
            return "spotify:artist:\(id)"
        case (.spotify, .playlist):
            return "spotify:playlist:\(id)"
        case (.youtube, .song):
            return "youtube:video:\(id)"
        case (.youtube, .playlist):
            return "youtube:playlist:\(id)"
        case (.apple, .song):
            return "apple:song:\(id)"
        case (.apple, .album):
            return "apple:album:\(id)"
        case (.apple, .artist):
            return "apple:artist:\(id)"
        case (.apple, .playlist):
            return "apple:playlist:\(id)"
        default:
            return nil
        }
    }
}

/// I mirror the provider status block from harmond.
public struct CompanionProviderStatus: Codable, Equatable, Sendable {
    public var auth: String?
    public var capabilities: [String: Bool]?
    public var connected: Bool
    public var name: String?
    public var playbackMode: String?
    public var status: String?
}

/// I keep the session summary the companion UI needs from daemon status.
public struct CompanionSessionStatus: Codable, Equatable, Sendable {
    public var currentTrack: RemoteTrack?
    public var id: String
    public var isActive: Bool
    public var provider: CompanionProvider?
    public var queueDepth: Int
}

/// I mirror the daemon status surface for the companion shell.
public struct CompanionDaemonStatus: Codable, Equatable, Sendable {
    public var features: Features?
    public var isRunning: Bool
    public var providers: [String: CompanionProviderStatus]?
    public var session: CompanionSessionStatus?
    public var spotifyConnected: Bool
    public var version: String

    public struct Features: Codable, Equatable, Sendable {
        public var sse: Bool
    }

    /// I expose the selected provider's public status block without leaking daemon internals into the view layer.
    public func providerStatus(for provider: CompanionProvider) -> CompanionProviderStatus? {
        providers?[provider.rawValue]
    }
}
