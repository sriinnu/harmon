import Foundation
import Testing
@testable import HarmonCompanion

struct HarmonDaemonClientTests {
    @Test
    func fetchStatusDecodesProviderBlocks() async throws {
        let session = RecordingSession()
        session.responses = [
            .json(
                statusCode: 200,
                body: """
                {"isRunning":true,"version":"0.1.0","spotifyConnected":true,"providers":{"spotify":{"connected":true,"status":"ready","playbackMode":"native"}}}
                """
            )
        ]

        let client = HarmonDaemonClient(
            configuration: HarmonDaemonConfiguration(baseURL: URL(string: "http://127.0.0.1:17373")!, apiToken: "daemon-token"),
            session: session
        )

        let status = try await client.fetchStatus()

        #expect(status.isRunning)
        #expect(status.providerStatus(for: .spotify)?.playbackMode == "native")
        #expect(session.requests.first?.value(forHTTPHeaderField: "Authorization") == "Bearer daemon-token")
    }

    @Test
    func searchNormalizesSpotifyTrackPayloads() async throws {
        let session = RecordingSession()
        session.responses = [
            .json(
                statusCode: 200,
                body: """
                {"tracks":{"items":[{"id":"track-1","name":"Focus","artist":"Alpha","album":"Flow","durationMs":123000,"uri":"spotify:track:track-1"}]}}
                """
            )
        ]

        let client = HarmonDaemonClient(
            configuration: HarmonDaemonConfiguration(baseURL: URL(string: "http://127.0.0.1:17373")!),
            session: session
        )

        let items = try await client.search(provider: .spotify, query: "focus", kind: .song, limit: 10)

        #expect(items.count == 1)
        #expect(items[0].provider == .spotify)
        #expect(items[0].daemonPlaybackTarget == "spotify:track:track-1")
    }

    @Test
    func playUsesProviderSpecificBodies() async throws {
        let session = RecordingSession()
        session.responses = [
            .json(statusCode: 200, body: #"{"success":true}"#),
            .json(statusCode: 200, body: #"{"success":true}"#),
        ]

        let client = HarmonDaemonClient(
            configuration: HarmonDaemonConfiguration(baseURL: URL(string: "http://127.0.0.1:17373")!),
            session: session
        )

        try await client.play(provider: .spotify, target: "spotify:playlist:abc")
        try await client.play(provider: .youtube, target: "youtube:video:xyz")

        let firstBody = try #require(session.requests[0].httpBody)
        let secondBody = try #require(session.requests[1].httpBody)
        let firstPayload = try JSONSerialization.jsonObject(with: firstBody) as? [String: Any]
        let secondPayload = try JSONSerialization.jsonObject(with: secondBody) as? [String: Any]

        #expect(firstPayload?["contextUri"] as? String == "spotify:playlist:abc")
        #expect(secondPayload?["uri"] as? String == "youtube:video:xyz")
    }

    @Test
    func preservesDaemonBasePathPrefixes() async throws {
        let session = RecordingSession()
        session.responses = [
            .json(statusCode: 200, body: #"{"isRunning":true,"version":"0.1.0","spotifyConnected":false}"#)
        ]

        let client = HarmonDaemonClient(
            configuration: HarmonDaemonConfiguration(baseURL: URL(string: "https://example.com/harmon")!),
            session: session
        )

        _ = try await client.fetchStatus()
        #expect(session.requests.first?.url?.absoluteString == "https://example.com/harmon/v1/status")
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
