import Foundation
import SwiftUI

/// I provide the main provider-aware state container for the mobile companion shell.
@MainActor
public final class HarmonCompanionStore: ObservableObject {
    @Published public var isLoading = false
    @Published public var lastError: String?
    @Published public var libraryTracks: [CompanionMediaItem] = []
    @Published public var notice: String?
    @Published public var nowPlaying: RemoteTrack?
    @Published public var playlistTracks: [CompanionMediaItem] = []
    @Published public var playlists: [CompanionMediaItem] = []
    @Published public var searchKind: CompanionSearchKind = .song
    @Published public var searchQuery = ""
    @Published public var searchResults: [CompanionMediaItem] = []
    @Published public var selectedPlaylist: CompanionMediaItem?
    @Published public var selectedProvider: CompanionProvider = .spotify
    @Published public private(set) var status: CompanionDaemonStatus?

    private let appleRemoteStore: AppleRemoteCompanionStore?
    private let daemonClient: HarmonDaemonClientProtocol
    private let launcher: CompanionPlaybackLaunching?
    private var providerScopeVersion = 0

    public init(
        daemonClient: HarmonDaemonClientProtocol,
        launcher: CompanionPlaybackLaunching? = nil,
        appleRemoteStore: AppleRemoteCompanionStore? = nil
    ) {
        self.appleRemoteStore = appleRemoteStore
        self.daemonClient = daemonClient
        self.launcher = launcher
    }

    /// I expose the selected provider status block without leaking daemon JSON into the view.
    public var selectedProviderStatus: CompanionProviderStatus? {
        status?.providerStatus(for: selectedProvider)
    }

    public func start() async {
        appleRemoteStore?.start()
        await refreshStatus()
        await loadNowPlaying()
    }

    public func stop() {
        appleRemoteStore?.stop()
    }

    public func refreshStatus() async {
        await runTask { [self] in
            self.status = try await self.daemonClient.fetchStatus()
        }
    }

    public func loadNowPlaying() async {
        let scope = currentProviderScope()
        guard selectedProviderStatus?.capabilities?["playback"] == true else {
            nowPlaying = nil
            return
        }

        await runTask(scope: scope) { [self] in
            let track = try await self.daemonClient.fetchNowPlaying(provider: scope.provider)
            guard self.isCurrentProviderScope(scope) else {
                return
            }
            self.nowPlaying = track
        }
    }

    /// I reset provider-scoped state and pull fresh status when the user switches providers.
    public func handleProviderChange() async {
        providerScopeVersion += 1
        selectedPlaylist = nil
        searchResults = []
        libraryTracks = []
        playlists = []
        playlistTracks = []
        nowPlaying = nil
        lastError = nil
        notice = nil
        await refreshStatus()
        await loadNowPlaying()
    }

    public func search() async {
        let scope = currentProviderScope()
        guard !searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            searchResults = []
            return
        }

