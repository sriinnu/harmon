import SwiftUI

/// Harmon accent palette layered over native materials: the panel is system
/// Liquid Glass; terracotta appears only as tint so vibrancy does the rest.
enum Theme {
    static let accent = Color(red: 0.784, green: 0.314, blue: 0.165)     // #C8502A — logo terracotta
    static let ok = Color.green
    static let warn = Color.orange
}

extension View {
    /// Liquid Glass card on macOS 26+, material fallback below.
    @ViewBuilder
    func liquidCard(cornerRadius: CGFloat = 12) -> some View {
        if #available(macOS 26.0, *) {
            glassEffect(.regular, in: .rect(cornerRadius: cornerRadius))
        } else {
            background(.regularMaterial, in: RoundedRectangle(cornerRadius: cornerRadius))
                .overlay(RoundedRectangle(cornerRadius: cornerRadius).stroke(.separator.opacity(0.5)))
        }
    }

    /// Interactive circular glass (transport buttons).
    @ViewBuilder
    func liquidCircle() -> some View {
        if #available(macOS 26.0, *) {
            glassEffect(.regular.interactive(), in: .circle)
        } else {
            background(.regularMaterial, in: Circle())
                .overlay(Circle().stroke(.separator.opacity(0.5)))
        }
    }

    /// Interactive capsule glass (pill buttons); tinted variant for the
    /// prominent action.
    @ViewBuilder
    func liquidCapsule(tint: Color? = nil) -> some View {
        if #available(macOS 26.0, *) {
            glassEffect(tint.map { .regular.tint($0).interactive() } ?? .regular.interactive(), in: .capsule)
        } else {
            background(tint.map(AnyShapeStyle.init) ?? AnyShapeStyle(.regularMaterial), in: Capsule())
                .overlay(Capsule().stroke(.separator.opacity(0.5)))
        }
    }
}
