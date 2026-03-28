import Foundation

/// I abstract the daemon transport so the service can stay testable.
public protocol AppleRemoteDaemonClientProtocol: Sendable {
    func acknowledgeCommand(id: String) async throws
    func connect() async throws -> AppleRemoteBridgeStatus
    func fetchCommands() async throws -> [AppleRemoteCommand]
    func fetchStatus() async throws -> AppleRemoteBridgeStatus
    func sendState(_ update: CompanionStateUpdate) async throws -> AppleRemoteBridgeStatus
}

/// I surface daemon transport failures with route-level context.
public enum AppleRemoteDaemonClientError: Error, LocalizedError, Sendable {
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

/// I provide the authenticated daemon client for the Apple remote companion.
public struct AppleRemoteDaemonClient: AppleRemoteDaemonClientProtocol, Sendable {
    private let configuration: CompanionConfiguration
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder
    private let session: URLSessioning

    public init(
        configuration: CompanionConfiguration,
        session: URLSessioning = URLSession.shared
    ) {
        self.configuration = configuration
        self.decoder = JSONDecoder()
        self.encoder = JSONEncoder()
        self.session = session
    }

    public func connect() async throws -> AppleRemoteBridgeStatus {
        try await send(
            method: "POST",
            path: "/v1/apple/remote/connect",
            body: CompanionRegistrationBody(
                appVersion: configuration.appVersion,
                deviceID: configuration.deviceID,
                name: configuration.deviceName,
                platform: configuration.platform
            ),
            responseType: StatusEnvelope.self
        ).status
    }

    public func fetchStatus() async throws -> AppleRemoteBridgeStatus {
        try await send(
            method: "GET",
            path: "/v1/apple/remote/status",
            body: Optional<String>.none,
            responseType: AppleRemoteBridgeStatus.self
        )
    }

    public func fetchCommands() async throws -> [AppleRemoteCommand] {
        try await send(
            method: "GET",
            path: "/v1/apple/remote/commands?deviceId=\(configuration.deviceID.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? configuration.deviceID)",
            body: Optional<String>.none,
            responseType: CommandsEnvelope.self
        ).commands
    }

    public func acknowledgeCommand(id: String) async throws {
        _ = try await send(
            method: "POST",
            path: "/v1/apple/remote/commands/\(id)/ack",
            body: DeviceBody(deviceID: configuration.deviceID),
            responseType: SuccessEnvelope.self
        )
    }

    public func sendState(_ update: CompanionStateUpdate) async throws -> AppleRemoteBridgeStatus {
        try await send(
            method: "POST",
            path: "/v1/apple/remote/state",
            body: StateBody(
                ackCommandID: update.ackCommandID,
                currentTrack: update.snapshot.currentTrack,
                deviceID: configuration.deviceID,
                playbackState: update.snapshot.playbackState
            ),
            responseType: StatusEnvelope.self
        ).status
    }

    /// I send one typed request to harmond and decode the typed response body.
    private func send<RequestBody: Encodable, ResponseBody: Decodable>(
        method: String,
        path: String,
        body: RequestBody,
        responseType: ResponseBody.Type
    ) async throws -> ResponseBody {
        guard let url = buildURL(path: path) else {
            throw AppleRemoteDaemonClientError.invalidBaseURL(path)
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = configuration.requestTimeoutSeconds
        request.setValue("Bearer \(configuration.remoteToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if !(body is Optional<String>) {
            request.httpBody = try encoder.encode(body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw AppleRemoteDaemonClientError.invalidResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            let daemonError = try? decoder.decode(DaemonErrorEnvelope.self, from: data)
            throw AppleRemoteDaemonClientError.requestFailed(httpResponse.statusCode, daemonError?.error ?? "Unknown daemon error")
        }

        return try decoder.decode(ResponseBody.self, from: data)
    }

    /// I preserve daemon base-path prefixes for remote companion routes too.
    private func buildURL(path: String) -> URL? {
        guard var components = URLComponents(url: configuration.daemonBaseURL, resolvingAgainstBaseURL: false) else {
            return nil
        }

        let pathAndQuery = path.split(separator: "?", maxSplits: 1).map(String.init)
        components.path = normalizedDaemonPath(basePath: components.path, path: pathAndQuery[0])
        if pathAndQuery.count == 2 {
            components.percentEncodedQuery = pathAndQuery[1]
        }

        return components.url
    }

    private func normalizedDaemonPath(basePath: String, path: String) -> String {
        let prefix = basePath.split(separator: "/").map(String.init).filter { !$0.isEmpty }
        let suffix = path.split(separator: "/").map(String.init).filter { !$0.isEmpty }
        return "/" + (prefix + suffix).joined(separator: "/")
    }
}

/// I make URLSession injectable without wrapping it in a heavy abstraction.
public protocol URLSessioning: Sendable {
    func data(for request: URLRequest) async throws -> (Data, URLResponse)
}

extension URLSession: URLSessioning {}

private struct CompanionRegistrationBody: Encodable {
    let appVersion: String?
    let deviceID: String
    let name: String?
    let platform: String

    enum CodingKeys: String, CodingKey {
        case appVersion
        case deviceID = "deviceId"
        case name
        case platform
    }
}

private struct DeviceBody: Encodable {
    let deviceID: String

    enum CodingKeys: String, CodingKey {
        case deviceID = "deviceId"
    }
}

private struct StateBody: Encodable {
    let ackCommandID: String?
    let currentTrack: RemoteTrack?
    let deviceID: String
    let playbackState: RemotePlaybackState

    enum CodingKeys: String, CodingKey {
        case ackCommandID = "ackCommandId"
        case currentTrack
        case deviceID = "deviceId"
        case playbackState
    }
}

private struct CommandsEnvelope: Decodable {
    let commands: [AppleRemoteCommand]
}

private struct StatusEnvelope: Decodable {
    let status: AppleRemoteBridgeStatus
}

private struct SuccessEnvelope: Decodable {
    let success: Bool
}

private struct DaemonErrorEnvelope: Decodable {
    let error: String
}
