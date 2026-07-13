import XCTest
@testable import HarmonMenubar

final class ModelsTests: XCTestCase {
    func testParsesDaemonStatus() throws {
        let json = """
        {
          "isRunning": true,
          "version": "0.2.1",
          "providers": {
            "spotify": { "connected": true, "status": "ready", "auth": "oauth" },
            "youtube": { "connected": false, "status": "missing" }
          },
          "session": {
            "isActive": true,
            "provider": "spotify",
            "queueDepth": 7,
            "currentTrack": { "id": "t1", "name": "Vienna", "artist": "Billy Joel" }
          },
          "unknownFutureField": { "nested": 1 }
        }
        """
        let status = try JSONDecoder().decode(DaemonStatus.self, from: Data(json.utf8))
        XCTAssertEqual(status.isRunning, true)
        XCTAssertEqual(status.providers?["spotify"]?.connected, true)
        XCTAssertEqual(status.session?.currentTrack?.name, "Vienna")
        XCTAssertEqual(status.session?.queueDepth, 7)
    }

    func testParsesSSEDataLine() {
        let line = #"data: {"type":"track.started","payload":{"track":{"id":"t2","name":"Movement","artist":"Hozier"},"provider":"spotify"}}"#
        let event = parseSSELine(line)
        XCTAssertEqual(event?.type, "track.started")
        XCTAssertEqual(event?.payload?.track?.name, "Movement")
        XCTAssertEqual(event?.payload?.provider, "spotify")
    }

    func testIgnoresNonDataLines() {
        XCTAssertNil(parseSSELine(": heartbeat comment"))
        XCTAssertNil(parseSSELine(""))
        XCTAssertNil(parseSSELine("event: message"))
    }
}
