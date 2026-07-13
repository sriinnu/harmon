import AppKit
import Foundation
import Observation

/// Connection + playback state for the menubar, fed by SSE with a polling
/// fallback. All mutation on the main actor.
@MainActor
@Observable
final class MenubarStore {
    // Connection
    var daemonUp = false
    var providers: [String: ProviderStatus] = [:]
    var session: SessionInfo?
    var nowPlaying: TrackInfo?
    var activeProvider: String?
    var lastError: String?
    /// Provider with an OAuth round-trip in flight ("waiting for browser").
    var connecting: String?
    /// User-chosen playback target for smart-play and transport; nil = Auto.
    var preferredProvider: String? {
        didSet { UserDefaults.standard.set(preferredProvider, forKey: "harmon.preferredProvider") }
    }

    // Settings (persisted)
    var endpointString: String {
        didSet { UserDefaults.standard.set(endpointString, forKey: "harmon.endpoint") }
    }

    var apiToken: String {
        didSet { UserDefaults.standard.set(apiToken, forKey: "harmon.apiToken") }
    }

    /// Repo checkout path used to launch harmond from the menubar.
    var repoPath: String {
        didSet { UserDefaults.standard.set(repoPath, forKey: "harmon.repoPath") }
    }

    private var pollTask: Task<Void, Never>?
    private var sseTask: Task<Void, Never>?

    init() {
        let defaults = UserDefaults.standard
        endpointString = defaults.string(forKey: "harmon.endpoint")
            ?? ProcessInfo.processInfo.environment["HARMON_ENDPOINT"]
            ?? "http://127.0.0.1:17373"
        apiToken = defaults.string(forKey: "harmon.apiToken")
            ?? ProcessInfo.processInfo.environment["HARMON_API_TOKEN"]
            ?? ""
        // Best default: launched via `pnpm menubar`, the cwd IS the repo.
        let cwd = FileManager.default.currentDirectoryPath
        let cwdLooksLikeRepo = FileManager.default.fileExists(atPath: cwd + "/apps/harmond/bin/harmond.js")
        repoPath = defaults.string(forKey: "harmon.repoPath")
            ?? ProcessInfo.processInfo.environment["HARMON_REPO"]
            ?? (cwdLooksLikeRepo ? cwd : "")

        preferredProvider = defaults.string(forKey: "harmon.preferredProvider")

        adoptTokenFromEnvFile()
    }

    /// Zero-config auth: when no token is set, read HARMON_API_TOKEN from the
    /// repo's .env — the same file the daemon itself loads.
    func adoptTokenFromEnvFile() {
        guard apiToken.isEmpty, !repoPath.isEmpty else { return }
        let envPath = repoPath + "/.env"
        guard let contents = try? String(contentsOfFile: envPath, encoding: .utf8) else { return }
        for line in contents.split(separator: "\n") {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            guard trimmed.hasPrefix("HARMON_API_TOKEN=") else { continue }
            let value = String(trimmed.dropFirst("HARMON_API_TOKEN=".count))
                .trimmingCharacters(in: CharacterSet(charactersIn: "\"' "))
            if !value.isEmpty {
                apiToken = value
            }
            return
        }
    }

    var client: DaemonClient {
        DaemonClient(
            endpoint: URL(string: endpointString) ?? URL(string: "http://127.0.0.1:17373")!,
            token: apiToken
        )
    }

    var connectedProviders: [String] {
        providers.filter { $0.value.connected == true }.map(\.key).sorted()
    }

    /// Provider used for transport buttons: the user's explicit pick wins,
    /// then the active session, then the provider of the current track,
    /// then the first connected one.
    var transportProvider: String? {
        if let provider = preferredProvider { return provider }
        if session?.isActive == true, let provider = session?.provider { return provider }
        if let provider = nowPlaying?.provider { return provider }
        return connectedProviders.first
    }

    // MARK: Lifecycle

