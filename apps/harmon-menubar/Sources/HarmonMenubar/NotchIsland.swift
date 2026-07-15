import AppKit
import SwiftUI

/// Geometry shared by the island controller and view.
enum NotchMetrics {
    /// Extra width on each side of the notch for the collapsed artwork/EQ wings.
    static let wing: CGFloat = 96
    /// Expanded island content size.
    static let expanded = CGSize(width: 420, height: 202)
    /// Expanded window size (content + breathing room for the drop shadow).
    static let expandedWindow = CGSize(width: 460, height: 232)
}

/// AppKit constrains borderless windows to sit below the menu bar; the whole
/// point of this panel is to live ON the menu bar/notch strip, so opt out.
private final class NotchPanel: NSPanel {
    override func constrainFrameRect(_ frameRect: NSRect, to screen: NSScreen?) -> NSRect {
        frameRect
    }

    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

/// Dynamic Island, mac edition: a borderless, non-activating panel pinned
/// over the MacBook notch. Collapsed it blends into the notch (artwork + EQ
/// wings while playing); hovering springs it open into a now-playing card.
/// Dormant on machines without a notched screen.
@MainActor
final class NotchIslandController {
    private let store: MenubarStore
    private var panel: NSPanel?
    private var screen: NSScreen?
    /// Invalidates a pending window shrink when the user re-hovers mid-collapse.
    private var shrinkGeneration = 0

    init(store: MenubarStore) {
        self.store = store
        rebuild()
        observeEnabled()
        NotificationCenter.default.addObserver(
            forName: NSApplication.didChangeScreenParametersNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.rebuild() }
        }
        // This controller is created in App.init, before the run loop starts —
        // ordering a window front that early can be silently dropped. Show it
        // (again) once the app has actually finished launching.
        NotificationCenter.default.addObserver(
            forName: NSApplication.didFinishLaunchingNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.applyEnabled() }
        }
    }

    // MARK: Geometry

    private var notch: CGSize {
        guard let screen else { return .zero }
        let height = screen.safeAreaInsets.top
        if let left = screen.auxiliaryTopLeftArea, let right = screen.auxiliaryTopRightArea {
            return CGSize(width: screen.frame.width - left.width - right.width, height: height)
        }
        return CGSize(width: 196, height: height)
    }

    private var collapsedFrame: NSRect {
        frame(for: CGSize(width: notch.width + 2 * NotchMetrics.wing, height: notch.height))
    }

    private var expandedFrame: NSRect {
        frame(for: NotchMetrics.expandedWindow)
    }

    private func frame(for size: CGSize) -> NSRect {
        guard let screen else { return .zero }
        return NSRect(
            x: screen.frame.midX - size.width / 2,
            y: screen.frame.maxY - size.height,
            width: size.width,
            height: size.height
        )
    }

    // MARK: Window lifecycle

    private func rebuild() {
        panel?.orderOut(nil)
        panel = nil
        screen = NSScreen.screens.first { $0.safeAreaInsets.top > 0 }
        guard screen != nil else { return }

        let panel = NotchPanel(
            contentRect: collapsedFrame,
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.level = .statusBar
        panel.backgroundColor = .clear
        panel.isOpaque = false
        panel.hasShadow = false
        panel.isMovable = false
        panel.hidesOnDeactivate = false
        panel.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary]

        let root = NotchIslandView(store: store, notch: notch) { [weak self] expanded in
            self?.setExpanded(expanded)
        }
        panel.contentView = NSHostingView(rootView: root)
        self.panel = panel
        if store.notchIslandEnabled {
            panel.orderFrontRegardless()
        }
    }

    /// Grow the window before the shape expands; shrink it after the shape
    /// has animated back so nothing gets clipped mid-spring.
    private func setExpanded(_ expanded: Bool) {
        guard let panel else { return }
        shrinkGeneration += 1
        if expanded {
            panel.setFrame(expandedFrame, display: true)
        } else {
            let generation = shrinkGeneration
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(450))
                guard generation == self.shrinkGeneration, let panel = self.panel else { return }
                panel.setFrame(self.collapsedFrame, display: true)
            }
        }
    }

    // MARK: Settings observation

    private func observeEnabled() {
        withObservationTracking {
            _ = store.notchIslandEnabled
        } onChange: { [weak self] in
            Task { @MainActor in
                guard let self else { return }
                self.applyEnabled()
                self.observeEnabled()
            }
        }
    }

    private func applyEnabled() {
        guard let panel else { return }
        if store.notchIslandEnabled {
            panel.setFrame(collapsedFrame, display: true)
            panel.orderFrontRegardless()
        } else {
            panel.orderOut(nil)
        }
    }
}