        await runTask(scope: scope) { [self] in
            let results = try await self.daemonClient.search(
                provider: scope.provider,
                query: self.searchQuery,
                kind: self.searchKind,
                limit: 12
            )
            guard self.isCurrentProviderScope(scope) else {
                return
            }
            self.searchResults = results
        }
    }

    public func loadLibrary() async {
        let scope = currentProviderScope()
        await runTask(scope: scope) { [self] in
            let items = try await self.daemonClient.fetchLibraryTracks(provider: scope.provider, limit: 25)
            guard self.isCurrentProviderScope(scope) else {
                return
            }
            self.libraryTracks = items
        }
    }

    public func loadPlaylists() async {
        let scope = currentProviderScope()
        await runTask(scope: scope) { [self] in
            let items = try await self.daemonClient.fetchPlaylists(provider: scope.provider, limit: 25)
            guard self.isCurrentProviderScope(scope) else {
                return
            }
            self.playlists = items
        }
    }

    public func loadPlaylistTracks(_ playlist: CompanionMediaItem) async {
        let scope = currentProviderScope()
        selectedPlaylist = playlist
        await runTask(scope: scope) { [self] in
            let items = try await self.daemonClient.fetchPlaylistTracks(
                provider: playlist.provider,
                playlistID: playlist.id,
                limit: 50
            )
            guard self.isCurrentProviderScope(scope) else {
                return
            }
            self.playlistTracks = items
        }
    }

    /// I play on the current device only when the host launcher can do that
    /// truthfully for the selected provider.
    public func playOnDevice(_ item: CompanionMediaItem) async {
        await runTask { [self] in
            let availability = self.localPlaybackAvailability(for: item)
            guard availability.enabled, let launcher = self.launcher else {
                throw HarmonCompanionStoreError.unavailableLocalTarget(
                    availability.reason ?? CompanionPlaybackLauncherError.missingPlayableReference.localizedDescription
                )
            }
            try await launcher.play(item)
            self.notice = availability.mode == .directPlayback
                ? "I started playback on this device."
                : "I opened this item on this device."
        }
    }

    /// I tell the daemon to play on its configured provider runtime.
    public func playViaDaemon(_ item: CompanionMediaItem?) async {
        await runTask { [self] in
            if let item, !self.canPlayViaDaemon(item) {
                throw HarmonCompanionStoreError.unsupportedDaemonTarget(
                    self.daemonPlayReason(for: item) ?? "I cannot play that item on the daemon in this build."
                )
            }
            try await self.daemonClient.play(provider: self.selectedProvider, target: item?.daemonPlaybackTarget)
            self.nowPlaying = try await self.daemonClient.fetchNowPlaying(provider: self.selectedProvider)
            self.notice = "I handed playback to the daemon runtime."
        }
    }

    public func pauseViaDaemon() async {
        await runTask { [self] in
            try await self.daemonClient.pause(provider: self.selectedProvider)
            if var snapshot = self.nowPlaying {
                snapshot.playbackTruth = snapshot.playbackTruth ?? "daemon-managed"
                self.nowPlaying = snapshot
            }
            self.notice = "I asked the daemon to pause playback."
        }
    }

    public func nextViaDaemon() async {
        await runTask { [self] in
            try await self.daemonClient.next(provider: self.selectedProvider)
            self.nowPlaying = try await self.daemonClient.fetchNowPlaying(provider: self.selectedProvider)
            self.notice = "I advanced to the next item on the daemon."
        }
    }

    public func previousViaDaemon() async {
        await runTask { [self] in
            try await self.daemonClient.previous(provider: self.selectedProvider)
            self.nowPlaying = try await self.daemonClient.fetchNowPlaying(provider: self.selectedProvider)
            self.notice = "I returned to the previous item on the daemon."
        }
    }

    /// I tell the view whether one transport control is truthful for the selected provider.
    public func canUseTransport(_ action: String) -> Bool {
        guard !isLoading else {
            return false
        }
        return selectedProviderStatus?.capabilities?[action] == true
    }

    /// I keep row-level daemon play affordances honest.
    public func canPlayViaDaemon(_ item: CompanionMediaItem) -> Bool {
        daemonPlayReason(for: item) == nil
    }

    /// I keep row-level local play affordances honest too.
    public func canPlayLocally(_ item: CompanionMediaItem) -> Bool {
        localPlaybackReason(for: item) == nil
    }

    /// I explain why a local device action is unavailable for one row item.
    public func localPlaybackReason(for item: CompanionMediaItem) -> String? {
        localPlaybackAvailability(for: item).reason
    }

    /// I label the local action based on whether I can truly play or only hand off.
    public func localActionLabel(for item: CompanionMediaItem) -> String {
        localPlaybackAvailability(for: item).mode == .directPlayback ? "Play Here" : "Open Here"
    }

    /// I explain why daemon-side play is unavailable for one row item.
    public func daemonPlayReason(for item: CompanionMediaItem) -> String? {
        guard selectedProviderStatus?.capabilities?["playback"] == true else {
            return "I can browse this provider here, but the daemon cannot play it on this host."
        }

        guard let target = item.daemonPlaybackTarget else {
            return "I could not derive a daemon playback target for that item."
        }

        switch item.provider {
        case .spotify:
            return nil
        case .apple:
            guard item.kind == .song else {
                return "Apple daemon playback only supports song items in this build."
            }
            return selectedProviderStatus?.capabilities?["sessionControl"] == true
                ? nil
                : "Apple daemon playback needs both playback runtime and Apple catalog or library auth."
        case .youtube:
            guard item.kind == .song else {
                return "YouTube daemon playback only supports individual songs in this build."
            }
            guard target.hasPrefix("youtube:video:") || target.hasPrefix("http://") || target.hasPrefix("https://") else {
                return "I need a YouTube Music video target before the daemon can play that item."
            }
            return nil
        }
    }

    private func runTask(scope: ProviderScope? = nil, _ operation: @escaping () async throws -> Void) async {
        guard !isLoading else {
            return
        }
        isLoading = true
        lastError = nil
        do {
            try await operation()
        } catch {
            if scope == nil || isCurrentProviderScope(scope!) {
                lastError = presentableMessage(for: error)
                notice = nil
            }
        }
        isLoading = false
    }

    private func currentProviderScope() -> ProviderScope {
        ProviderScope(provider: selectedProvider, version: providerScopeVersion)
    }

    private func isCurrentProviderScope(_ scope: ProviderScope) -> Bool {
        scope.provider == selectedProvider && scope.version == providerScopeVersion
    }

    private func localPlaybackAvailability(for item: CompanionMediaItem) -> CompanionPlaybackAvailability {
        launcher?.availability(for: item)
            ?? CompanionPlaybackAvailability(
                enabled: false,
                mode: .handoff,
                reason: CompanionPlaybackLauncherError.missingPlayableReference.localizedDescription
            )
    }

    private func presentableMessage(for error: Error) -> String {
        if let error = error as? HarmonDaemonClientError {
            switch error {
            case .requestFailed(_, let message):
                return "I could not finish that daemon action. \(message)"
            case .invalidBaseURL:
                return "I could not reach the daemon because its base URL is invalid."
            case .invalidResponse:
                return "I received an unreadable response from the daemon."
            }
        }
        return error.localizedDescription
    }
}

/// I keep companion-only product errors readable instead of leaking daemon jargon.
enum HarmonCompanionStoreError: Error, LocalizedError {
    case unavailableLocalTarget(String)
    case unsupportedDaemonTarget(String)

    var errorDescription: String? {
        switch self {
        case .unavailableLocalTarget(let message):
            return message
        case .unsupportedDaemonTarget(let message):
            return message
        }
    }
}

private struct ProviderScope {
    let provider: CompanionProvider
    let version: Int
}
