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
        .padding(.horizontal, 12)
        .frame(width: 340)
        // Notch effect: the system window is cleared (PanelWindowChrome) and
        // the Liquid Glass body is clipped to the notch silhouette — hanging
        // off the menubar with ears, heavy curves at the bottom.
        .background(panelBackground)
        .compositingGroup()
        .shadow(color: .black.opacity(0.35), radius: 16, y: 6)
        .padding(.horizontal, 8)
        .padding(.bottom, 22)
        .background(
            GeometryReader { proxy in
                Color.clear
                    .onAppear {
                        // The window exists a beat after the content appears.
                        let size = proxy.size
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                            Self.fitPanelWindow(to: size)
                        }
                    }
                    .onChange(of: proxy.size) { _, newSize in
                        // Content shrank/grew (daemon toggled, settings…) —
                        // resize the window or it keeps the stale big box.
                        Self.fitPanelWindow(to: newSize)
                    }
            }
        )
        .tint(Theme.accent)
        .animation(.smooth(duration: 0.3), value: store.nowPlaying)
        .animation(.smooth(duration: 0.3), value: store.daemonUp)
        .animation(.smooth(duration: 0.25), value: showSettings)
    }

    private var panelShape: NotchShape {
        NotchShape(topRadius: 12, bottomRadius: 30)
    }

    @ViewBuilder
    private var panelBackground: some View {
        if #available(macOS 26.0, *) {
            Color.clear.glassEffect(.regular, in: panelShape)
        } else {
            panelShape.fill(.regularMaterial)
                .overlay(panelShape.stroke(.separator.opacity(0.5)))
        }
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
            if store.daemonTransition != nil {
                ProgressView()
                    .controlSize(.mini)
                    .help(store.daemonTransition == .stopping ? "Stopping the daemon…" : "Starting the daemon…")
            } else {
                Button {
                    if store.daemonUp {
                        store.stopDaemon()
                    } else {
                        store.startDaemon()
                    }
                } label: {
                    Image(systemName: "power")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(store.daemonUp ? AnyShapeStyle(Theme.ok) : AnyShapeStyle(.secondary))
                        .shadow(color: store.daemonUp ? Theme.ok.opacity(0.6) : .clear, radius: 3)
                }
                .buttonStyle(.plain)
                .help(store.daemonUp ? "Stop the daemon" : "Start the daemon")
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
                    ProgressWire(store: store)
                        .padding(.top, 3)
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
        ZStack {
            // Transport cluster dead-center; the volume slider floats on the
            // trailing edge without pushing the buttons around.
            HStack(spacing: 14) {
                transportButton("backward.fill") { store.previous() }
                transportButton(playPauseSymbol) {
                    if playPauseSymbol == "play.fill" { store.play() } else { store.pause() }
                }
                .help(store.transportProvider == "youtube" ? "YouTube browser-handoff cannot pause" : "Play/Pause")
                transportButton("forward.fill") { store.next() }
            }
            .frame(maxWidth: .infinity)
            if store.transportProvider == "spotify" {
                HStack {
                    Spacer()
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
        }
        .disabled(store.transportProvider == nil)
    }

    /// One toggle: play when idle/paused, pause while playing. YouTube's
    /// browser handoff can't pause, so it stays a play button.
    private var playPauseSymbol: String {
        if store.transportProvider == "youtube" { return "play.fill" }
        return (store.isPausedOptimistic || store.nowPlaying == nil) ? "play.fill" : "pause.fill"
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
                .font(.caption2.weight(.semibold))
                .foregroundStyle(store.preferredProvider == nil ? AnyShapeStyle(.secondary) : AnyShapeStyle(.primary))
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
                    Label {
                        Text("Start session")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.primary)
                    } icon: {
                        Image(systemName: "sparkles")
                            .foregroundStyle(Theme.accent)
                    }
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
            Toggle(isOn: $store.notchIslandEnabled) {
                Text("Notch island (hover the notch while playing)")
                    .font(.caption)
            }
            .toggleStyle(.switch)
            .controlSize(.mini)
            .padding(.top, 2)
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
                // terminate(nil) can be silently deferred for accessory apps
                // (e.g. a child Process or an open sheet delays it) — never
                // leave the user with a Quit that looks dead.
                DispatchQueue.main.asyncAfter(deadline: .now() + 1) { exit(0) }
            } label: {
                Text("Quit")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: Helpers

    /// Make the MenuBarExtra window invisible so only the notch body (and its
    /// shadow) shows. The window is found by scanning the app's windows — an
    /// NSViewRepresentable background never gets makeNSView called inside the
    /// macOS 26 MenuBarExtra panel, so window access via view.window is a
    /// dead end.
    /// Fit the MenuBarExtra window to the content and keep it flush against
    /// the menubar so the notch ears flow out of the bar's bottom edge.
    /// Without this the window keeps its largest-ever size (SwiftUI doesn't
    /// shrink it when content changes), leaving a dead glass box around a
    /// small card.
    ///
    /// Note on the faint outer box around the notch: macOS 26 renders the
    /// panel's Liquid Glass in a separate companion window
    /// (_NSGlassTrackingWindow) — hiding it or clearing the panel window
    /// takes the whole glass pipeline down with it (body, cards, dimming),
    /// so the box stays. Revisit when the OS exposes real chrome control.
    private static func fitPanelWindow(to contentSize: CGSize) {
        guard contentSize.width > 0, contentSize.height > 0 else { return }
        for window in NSApplication.shared.windows {
            let kind = String(describing: type(of: window))
            guard kind.contains("MenuBarExtraWindow") else { continue }
            guard let screen = window.screen ?? NSScreen.main else { continue }
            let top = screen.visibleFrame.maxY
            let target = NSRect(
                x: window.frame.midX - contentSize.width / 2,
                y: top - contentSize.height,
                width: contentSize.width,
                height: contentSize.height
            )
            if abs(window.frame.origin.y - target.origin.y) > 0.5
                || abs(window.frame.height - target.height) > 0.5
                || abs(window.frame.width - target.width) > 0.5 {
                window.setFrame(target, display: true, animate: false)
            }
        }
    }

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
