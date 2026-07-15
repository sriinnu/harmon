import Foundation

/// Thin async client for the harmond HTTP API.
struct DaemonClient: Sendable {
    var endpoint: URL
    var token: String?

    init(endpoint: URL, token: String?) {
        self.endpoint = endpoint
        self.token = (token?.isEmpty == false) ? token : nil
    }

    enum ClientError: Error, LocalizedError {
        case unauthorized
        case http(Int, String)

        var errorDescription: String? {
            switch self {
            case .unauthorized:
                return "Unauthorized — set the API token in Settings."
            case let .http(status, body):
                return "Daemon error \(status): \(body)"
            }
        }
    }

    // MARK: Requests

    private func request(_ path: String, method: String = "GET", body: [String: Any]? = nil) async throws -> Data {
        var url = endpoint
        url.append(path: path)
        var request = URLRequest(url: url, timeoutInterval: 8)
        request.httpMethod = method
        if let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status == 401 { throw ClientError.unauthorized }
        guard (200 ..< 300).contains(status) else {
            let bodyText = String(data: data.prefix(300), encoding: .utf8) ?? ""
            throw ClientError.http(status, bodyText)
        }
        return data
    }

    private func decode<T: Decodable>(_ type: T.Type, from data: Data) -> T? {
        try? JSONDecoder().decode(type, from: data)
    }

    // MARK: API surface

    func health() async -> DaemonHealth? {
        guard let data = try? await request("/health") else { return nil }
        return decode(DaemonHealth.self, from: data)
    }

    func status() async throws -> DaemonStatus? {
        decode(DaemonStatus.self, from: try await request("/v1/status"))
    }

    func nowPlaying(provider: String) async -> TrackInfo? {
        guard let data = try? await request("/v1/\(provider)/now-playing") else { return nil }
        return decode(TrackInfo.self, from: data)
    }

    func play(provider: String) async throws {
        _ = try await request("/v1/\(provider)/play", method: "POST", body: [:])
    }

    func pause(provider: String) async throws {
        _ = try await request("/v1/\(provider)/pause", method: "POST")
    }

    func next(provider: String) async throws {
        _ = try await request("/v1/\(provider)/next", method: "POST")
    }

    func previous(provider: String) async throws {
        _ = try await request("/v1/\(provider)/prev", method: "POST")
    }

    func setVolume(_ percent: Int) async throws {
        _ = try await request("/v1/spotify/volume", method: "POST", body: ["volumePercent": percent])
    }

    func seek(provider: String, positionMs: Int) async throws {
        _ = try await request("/v1/\(provider)/seek", method: "POST", body: ["positionMs": positionMs])
    }

    func smartPlay(query: String, provider: String? = nil) async throws {
        var body: [String: Any] = ["query": query]
        if let provider {
            body["provider"] = provider
        }
        _ = try await request("/v1/smart/play", method: "POST", body: body)
    }

    func stopDaemon() async throws {
        _ = try await request("/v1/daemon/stop", method: "POST")
    }

    func loginURL(provider: String) async throws -> URL? {
        let data = try await request("/v1/auth/\(provider)/login", method: "POST")
        guard let login = decode(LoginResponse.self, from: data), let raw = login.url else { return nil }
        return URL(string: raw)
    }

    // MARK: Sessions (Command envelope; the protocol already knows 'menubar')

    private func command(_ type: String, payload: [String: Any]) async throws {
        let envelope: [String: Any] = [
            "id": "c_\(UUID().uuidString.lowercased())",
            "ts": Int(Date().timeIntervalSince1970 * 1000),
            "source": ["kind": "menubar", "device": "macos"],
            "type": type,
            "payload": payload,
        ]
        _ = try await request("/v1/command", method: "POST", body: envelope)
    }

    func startSession(mode: String, provider: String) async throws {
        try await command("session.start", payload: [
            "policy": ["version": 1, "mode": mode, "provider": provider],
        ])
    }

    func nudgeSession(direction: String) async throws {
        try await command("session.nudge", payload: ["direction": direction])
    }

    func stopSession() async throws {
        try await command("session.stop", payload: [:])
    }

    // MARK: SSE

    /// Stream daemon events. Yields until the connection drops or the task is
    /// cancelled; the caller owns reconnect policy.
    func events() -> AsyncThrowingStream<DaemonEvent, Error> {
        var url = endpoint
        url.append(path: "/v1/events")
        var mutableRequest = URLRequest(url: url)
        mutableRequest.timeoutInterval = 3600
        if let token {
            mutableRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        let request = mutableRequest

        return AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    let (bytes, response) = try await URLSession.shared.bytes(for: request)
                    guard (response as? HTTPURLResponse)?.statusCode == 200 else {
                        continuation.finish(throwing: ClientError.http((response as? HTTPURLResponse)?.statusCode ?? 0, "SSE connect failed"))
                        return
                    }
                    for try await line in bytes.lines {
                        if let event = parseSSELine(line) {
                            continuation.yield(event)
                        }
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}
