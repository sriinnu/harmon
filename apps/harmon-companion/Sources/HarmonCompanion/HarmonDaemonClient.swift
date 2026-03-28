import Foundation

/// I define the multi-provider daemon surface the companion app uses.
public protocol HarmonDaemonClientProtocol: Sendable {
    func fetchLibraryTracks(provider: CompanionProvider, limit: Int?) async throws -> [CompanionMediaItem]
    func fetchNowPlaying(provider: CompanionProvider) async throws -> RemoteTrack?
    func fetchPlaylistTracks(provider: CompanionProvider, playlistID: String, limit: Int?) async throws -> [CompanionMediaItem]
    func fetchPlaylists(provider: CompanionProvider, limit: Int?) async throws -> [CompanionMediaItem]
    func fetchStatus() async throws -> CompanionDaemonStatus
    func next(provider: CompanionProvider) async throws
    func pause(provider: CompanionProvider) async throws
    func play(provider: CompanionProvider, target: String?) async throws
    func previous(provider: CompanionProvider) async throws
    func search(provider: CompanionProvider, query: String, kind: CompanionSearchKind, limit: Int?) async throws -> [CompanionMediaItem]
}

/// I surface route-level daemon failures for the companion UI.
public enum HarmonDaemonClientError: Error, LocalizedError, Sendable {
    case invalidBaseURL(String)
    case invalidResponse
    case requestFailed(Int, String)

    public var errorDescription: String? {
        switch self {
        case .invalidBaseURL(let path):
            return "I could not build a daemon URL for path \(path)."
        case .invalidResponse:
            return "I received an invalid response from harmond."
        case .requestFailed(let statusCode, let message):
            return "harmond rejected the companion request with status \(statusCode): \(message)"
        }
    }
}

/// I provide the shared provider-aware daemon client for the mobile companion and SwiftUI shell.
public struct HarmonDaemonClient: HarmonDaemonClientProtocol, Sendable {
    private let configuration: HarmonDaemonConfiguration
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder
    private let session: URLSessioning

    public init(
        configuration: HarmonDaemonConfiguration,
        session: URLSessioning = URLSession.shared
    ) {
        self.configuration = configuration
        self.decoder = JSONDecoder()
        self.encoder = JSONEncoder()
        self.session = session
    }

    public func fetchStatus() async throws -> CompanionDaemonStatus {
        try await requestJSON(path: "/v1/status", responseType: CompanionDaemonStatus.self)
    }

    public func search(
        provider: CompanionProvider,
        query: String,
        kind: CompanionSearchKind,
        limit: Int? = nil
    ) async throws -> [CompanionMediaItem] {
        let path = "/v1/\(provider.rawValue)/search"
        let queryItems = [
            "q": query,
            "type": providerSearchType(provider: provider, kind: kind),
            "limit": limit.map(String.init),
        ]
        let payload = try await requestJSONObject(path: path, query: queryItems)
        return normalizeMediaItems(provider: provider, kind: kind, payload: payload)
    }

    public func fetchLibraryTracks(provider: CompanionProvider, limit: Int? = nil) async throws -> [CompanionMediaItem] {
        let path = provider == .spotify ? "/v1/spotify/library/tracks"
            : provider == .apple ? "/v1/apple/library/songs"
            : "/v1/youtube/library/tracks"
        let payload = try await requestJSONObject(path: path, query: ["limit": limit.map(String.init)])
        return normalizeMediaItems(provider: provider, kind: .song, payload: payload)
    }

    public func fetchPlaylists(provider: CompanionProvider, limit: Int? = nil) async throws -> [CompanionMediaItem] {
        let path = provider == .spotify ? "/v1/spotify/playlists"
            : provider == .apple ? "/v1/apple/library/playlists"
            : "/v1/youtube/playlists"
        let payload = try await requestJSONObject(path: path, query: ["limit": limit.map(String.init)])
        return normalizeMediaItems(provider: provider, kind: .playlist, payload: payload)
    }

    public func fetchPlaylistTracks(
        provider: CompanionProvider,
        playlistID: String,
        limit: Int? = nil
    ) async throws -> [CompanionMediaItem] {
        let encoded = playlistID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? playlistID
        let path = provider == .spotify ? "/v1/spotify/playlists/\(encoded)/tracks"
            : provider == .apple ? "/v1/apple/playlists/\(encoded)/tracks"
            : "/v1/youtube/playlists/\(encoded)/tracks"
        let payload = try await requestJSONObject(path: path, query: ["limit": limit.map(String.init)])
        return normalizeMediaItems(provider: provider, kind: .song, payload: payload)
    }

