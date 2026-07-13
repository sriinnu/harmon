import SwiftUI

struct MenubarView: View {
    @Bindable var store: MenubarStore
    @State private var query = ""
    @State private var volume: Double = 50
    @State private var showSettings = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header

            if store.daemonUp {
                nowPlayingCard
                transportRow
                smartPlayRow
                sessionRow
                providerRow
            } else {
                daemonDownCard
            }

            if let error = store.lastError {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .font(.caption)
                    .foregroundStyle(Theme.accent)
                    .lineLimit(3)
                    .padding(8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .liquidCard(cornerRadius: 8)
            }

            if showSettings {
                settings
            }

            footer
        }
        .padding(14)
        .frame(width: 316)
        .tint(Theme.accent)
        .animation(.smooth(duration: 0.3), value: store.nowPlaying)
        .animation(.smooth(duration: 0.3), value: store.daemonUp)
        .animation(.smooth(duration: 0.25), value: showSettings)
    }

    // MARK: Sections

    private var header: some View {
        HStack(spacing: 6) {
            Image(systemName: "music.note")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(Theme.accent)
            Text("harmon")
                .font(.system(.subheadline, design: .rounded).weight(.bold))
            Circle()
                .fill(store.daemonUp ? Theme.ok : Theme.accent)
                .frame(width: 7, height: 7)
                .padding(.leading, 2)
            Text(store.daemonUp ? "running" : "daemon down")
                .font(.caption2)
                .foregroundStyle(.secondary)
            Spacer()
            if store.daemonUp {
                Button {
                    store.stopDaemon()
                } label: {
                    Image(systemName: "power")
                        .symbolRenderingMode(.hierarchical)
                        .foregroundStyle(.tertiary)
                }
                .buttonStyle(.plain)
                .help("Stop the daemon")
            }
            Button {
                showSettings.toggle()
            } label: {
                Image(systemName: "gearshape.fill")
                    .symbolRenderingMode(.hierarchical)
                    .foregroundStyle(showSettings ? AnyShapeStyle(Theme.accent) : AnyShapeStyle(.tertiary))
            }
            .buttonStyle(.plain)
            .help("Settings")
        }
    }

    private var nowPlayingCard: some View {
        HStack(spacing: 10) {
            if let imageUrl = store.nowPlaying?.imageUrl, let url = URL(string: imageUrl) {
                AsyncImage(url: url) { image in
                    image.resizable().aspectRatio(contentMode: .fill)
                } placeholder: {
                    Color.secondary.opacity(0.15)
                }
                .frame(width: 44, height: 44)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            } else {
                Image(systemName: store.nowPlaying != nil ? "waveform" : "music.note")
                    .font(.system(size: 20, weight: .medium))
                    .symbolRenderingMode(.hierarchical)
                    .foregroundStyle(store.nowPlaying != nil ? AnyShapeStyle(Theme.accent) : AnyShapeStyle(.tertiary))
                    .symbolEffect(.variableColor.iterative, isActive: store.nowPlaying != nil)
                    .frame(width: 30)
            }

            VStack(alignment: .leading, spacing: 2) {
                if let track = store.nowPlaying {
                    Text(track.name ?? "Unknown track")
                        .font(.system(.headline, design: .rounded))
                        .lineLimit(1)
                        .contentTransition(.opacity)
                    Text(track.artist ?? "")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    HStack(spacing: 4) {
                        if let provider = store.activeProvider {
                            Text(provider.capitalized)
                                .foregroundStyle(Theme.accent)
                        }
                        if store.session?.isActive == true, let depth = store.session?.queueDepth {
                            Text("· session · queue \(depth)")
                                .foregroundStyle(.tertiary)
                        }
                    }
                    .font(.caption2.weight(.medium))
                } else {
                    Text("Nothing playing")
                        .font(.system(.headline, design: .rounded))
                        .foregroundStyle(.secondary)
                    Text("Ask your assistant, or type below")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .liquidCard(cornerRadius: 12)
    }

    private var transportRow: some View {
        HStack(spacing: 14) {
            transportButton("backward.fill") { store.previous() }
            transportButton("play.fill") { store.play() }
            transportButton("pause.fill") { store.pause() }
                .disabled(store.transportProvider == "youtube")
                .help(store.transportProvider == "youtube" ? "YouTube browser-handoff cannot pause" : "Pause")
            transportButton("forward.fill") { store.next() }
            Spacer()
            if store.transportProvider == "spotify" {
                HStack(spacing: 4) {
                    Image(systemName: "speaker.wave.2.fill")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                    Slider(value: $volume, in: 0 ... 100) { editing in
                        if !editing { store.setVolume(Int(volume)) }
                    }
                    .frame(width: 70)
                    .controlSize(.mini)
                }
                .help("Spotify volume")
            }
        }
        .disabled(store.transportProvider == nil)
    }

    private func transportButton(_ symbol: String, action: @escaping () -> Void) -> some View {
        // The glass lives on the label INSIDE the button — applied outside,
        // the interactive glass layer swallows the button's hit-testing.
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(store.transportProvider == nil ? AnyShapeStyle(.tertiary) : AnyShapeStyle(.primary))
                .frame(width: 28, height: 28)
                .liquidCircle()
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
    }

    private var smartPlayRow: some View {
        HStack(spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "magnifyingglass")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                TextField("Play anything…", text: $query)
                    .textFieldStyle(.plain)
                    .font(.callout)
                    .onSubmit(submitQuery)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .liquidCard(cornerRadius: 10)

            providerPicker

            Button(action: submitQuery) {
                Image(systemName: "play.circle.fill")
                    .font(.system(size: 26))
                    .symbolRenderingMode(.hierarchical)
                    .foregroundStyle(
                        query.trimmingCharacters(in: .whitespaces).isEmpty
                            ? AnyShapeStyle(.tertiary)
                            : AnyShapeStyle(Theme.accent)
                    )
            }
            .buttonStyle(.plain)
            .disabled(query.trimmingCharacters(in: .whitespaces).isEmpty)
        }
    }

    /// Where to play: Auto (daemon picks across connected providers) or a
    /// forced provider — also drives the transport buttons.
    private var providerPicker: some View {
        Menu {
            Button { store.preferredProvider = nil } label: {
                Label("Auto", systemImage: store.preferredProvider == nil ? "checkmark" : "sparkles")
            }
            ForEach(["spotify", "apple", "youtube"], id: \.self) { provider in
                Button { store.preferredProvider = provider } label: {
                    Label(providerLabel(provider), systemImage: store.preferredProvider == provider ? "checkmark" : "music.note")
                }
            }
        } label: {
            Text(store.preferredProvider.map(providerShortLabel) ?? "Auto")
                .font(.caption2.weight(.medium))
                .foregroundStyle(store.preferredProvider == nil ? AnyShapeStyle(.secondary) : AnyShapeStyle(Theme.accent))
        }
        .menuStyle(.borderlessButton)
        .fixedSize()
        .help("Choose which app plays: Auto lets the daemon pick the first connected provider with a match")
    }

    private var sessionRow: some View {
        HStack(spacing: 8) {
            if store.session?.isActive == true {
                pillButton("Calmer", symbol: "arrow.down") { store.nudge("calmer") }
                pillButton("Sharper", symbol: "arrow.up") { store.nudge("sharper") }
                Spacer()
                pillButton("Stop", symbol: "stop.fill", prominent: true) { store.stopSession() }
            } else {
                Menu {
                    ForEach(["focus", "relax", "energize", "meditate", "workout"], id: \.self) { mode in
                        Button(mode.capitalized) { store.startSession(mode: mode) }
                    }
                } label: {
                    Label("Start session", systemImage: "sparkles")
                        .font(.caption.weight(.medium))
                }
                .menuStyle(.borderlessButton)
                .fixedSize()
                .disabled(store.connectedProviders.isEmpty)
                Spacer()
            }
        }
    }

    private func pillButton(_ title: String, symbol: String, prominent: Bool = false, action: @escaping () -> Void) -> some View {
        // Glass on the label, not the button — see transportButton.
        Button(action: action) {
            Label(title, systemImage: symbol)
                .font(.caption.weight(.medium))
                .padding(.horizontal, 9)
                .padding(.vertical, 5)
                .foregroundStyle(prominent ? AnyShapeStyle(.white) : AnyShapeStyle(.primary))
                .liquidCapsule(tint: prominent ? Theme.accent : nil)
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private var providerRow: some View {
        VStack(alignment: .leading, spacing: 7) {
            ForEach(["spotify", "youtube", "apple"], id: \.self) { provider in
                HStack {
                    Circle()
                        .fill(dotColor(for: provider))
                        .frame(width: 7, height: 7)
                    Text(providerLabel(provider))
                        .font(.caption)
                    Spacer()
                    if store.connecting == provider {
                        HStack(spacing: 4) {
                            ProgressView().controlSize(.mini)
                            Text("approve in browser…")
                                .font(.caption2)
                                .foregroundStyle(.tertiary)
                        }
                    } else if store.providers[provider]?.connected != true, provider != "apple" {
                        pillButton("Connect", symbol: "link", prominent: true) {
                            store.connect(provider: provider)
                        }
                    } else if provider == "apple", store.providers[provider]?.connected != true {
                        Text("via pnpm auth:apple")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                            .help("Apple Music needs a MusicKit user token — run `pnpm auth:apple` or POST /v1/auth/apple/set-user-token")
                    } else {
                        Text(store.providers[provider]?.auth ?? "connected")
                            .font(.caption2)
                            .foregroundStyle(Theme.ok)
                    }
                }
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .liquidCard(cornerRadius: 12)
    }

    private var daemonDownCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !store.repoPath.isEmpty {
                pillButton("Start daemon", symbol: "power", prominent: true) {
                    store.startDaemon()
                }
            } else {
                Label("Set the repo path in Settings, or run:", systemImage: "power")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text("pnpm start:daemon")
                    .font(.system(.caption, design: .monospaced))
                    .textSelection(.enabled)
                    .padding(8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .liquidCard(cornerRadius: 8)
            }
        }
    }

    private var settings: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Daemon endpoint")
                .font(.caption2)
                .foregroundStyle(.secondary)
            TextField("http://127.0.0.1:17373", text: $store.endpointString)
                .textFieldStyle(.roundedBorder)
                .font(.caption)
            Text("API token (HARMON_API_TOKEN)")
                .font(.caption2)
                .foregroundStyle(.secondary)
            SecureField("token", text: $store.apiToken)
                .textFieldStyle(.roundedBorder)
                .font(.caption)
            Text("Repo path (for Start daemon)")
                .font(.caption2)
                .foregroundStyle(.secondary)
            TextField("/path/to/harmon", text: $store.repoPath)
                .textFieldStyle(.roundedBorder)
                .font(.caption)
            pillButton("Apply", symbol: "checkmark", prominent: true) {
                store.restart()
                Task { await store.refresh() }
                showSettings = false
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .liquidCard(cornerRadius: 12)
    }

    private var footer: some View {
        HStack {
            Button {
                if let url = URL(string: "http://127.0.0.1:4173") {
                    NSWorkspace.shared.open(url)
                }
            } label: {
                Label("Web player", systemImage: "rectangle.on.rectangle")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            Spacer()
            Button {
                NSApplication.shared.terminate(nil)
            } label: {
                Text("Quit")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: Helpers

    private func submitQuery() {
        store.smartPlay(query)
        query = ""
    }

    private func dotColor(for provider: String) -> Color {
        if store.providers[provider]?.connected == true { return Theme.ok }
        return store.providers[provider] == nil ? Color.secondary.opacity(0.4) : Theme.warn
    }

    private func providerLabel(_ provider: String) -> String {
        switch provider {
        case "spotify": return "Spotify"
        case "youtube": return "YouTube Music"
        case "apple": return "Apple Music"
        default: return provider
        }
    }

    private func providerShortLabel(_ provider: String) -> String {
        switch provider {
        case "spotify": return "Spotify"
        case "youtube": return "YouTube"
        case "apple": return "Apple"
        default: return provider
        }
    }
}
