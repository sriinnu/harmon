import AppKit
import SwiftUI

@main
struct HarmonMenubarApp: App {
    @State private var store: MenubarStore
    /// Keeps the notch-island panel alive for the app's lifetime.
    private let island: NotchIslandController

    init() {
        // Singleton: a second copy (installer race, double launch) would mean
        // two menubar icons and two notch islands. First one wins.
        if let bundleID = Bundle.main.bundleIdentifier,
           NSRunningApplication.runningApplications(withBundleIdentifier: bundleID)
               .contains(where: { $0.processIdentifier != ProcessInfo.processInfo.processIdentifier }) {
            exit(0)
        }

        // Menubar-only: no Dock icon, no main window.
        NSApplication.shared.setActivationPolicy(.accessory)
        let store = MenubarStore()
        _store = State(initialValue: store)
        island = NotchIslandController(store: store)
        // Poll from launch, not first panel-open — the island and the bar
        // icon both need live data before the user ever clicks the icon.
        store.start()
    }

    var body: some Scene {
        MenuBarExtra {
            MenubarView(store: store)
                .onAppear { store.start() }
        } label: {
            Image(nsImage: menuBarImage)
        }
        .menuBarExtraStyle(.window)
    }

    /// State-aware icon. Idle/down states stay template (adapt to the bar);
    /// while a track plays we opt out of template rendering for a green note.
    private var menuBarImage: NSImage {
        let playing = store.daemonUp && store.nowPlaying != nil
        let symbol = !store.daemonUp
            ? "music.note.house"
            : playing ? "music.note" : "music.note.list"
        let base = NSImage(systemSymbolName: symbol, accessibilityDescription: "harmon")
            ?? NSImage(systemSymbolName: "music.note", accessibilityDescription: "harmon")!
        let sizing = NSImage.SymbolConfiguration(pointSize: 14, weight: .semibold)

        if playing {
            let palette = sizing.applying(.init(paletteColors: [.systemGreen]))
            if let colored = base.withSymbolConfiguration(palette) {
                colored.isTemplate = false
                return colored
            }
        }

        let plain = base.withSymbolConfiguration(sizing) ?? base
        plain.isTemplate = true
        return plain
    }
}