    func start() {
        guard pollTask == nil else { return }
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.refresh()
                try? await Task.sleep(for: .seconds(10))
            }
        }
        sseTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.consumeEvents()
                try? await Task.sleep(for: .seconds(3))
            }
        }
    }

    func stop() {
        pollTask?.cancel()
        sseTask?.cancel()
        pollTask = nil
        sseTask = nil
    }

    /// Re-create the streams after settings change.
    func restart() {
        stop()
        start()
    }

    // MARK: Data flow

    func refresh() async {
        let client = client
        guard await client.health() != nil else {
            daemonUp = false
            nowPlaying = nil
            session = nil
            return
        }
        daemonUp = true

        do {
            guard let status = try await client.status() else { return }
            providers = status.providers ?? [:]
            session = status.session
            if let track = status.session?.currentTrack, status.session?.isActive == true {
                nowPlaying = track
                activeProvider = status.session?.provider
            } else {
                await scanNowPlaying(client: client)
            }
            lastError = nil
        } catch {
            lastError = error.localizedDescription
        }
    }

    private func scanNowPlaying(client: DaemonClient) async {
        for provider in connectedProviders {
            if let track = await client.nowPlaying(provider: provider), track.id != nil {
                nowPlaying = track
                activeProvider = track.provider ?? provider
                return
            }
        }
        nowPlaying = nil
        activeProvider = nil
    }

    private func consumeEvents() async {
        guard daemonUp else { return }
        do {
            for try await event in client.events() {
                apply(event)
            }
        } catch {
            // Connection dropped — the outer loop reconnects after a pause.
        }
    }

    private func apply(_ event: DaemonEvent) {
        switch event.type {
        case "track.started":
            if let track = event.payload?.track {
                nowPlaying = track
                if let provider = event.payload?.provider { activeProvider = provider }
            }
        case "session.started", "session.stopped", "session.nudged",
             "spotify.connected", "spotify.disconnected", "device.changed":
            Task { await refresh() }
        default:
            break
        }
    }

    // MARK: Actions

    private func perform(_ action: @escaping @Sendable (DaemonClient) async throws -> Void) {
        let client = client
        Task {
            do {
                try await action(client)
                lastError = nil
                await refresh()
            } catch {
                lastError = error.localizedDescription
            }
        }
    }

    func play() {
        guard let provider = transportProvider else { return }
        perform { try await $0.play(provider: provider) }
    }

    func pause() {
        guard let provider = transportProvider, provider != "youtube" else { return }
        perform { try await $0.pause(provider: provider) }
    }

    func next() {
        guard let provider = transportProvider else { return }
        perform { try await $0.next(provider: provider) }
    }

    func previous() {
        guard let provider = transportProvider else { return }
        perform { try await $0.previous(provider: provider) }
    }

    func setVolume(_ percent: Int) {
        perform { try await $0.setVolume(percent) }
    }

    func smartPlay(_ query: String) {
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        let provider = preferredProvider
        perform { try await $0.smartPlay(query: trimmed, provider: provider) }
    }

    /// Kick off provider OAuth: fetch the login URL, hand it to the default
    /// browser, then poll eagerly (2s for up to a minute) so the provider
    /// dot flips the moment the daemon's callback lands.
    func connect(provider: String) {
        let client = client
        connecting = provider
        Task {
            do {
                guard let url = try await client.loginURL(provider: provider) else {
                    lastError = "The daemon did not return a login URL — is \(provider.uppercased())_CLIENT_ID configured?"
                    connecting = nil
                    return
                }
                NSWorkspace.shared.open(url)
                lastError = nil

                for _ in 0 ..< 30 {
                    try? await Task.sleep(for: .seconds(2))
                    await refresh()
                    if providers[provider]?.connected == true {
                        break
                    }
                }
            } catch {
                lastError = error.localizedDescription
            }
            connecting = nil
        }
    }

    /// Ask the daemon to shut down gracefully via its own API.
    func stopDaemon() {
        let client = client
        Task {
            do {
                try await client.stopDaemon()
                lastError = nil
                try? await Task.sleep(for: .seconds(1))
                await refresh()
            } catch {
                lastError = error.localizedDescription
            }
        }
    }

    /// Launch harmond from the configured repo checkout. Running with
    /// cwd = repo means the daemon picks up the repo's .env by itself.
    func startDaemon() {
        let repo = repoPath.trimmingCharacters(in: .whitespaces)
        guard !repo.isEmpty else {
            lastError = "Set the repo path in Settings to launch the daemon from here."
            return
        }
        let entry = repo + "/apps/harmond/bin/harmond.js"
        guard FileManager.default.fileExists(atPath: entry) else {
            lastError = "harmond not found at \(entry) — run pnpm build in the repo."
            return
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = ["node", entry]
        process.currentDirectoryURL = URL(fileURLWithPath: repo)
        let log = FileHandle(forWritingAtPath: "/tmp/harmond-menubar.log")
            ?? { FileManager.default.createFile(atPath: "/tmp/harmond-menubar.log", contents: nil)
                 return FileHandle(forWritingAtPath: "/tmp/harmond-menubar.log")! }()
        process.standardOutput = log
        process.standardError = log
        do {
            try process.run()
            lastError = nil
            Task {
                for _ in 0 ..< 10 {
                    try? await Task.sleep(for: .seconds(1))
                    await refresh()
                    if daemonUp { break }
                }
            }
        } catch {
            lastError = "Failed to launch daemon: \(error.localizedDescription)"
        }
    }

    func startSession(mode: String) {
        guard let provider = transportProvider ?? connectedProviders.first else { return }
        perform { try await $0.startSession(mode: mode, provider: provider) }
    }

    func nudge(_ direction: String) {
        perform { try await $0.nudgeSession(direction: direction) }
    }

    func stopSession() {
        perform { try await $0.stopSession() }
    }
}
