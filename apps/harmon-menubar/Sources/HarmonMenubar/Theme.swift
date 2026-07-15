import SwiftUI

/// Harmon accent palette layered over native materials: the panel is system
/// Liquid Glass; terracotta appears only as tint so vibrancy does the rest.
enum Theme {
    static let accent = Color(red: 0.784, green: 0.314, blue: 0.165)     // #C8502A — logo terracotta
    static let ok = Color.green
    static let warn = Color.orange
}

/// The progress wire: elapsed/total bar for the current track. Position data
/// arrives in polls, so it extrapolates forward each second while playing.
struct ProgressWire: View {
    let store: MenubarStore
    var showsTimes = true

    /// Live scrub position while the user drags, as a 0…1 fraction.
    @State private var dragFraction: CGFloat?

    var body: some View {
        if let track = store.nowPlaying,
           let duration = track.durationMs, duration > 0,
           let position = track.positionMs {
            TimelineView(.periodic(from: .now, by: 1)) { context in
                let elapsed = store.isPausedOptimistic
                    ? position
                    : position + context.date.timeIntervalSince(store.nowPlayingReceivedAt) * 1000
                let clamped = dragFraction.map { Double($0) * duration } ?? min(max(elapsed, 0), duration)
                VStack(spacing: 3) {
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(.primary.opacity(0.18))
                            Capsule().fill(Theme.accent)
                                .frame(width: max(3, geo.size.width * clamped / duration))
                        }
                        // Fat hit area so a 3pt wire is grabbable.
                        .contentShape(Rectangle().inset(by: -8))
                        .gesture(
                            DragGesture(minimumDistance: 0)
                                .onChanged { value in
                                    dragFraction = min(max(value.location.x / geo.size.width, 0), 1)
                                }
                                .onEnded { value in
                                    let fraction = min(max(value.location.x / geo.size.width, 0), 1)
                                    dragFraction = nil
                                    store.seek(toMs: Double(fraction) * duration)
                                }
                        )
                    }
                    .frame(height: 3)
                    if showsTimes {
                        HStack {
                            Text(Self.timestamp(clamped))
                            Spacer()
                            Text(Self.timestamp(duration))
                        }
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundStyle(.tertiary)
                    }
                }
            }
        }
    }

    static func timestamp(_ ms: Double) -> String {
        let totalSeconds = Int(ms / 1000)
        return String(format: "%d:%02d", totalSeconds / 60, totalSeconds % 60)
    }
}

/// The notch silhouette: hangs off the menubar with concave "ears" flaring
/// into the bar at the top, heavy convex rounding at the bottom — the same
/// curve family as the hardware notch.
struct NotchShape: Shape {
    var topRadius: CGFloat = 11
    var bottomRadius: CGFloat = 28

    var animatableData: AnimatablePair<CGFloat, CGFloat> {
        get { AnimatablePair(topRadius, bottomRadius) }
        set {
            topRadius = newValue.first
            bottomRadius = newValue.second
        }
    }

    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.minY))
        // Top-left ear: concave curve from the bar into the body side.
        path.addQuadCurve(
            to: CGPoint(x: rect.minX + topRadius, y: rect.minY + topRadius),
            control: CGPoint(x: rect.minX + topRadius, y: rect.minY)
        )
        path.addLine(to: CGPoint(x: rect.minX + topRadius, y: rect.maxY - bottomRadius))
        path.addQuadCurve(
            to: CGPoint(x: rect.minX + topRadius + bottomRadius, y: rect.maxY),
            control: CGPoint(x: rect.minX + topRadius, y: rect.maxY)
        )
        path.addLine(to: CGPoint(x: rect.maxX - topRadius - bottomRadius, y: rect.maxY))
        path.addQuadCurve(
            to: CGPoint(x: rect.maxX - topRadius, y: rect.maxY - bottomRadius),
            control: CGPoint(x: rect.maxX - topRadius, y: rect.maxY)
        )
        path.addLine(to: CGPoint(x: rect.maxX - topRadius, y: rect.minY + topRadius))
        // Top-right ear, mirrored.
        path.addQuadCurve(
            to: CGPoint(x: rect.maxX, y: rect.minY),
            control: CGPoint(x: rect.maxX - topRadius, y: rect.minY)
        )
        path.closeSubpath()
        return path
    }
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
