import Foundation
import Testing
@testable import HarmonCompanion

struct AppleRemoteDaemonClientTests {
    @Test
    func connectUsesRemoteBearerToken() async throws {
        let session = RecordingSession()
        session.responses = [
            .json(
                statusCode: 200,
                body: """
                {"status":{"companion":{"connectedAt":"2026-03-28T10:00:00Z","deviceId":"iphone-1","lastSeenAt":"2026-03-28T10:00:00Z"},"connected":true,"currentTrack":null,"pendingCommands":0,"playbackState":"stopped"}}
                """
            )
        ]

        let client = AppleRemoteDaemonClient(
            configuration: CompanionConfiguration(
                daemonBaseURL: URL(string: "http://127.0.0.1:9797")!,
                remoteToken: "remote-token",
                deviceID: "iphone-1"
            ),
            session: session
        )

        let status = try await client.connect()

        #expect(status.connected)
        #expect(session.requests.count == 1)
        #expect(session.requests[0].value(forHTTPHeaderField: "Authorization") == "Bearer remote-token")
        #expect(session.requests[0].url?.path == "/v1/apple/remote/connect")
    }

    @Test
    func sendStateEncodesAckAndTrack() async throws {
        let session = RecordingSession()
        session.responses = [
            .json(
                statusCode: 200,
                body: """
                {"status":{"companion":{"connectedAt":"2026-03-28T10:00:00Z","deviceId":"iphone-1","lastSeenAt":"2026-03-28T10:00:00Z"},"connected":true,"currentTrack":{"album":"","artist":"Apple Music","durationMs":0,"id":"apple-track-1","name":"Track 1","provider":"apple","uri":"apple:song:apple-track-1"},"pendingCommands":0,"playbackState":"playing"}}
                """
            )
        ]

        let client = AppleRemoteDaemonClient(
            configuration: CompanionConfiguration(
                daemonBaseURL: URL(string: "http://127.0.0.1:9797")!,
                remoteToken: "remote-token",
                deviceID: "iphone-1"
            ),
            session: session
        )

        _ = try await client.sendState(
            CompanionStateUpdate(
                ackCommandID: "apple_remote_1",
                snapshot: CompanionPlaybackSnapshot(
                    currentTrack: RemoteTrack(
                        album: "",
                        artist: "Apple Music",
                        durationMs: 0,
                        id: "apple-track-1",
                        name: "Track 1",
                        provider: "apple",
                        uri: "apple:song:apple-track-1"
                    ),
                    playbackState: .playing
                )
            )
        )

        let body = try #require(session.requests[0].httpBody)
        let payload = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        #expect(payload?["ackCommandId"] as? String == "apple_remote_1")
        #expect(payload?["deviceId"] as? String == "iphone-1")
    }

    @Test
    func failingDaemonResponseSurfacesReadableError() async {
        let session = RecordingSession()
        session.responses = [
            .json(statusCode: 401, body: #"{"error":"Unauthorized"}"#)
        ]

        let client = AppleRemoteDaemonClient(
            configuration: CompanionConfiguration(
                daemonBaseURL: URL(string: "http://127.0.0.1:9797")!,
                remoteToken: "bad-token",
                deviceID: "iphone-1"
            ),
            session: session
        )

        await #expect(throws: AppleRemoteDaemonClientError.self) {
            _ = try await client.fetchStatus()
        }
    }

    @Test
    func preservesDaemonBasePathPrefixes() async throws {
        let session = RecordingSession()
        session.responses = [
            .json(
                statusCode: 200,
                body: """
                {"companion":{"connectedAt":"2026-03-28T10:00:00Z","deviceId":"iphone-1","lastSeenAt":"2026-03-28T10:00:00Z"},"connected":true,"currentTrack":null,"pendingCommands":0,"playbackState":"stopped"}
                """
            )
        ]

        let client = AppleRemoteDaemonClient(
            configuration: CompanionConfiguration(
                daemonBaseURL: URL(string: "https://example.com/harmon")!,
                remoteToken: "remote-token",
                deviceID: "iphone-1"
            ),
            session: session
        )

        _ = try await client.fetchStatus()
        #expect(session.requests.first?.url?.absoluteString == "https://example.com/harmon/v1/apple/remote/status")
    }
}

private final class RecordingSession: URLSessioning, @unchecked Sendable {
    struct StubResponse {
        let body: Data
        let statusCode: Int

        static func json(statusCode: Int, body: String) -> StubResponse {
            StubResponse(body: Data(body.utf8), statusCode: statusCode)
        }
    }

    var requests: [URLRequest] = []
    var responses: [StubResponse] = []

    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        requests.append(request)
        let response = responses.removeFirst()
        let url = try #require(request.url)
        let httpResponse = HTTPURLResponse(url: url, statusCode: response.statusCode, httpVersion: nil, headerFields: nil)!
        return (response.body, httpResponse)
    }
}
