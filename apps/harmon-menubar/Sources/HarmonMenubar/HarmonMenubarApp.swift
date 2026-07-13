import AppKit
import SwiftUI

@main
struct HarmonMenubarApp: App {
    @State private var store = MenubarStore()

    init() {
        // Menubar-only: no Dock icon, no main window.
        NSApplication.shared.setActivationPolicy(.accessory)
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
