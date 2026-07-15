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
    var nowPlaying: TrackInfo? {
        didSet {
            if oldValue?.id != nowPlaying?.id { isPausedOptimistic = false }
            // Anchor for the progress wire: position data ages between polls,
            // so the UI extrapolates from when it arrived.
            if oldValue?.positionMs != nowPlaying?.positionMs || oldValue?.id != nowPlaying?.id {
                nowPlayingReceivedAt = Date()
            }
        }
    }
    /// When the current nowPlaying (and its positionMs) was fetched.
    var nowPlayingReceivedAt = Date()
    /// Providers don't report play/pause state uniformly, so track the last
    /// transport tap — it drives the play⇄pause toggle everywhere. Resets on
    /// track change.
    var isPausedOptimistic = false
    var activeProvider: String?
    var lastError: String?
    /// Provider with an OAuth round-trip in flight ("waiting for browser").
    var connecting: String?
    /// Daemon lifecycle change in flight — drives the power button's spinner.
    var daemonTransition: DaemonTransition?

    enum DaemonTransition { case starting, stopping }
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

    /// Dynamic-Island-style now-playing HUD around the MacBook notch.
    var notchIslandEnabled: Bool {
        didSet { UserDefaults.standard.set(notchIslandEnabled, forKey: "harmon.notchIsland") }
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
        notchIslandEnabled = defaults.object(forKey: "harmon.notchIsland") as? Bool ?? true

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
        isPausedOptimistic = false
        perform { try await $0.play(provider: provider) }
    }

    func pause() {
        guard let provider = transportProvider, provider != "youtube" else { return }
        isPausedOptimistic = true
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

    /// Scrub within the current track (apple remote / spotify only).
    func seek(toMs positionMs: Double) {
        guard let provider = transportProvider, provider != "youtube" else { return }
        // Optimistic: move the wire immediately; the next poll confirms.
        if var track = nowPlaying {
            track.positionMs = positionMs
            nowPlaying = track
        }
        perform { try await $0.seek(provider: provider, positionMs: Int(positionMs)) }
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

    /// Ask the daemon to shut down gracefully via its own API. Shutdown
    /// drains sockets for a few seconds, so poll until it's actually gone —
    /// otherwise the panel keeps saying "running" and the click looks dead.
    func stopDaemon() {
        let client = client
        daemonTransition = .stopping
        Task {
            do {
                try await client.stopDaemon()
                lastError = nil
                for _ in 0 ..< 10 {
                    try? await Task.sleep(for: .seconds(1))
                    await refresh()
                    if !daemonUp { break }
                }
            } catch {
                lastError = error.localizedDescription
            }
            daemonTransition = nil
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

        daemonTransition = .starting
        Task {
            guard let node = await Self.nodePath() else {
                lastError = "Couldn't find node — install Node.js (brew install node) or add it to your login shell's PATH."
                daemonTransition = nil
                return
            }

            let process = Process()
            process.executableURL = URL(fileURLWithPath: node)
            process.arguments = [entry]
            process.currentDirectoryURL = URL(fileURLWithPath: repo)
            if let log = Self.openLog("/tmp/harmond-menubar.log") {
                process.standardOutput = log
                process.standardError = log
            }
            do {
                try process.run()
                lastError = nil
                for _ in 0 ..< 10 {
                    try? await Task.sleep(for: .seconds(1))
                    await refresh()
                    if daemonUp { break }
                }
            } catch {
                lastError = "Failed to launch daemon: \(error.localizedDescription)"
            }
            daemonTransition = nil
        }
    }

    /// Where's node? A Finder-launched app gets a bare PATH (no homebrew, no
    /// nvm), so `/usr/bin/env node` fails from /Applications. Check the usual
    /// suspects first, then ask a login shell — it has the user's real PATH.
    private static var cachedNodePath: String?

    private static func nodePath() async -> String? {
        if let cached = cachedNodePath { return cached }
        let resolved = await Task.detached(priority: .userInitiated) { () -> String? in
            for candidate in ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"]
            where FileManager.default.isExecutableFile(atPath: candidate) {
                return candidate
            }
            let shell = Process()
            shell.executableURL = URL(fileURLWithPath: "/bin/zsh")
            shell.arguments = ["-lc", "command -v node"]
            let pipe = Pipe()
            shell.standardOutput = pipe
            shell.standardError = FileHandle.nullDevice
            guard (try? shell.run()) != nil else { return nil }
            shell.waitUntilExit()
            let output = String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)?
                .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return output.isEmpty ? nil : output
        }.value
        cachedNodePath = resolved
        return resolved
    }

    private static func openLog(_ path: String) -> FileHandle? {
        if let handle = FileHandle(forWritingAtPath: path) {
            handle.seekToEndOfFile()
            return handle
        }
        FileManager.default.createFile(atPath: path, contents: nil)
        return FileHandle(forWritingAtPath: path)
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
