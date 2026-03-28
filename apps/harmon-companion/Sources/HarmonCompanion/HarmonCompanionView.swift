#if canImport(SwiftUI)
import SwiftUI

/// I provide the small SwiftUI shell that browses, queues, and launches all three providers.
public struct HarmonCompanionView: View {
    @ObservedObject private var store: HarmonCompanionStore
    private let appleRemoteStore: AppleRemoteCompanionStore?

    public init(
        store: HarmonCompanionStore,
        appleRemoteStore: AppleRemoteCompanionStore? = nil
    ) {
        self.store = store
        self.appleRemoteStore = appleRemoteStore
    }

    public var body: some View {
        NavigationStack {
            List {
                Section("Provider") {
                    Picker("Provider", selection: $store.selectedProvider) {
                        ForEach(CompanionProvider.allCases) { provider in
                            Text(provider.displayName).tag(provider)
                        }
                    }
                    .pickerStyle(.segmented)
                    .disabled(store.isLoading)
                }

                Section("Status") {
                    if let providerStatus = store.selectedProviderStatus {
                        LabeledContent("Provider status", value: providerStatus.status ?? "unknown")
                        LabeledContent("Playback mode", value: providerStatus.playbackMode ?? "unknown")
                    } else {
                        Text("I am still loading provider status.")
                            .foregroundStyle(.secondary)
                    }

                    if store.isLoading {
                        ProgressView("Loading…")
                    }
                }

                if let notice = store.notice {
                    Section("Notice") {
                        Text(notice)
                            .foregroundStyle(.secondary)
                    }
                }

                if let nowPlaying = store.nowPlaying {
                    Section("Now Playing") {
                        VStack(alignment: .leading, spacing: 8) {
                            Label(nowPlaying.name, systemImage: "music.note")
                            Text(nowPlaying.artist)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                            if let playbackTruth = nowPlaying.playbackTruth {
                                Text(playbackTruth.replacingOccurrences(of: "-", with: " ").capitalized)
                                    .font(.caption.weight(.semibold))
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(.thinMaterial)
                                    .clipShape(Capsule())
                            }
                        }
                    }
                }

                if store.selectedProvider == .apple, let bridgeStatus = appleRemoteStore?.bridgeStatus {
                    Section("Apple Remote") {
                        LabeledContent("Connection", value: bridgeStatus.connected ? "Connected" : "Disconnected")
                        LabeledContent("Playback state", value: bridgeStatus.playbackState.rawValue.capitalized)
                        LabeledContent("Pending commands", value: "\(bridgeStatus.pendingCommands)")
                        if let currentTrack = appleRemoteStore?.currentTrack {
                            Text("Remote track: \(currentTrack.name)")
                                .foregroundStyle(.secondary)
                        }
                        if let lastSyncAt = appleRemoteStore?.lastSyncAt {
                            Text("Last sync: \(lastSyncAt.formatted(date: .omitted, time: .standard))")
                                .foregroundStyle(.secondary)
                        }
                        if let remoteError = appleRemoteStore?.lastError {
                            Text(remoteError)
                                .foregroundStyle(.red)
                        }
                        Button("Sync Now") {
                            Task { await appleRemoteStore?.syncNow() }
                        }
                        .disabled(store.isLoading)
                    }
                }

                Section("Search") {
                    TextField("Search music", text: $store.searchQuery)
                        .submitLabel(.search)
                        .onSubmit {
                            Task { await store.search() }
                        }
                    Picker("Kind", selection: $store.searchKind) {
                        ForEach(CompanionSearchKind.allCases) { kind in
                            Text(kind.rawValue.capitalized).tag(kind)
                        }
                    }
                    .pickerStyle(.segmented)

                    Button("Search") {
                        Task { await store.search() }
                    }
                    .disabled(store.isLoading || store.searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

                    ForEach(store.searchResults) { item in
                        MediaItemRow(
                            isBusy: store.isLoading,
                            item: item,
                            daemonDisabledReason: store.daemonPlayReason(for: item),
                            localActionLabel: store.localActionLabel(for: item),
                            localDisabledReason: store.localPlaybackReason(for: item),
                            onOpen: {
                                Task { await store.playOnDevice(item) }
                            },
                            onDaemonPlay: {
                                Task {
                                    store.selectedProvider = item.provider
                                    await store.playViaDaemon(item)
                                }
                            }
                        )
                    }
                }

                Section("Library") {
                    Button("Load Library") {
                        Task { await store.loadLibrary() }
                    }
                    .disabled(store.isLoading)
                    ForEach(store.libraryTracks) { item in
                        MediaItemRow(
                            isBusy: store.isLoading,
                            item: item,
                            daemonDisabledReason: store.daemonPlayReason(for: item),
                            localActionLabel: store.localActionLabel(for: item),
                            localDisabledReason: store.localPlaybackReason(for: item),
                            onOpen: {
                                Task { await store.playOnDevice(item) }
                            },
                            onDaemonPlay: {
                                Task {
                                    store.selectedProvider = item.provider
                                    await store.playViaDaemon(item)
                                }
                            }
                        )
                    }
                }

                Section("Playlists") {
                    Button("Load Playlists") {
                        Task { await store.loadPlaylists() }
                    }
                    .disabled(store.isLoading)
                    ForEach(store.playlists) { item in
                        Button(item.title) {
                            Task { await store.loadPlaylistTracks(item) }
                        }
                        .fontWeight(store.selectedPlaylist?.id == item.id ? .semibold : .regular)
                    }
                    if let selectedPlaylist = store.selectedPlaylist {
                        Text("Tracks from \(selectedPlaylist.title)")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    ForEach(store.playlistTracks) { item in
                        MediaItemRow(
                            isBusy: store.isLoading,
                            item: item,
                            daemonDisabledReason: store.daemonPlayReason(for: item),
                            localActionLabel: store.localActionLabel(for: item),
                            localDisabledReason: store.localPlaybackReason(for: item),
                            onOpen: {
                                Task { await store.playOnDevice(item) }
                            },
                            onDaemonPlay: {
                                Task {
                                    store.selectedProvider = item.provider
                                    await store.playViaDaemon(item)
                                }
                            }
                        )
                    }
                }

                if let error = store.lastError {
                    Section("Error") {
                        Text(error)
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Harmon Companion")
            .toolbar {
                ToolbarItemGroup(placement: .primaryAction) {
                    Button("Refresh") {
                        Task { await store.refreshStatus() }
                    }
                    .disabled(store.isLoading)
                    Button("Prev") {
                        Task { await store.previousViaDaemon() }
                    }
                    .disabled(!store.canUseTransport("previous"))
                    Button("Pause") {
                        Task { await store.pauseViaDaemon() }
                    }
                    .disabled(!store.canUseTransport("pause"))
                    Button("Next") {
                        Task { await store.nextViaDaemon() }
                    }
                    .disabled(!store.canUseTransport("next"))
                }
            }
            .task {
                await store.start()
            }
            .onChange(of: store.selectedProvider) { _, _ in
                Task { await store.handleProviderChange() }
            }
        }
    }
}

private struct MediaItemRow: View {
    let isBusy: Bool
    let item: CompanionMediaItem
    let daemonDisabledReason: String?
    let localActionLabel: String
    let localDisabledReason: String?
    let onOpen: () -> Void
    let onDaemonPlay: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 12) {
                if let imageURL = item.imageURL, let url = URL(string: imageURL) {
                    AsyncImage(url: url) { image in
                        image
                            .resizable()
                            .scaledToFill()
                    } placeholder: {
                        RoundedRectangle(cornerRadius: 12)
                            .fill(.thinMaterial)
                    }
                    .frame(width: 54, height: 54)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                VStack(alignment: .leading, spacing: 6) {
                    Text(item.title)
                        .font(.headline)
                    if let subtitle = item.subtitle {
                        Text(subtitle)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            HStack {
                Button(localActionLabel, action: onOpen)
                    .disabled(isBusy || localDisabledReason != nil)
                Button("Play On Daemon", action: onDaemonPlay)
                    .disabled(isBusy || daemonDisabledReason != nil)
            }
            .buttonStyle(.bordered)
            if let localDisabledReason {
                Text(localDisabledReason)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if let daemonDisabledReason {
                Text(daemonDisabledReason)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}

#endif