    public func fetchNowPlaying(provider: CompanionProvider) async throws -> RemoteTrack? {
        let path = "/v1/\(provider.rawValue)/now-playing"
        return try await requestJSON(path: path, responseType: Optional<RemoteTrack>.self)
    }

    public func play(provider: CompanionProvider, target: String?) async throws {
        let path = "/v1/\(provider.rawValue)/play"
        let body: [String: String]
        switch provider {
        case .spotify:
            body = buildSpotifyPlayBody(target: target)
        case .apple:
            body = target.map { ["url": $0] } ?? [:]
        case .youtube:
            body = target.map { ["uri": $0] } ?? [:]
        }
        _ = try await requestJSONObject(path: path, method: "POST", body: body)
    }

    public func pause(provider: CompanionProvider) async throws {
        _ = try await requestJSONObject(path: "/v1/\(provider.rawValue)/pause", method: "POST")
    }

    public func next(provider: CompanionProvider) async throws {
        _ = try await requestJSONObject(path: "/v1/\(provider.rawValue)/next", method: "POST")
    }

    public func previous(provider: CompanionProvider) async throws {
        _ = try await requestJSONObject(path: "/v1/\(provider.rawValue)/prev", method: "POST")
    }

    private func providerSearchType(provider: CompanionProvider, kind: CompanionSearchKind) -> String {
        switch provider {
        case .spotify:
            return kind == .song ? "track" : kind.rawValue
        case .apple, .youtube:
            return kind == .song ? "songs" : "\(kind.rawValue)s"
        }
    }

    private func buildSpotifyPlayBody(target: String?) -> [String: String] {
        guard let target else {
            return [:]
        }
        if target.hasPrefix("spotify:album:") || target.hasPrefix("spotify:artist:") || target.hasPrefix("spotify:playlist:") {
            return ["contextUri": target]
        }
        return ["uri": target]
    }

    private func requestJSONObject(
        path: String,
        method: String = "GET",
        query: [String: String?] = [:],
        body: Encodable? = nil
    ) async throws -> Any {
        let data = try await requestData(path: path, method: method, query: query, body: body)
        return try JSONSerialization.jsonObject(with: data)
    }

    private func requestJSON<ResponseBody: Decodable>(
        path: String,
        method: String = "GET",
        query: [String: String?] = [:],
        body: Encodable? = nil,
        responseType: ResponseBody.Type
    ) async throws -> ResponseBody {
        let data = try await requestData(path: path, method: method, query: query, body: body)
        return try decoder.decode(responseType, from: data)
    }

    private func requestData(
        path: String,
        method: String,
        query: [String: String?],
        body: Encodable?
    ) async throws -> Data {
        guard var urlComponents = URLComponents(url: configuration.baseURL, resolvingAgainstBaseURL: false) else {
            throw HarmonDaemonClientError.invalidBaseURL(path)
        }

        urlComponents.path = normalizedDaemonPath(basePath: urlComponents.path, path: path)
        let queryItems = query.compactMap { key, value in
            value.map { URLQueryItem(name: key, value: $0) }
        }
        urlComponents.queryItems = queryItems.isEmpty ? nil : queryItems

        guard let url = urlComponents.url else {
            throw HarmonDaemonClientError.invalidBaseURL(path)
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = configuration.requestTimeoutSeconds
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token = configuration.apiToken, !token.isEmpty {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            request.httpBody = try encoder.encode(AnyEncodable(body))
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw HarmonDaemonClientError.invalidResponse
        }
        guard (200..<300).contains(httpResponse.statusCode) else {
            let message = String(data: data, encoding: .utf8) ?? "Unknown daemon error"
            throw HarmonDaemonClientError.requestFailed(httpResponse.statusCode, message)
        }
        return data
    }

    /// I preserve any configured daemon base-path prefix instead of resetting
    /// requests back to the origin root.
    private func normalizedDaemonPath(basePath: String, path: String) -> String {
        let prefix = basePath.split(separator: "/").map(String.init).filter { !$0.isEmpty }
        let suffix = path.split(separator: "/").map(String.init).filter { !$0.isEmpty }
        return "/" + (prefix + suffix).joined(separator: "/")
    }
}

private struct AnyEncodable: Encodable {
    private let encodeBody: (Encoder) throws -> Void

    init(_ value: Encodable) {
        self.encodeBody = value.encode
    }

    func encode(to encoder: Encoder) throws {
        try encodeBody(encoder)
    }
}
