import SwiftUI

/// The island shape + content. Three visual states:
/// - idle: exactly notch-sized, pure black — invisible against the hardware.
/// - playing (collapsed): wings appear beside the notch — artwork left, EQ right.
/// - hovered: springs open into a now-playing card with transport controls.
struct NotchIslandView: View {
    let store: MenubarStore
    let notch: CGSize
    let onExpandChange: (Bool) -> Void

    @State private var hovered = false

    private var playing: Bool { store.daemonUp && store.nowPlaying != nil }
    private var paused: Bool { store.isPausedOptimistic }

    private var islandSize: CGSize {
        if hovered {
            // No transport row when idle — don't leave a slab of empty black.
            return CGSize(width: NotchMetrics.expanded.width, height: playing ? NotchMetrics.expanded.height : notch.height + 86)
        }
        if playing { return CGSize(width: notch.width + 2 * NotchMetrics.wing, height: notch.height) }
        return CGSize(width: notch.width, height: notch.height)
    }

    private var bottomRadius: CGFloat { hovered ? 26 : playing ? 13 : 10 }

    var body: some View {
        let shape = NotchShape(topRadius: hovered ? 12 : 6, bottomRadius: bottomRadius)

        ZStack(alignment: .top) {
            shape
                .fill(.black)
                .overlay(alignment: .top) {
                    if hovered {
                        expandedContent
                    } else if playing {
                        collapsedContent
                    }
                }
                .clipShape(shape)
                .frame(width: islandSize.width, height: islandSize.height)
                .shadow(color: .black.opacity(hovered ? 0.45 : 0), radius: 12, y: 6)
                .onHover { inside in
                    if inside { onExpandChange(true) }
                    withAnimation(.spring(response: 0.38, dampingFraction: 0.78)) {
                        hovered = inside
                    }
                    if !inside { onExpandChange(false) }
                }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .opacity(store.notchIslandEnabled ? 1 : 0)
        .allowsHitTesting(store.notchIslandEnabled)
    }

    // MARK: Collapsed (playing) — artwork left wing, EQ right wing

    private var collapsedContent: some View {
        HStack {
            artwork(side: notch.height - 12, cornerRadius: 5)
            Spacer()
            EqBars(playing: !paused)
                .frame(height: notch.height * 0.42)
        }
        .padding(.horizontal, 13)
        .frame(width: islandSize.width, height: islandSize.height)
    }

    // MARK: Expanded — now-playing card

    private var expandedContent: some View {
        VStack(spacing: 12) {
            HStack(alignment: .center, spacing: 12) {
                artwork(side: 58, cornerRadius: 12)
                VStack(alignment: .leading, spacing: 3) {
                    Text(store.nowPlaying?.name ?? (store.daemonUp ? "Nothing playing" : "harmon is asleep"))
                        .font(.system(.headline, design: .rounded))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    Text(store.nowPlaying?.artist ?? (store.daemonUp ? "Pick something from the menubar" : "Start the daemon from the menubar"))
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.55))
                        .lineLimit(1)
                    if let provider = store.activeProvider ?? store.nowPlaying?.provider {
                        Text(provider)
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(Theme.accent)
                            .textCase(.uppercase)
                    }
                }
                Spacer()
                if playing {
                    EqBars(playing: !paused)
                        .frame(height: 20)
                }
            }

            if playing {
                ProgressWire(store: store, showsTimes: true)
                    .padding(.horizontal, 2)
                HStack(spacing: 34) {
                    islandButton("backward.fill", size: 15) { store.previous() }
                    islandButton(paused ? "play.fill" : "pause.fill", size: 22) {
                        if paused { store.play() } else { store.pause() }
                    }
                    islandButton("forward.fill", size: 15) { store.next() }
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, notch.height + 8)
        .padding(.bottom, 14)
        .frame(width: NotchMetrics.expanded.width, alignment: .top)
    }

    // MARK: Pieces

    @ViewBuilder
    private func artwork(side: CGFloat, cornerRadius: CGFloat) -> some View {
        if let imageUrl = store.nowPlaying?.imageUrl, let url = URL(string: imageUrl) {
            AsyncImage(url: url) { image in
                image.resizable().aspectRatio(contentMode: .fill)
            } placeholder: {
                RoundedRectangle(cornerRadius: cornerRadius).fill(.white.opacity(0.08))
            }
            .frame(width: side, height: side)
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
        } else {
            RoundedRectangle(cornerRadius: cornerRadius)
                .fill(.white.opacity(0.08))
                .frame(width: side, height: side)
                .overlay {
                    Image(systemName: "music.note")
                        .font(.system(size: side * 0.42, weight: .medium))
                        .foregroundStyle(Theme.accent)
                }
        }
    }

    private func islandButton(_ symbol: String, size: CGFloat, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: size, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: size + 16, height: size + 16)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
    }
}

/// Four capsules doing the classic now-playing dance.
private struct EqBars: View {
    let playing: Bool
    @State private var up = false

    private static let low: [CGFloat] = [0.35, 0.7, 0.45, 0.85]
    private static let high: [CGFloat] = [0.9, 0.4, 1.0, 0.55]

    var body: some View {
        GeometryReader { geo in
            HStack(alignment: .center, spacing: 2.5) {
                ForEach(0 ..< 4, id: \.self) { index in
                    Capsule()
                        .fill(Theme.accent)
                        .frame(
                            width: 3,
                            height: geo.size.height * (up ? Self.high[index] : Self.low[index])
                        )
                        .animation(
                            playing
                                ? .easeInOut(duration: 0.45 + Double(index) * 0.08).repeatForever(autoreverses: true)
                                : .default,
                            value: up
                        )
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .frame(width: 4 * 3 + 3 * 2.5)
        .onAppear { up = true }
    }
}
