import Foundation

// Lenient Codable mirrors of the daemon's JSON — every field optional so a
// daemon upgrade never crashes the menubar.

struct DaemonHealth: Decodable {
    var status: String?
    var version: String?
}

struct ProviderStatus: Decodable {
    var connected: Bool?
    var status: String?
    var auth: String?
}

struct TrackInfo: Decodable, Equatable {
    var id: String?
    var name: String?
    var artist: String?
    var album: String?
    var provider: String?
    var imageUrl: String?
}

struct SessionInfo: Decodable {
    var isActive: Bool?
    var provider: String?
    var currentTrack: TrackInfo?
    var queueDepth: Int?
}

struct DaemonStatus: Decodable {
    var isRunning: Bool?
    var version: String?
    var providers: [String: ProviderStatus]?
    var session: SessionInfo?
}

struct LoginResponse: Decodable {
    var url: String?
}

struct DaemonEvent: Decodable {
    var type: String?
    var payload: EventPayload?

    struct EventPayload: Decodable {
        var track: TrackInfo?
        var provider: String?
        var sessionId: String?
    }
}

/// Parse one SSE frame body ("data: {...}") into a DaemonEvent.
func parseSSELine(_ line: String) -> DaemonEvent? {
    guard line.hasPrefix("data:") else { return nil }
    let json = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
    guard let data = json.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(DaemonEvent.self, from: data)
}
