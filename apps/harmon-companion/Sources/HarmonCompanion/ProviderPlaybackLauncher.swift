import Foundation
#if canImport(AppKit)
import AppKit
#endif
#if canImport(MediaPlayer)
import MediaPlayer
#endif
#if canImport(UIKit)
import UIKit
#endif

/// I abstract local provider launch so the companion UI can play or open
/// provider items on the current device when that is truthful.
public protocol CompanionPlaybackLaunching: Sendable {
    func availability(for item: CompanionMediaItem) -> CompanionPlaybackAvailability
    func play(_ item: CompanionMediaItem) async throws
}

/// I describe whether one item can be opened or directly played on this host.
public struct CompanionPlaybackAvailability: Sendable {
    public let enabled: Bool
    public let mode: CompanionPlaybackMode
    public let reason: String?

    public init(enabled: Bool, mode: CompanionPlaybackMode, reason: String? = nil) {
        self.enabled = enabled
        self.mode = mode
        self.reason = reason
    }
}

/// I distinguish direct verified playback from plain app handoff.
public enum CompanionPlaybackMode: Sendable {
    case directPlayback
    case handoff
}

/// I surface local launch failures with short user-facing context.
public enum CompanionPlaybackLauncherError: Error, LocalizedError, Sendable {
    case missingPlayableReference
    case unsupportedAppleFallback

    public var errorDescription: String? {
        switch self {
        case .missingPlayableReference:
            return "I could not find a playable local reference for that item."
        case .unsupportedAppleFallback:
            return "I need an Apple Music store ID or URL before I can play that item locally."
        }
    }
}

/// I provide the smallest cross-platform launcher that can hand all three
/// providers off to truthful local playback surfaces.
public struct SystemPlaybackLauncher: CompanionPlaybackLaunching, Sendable {
    public init() {}

    public func availability(for item: CompanionMediaItem) -> CompanionPlaybackAvailability {
        localPlaybackAvailability(for: item)
    }

    public func play(_ item: CompanionMediaItem) async throws {
        let availability = localPlaybackAvailability(for: item)
        guard availability.enabled else {
            throw item.provider == .apple
                ? CompanionPlaybackLauncherError.unsupportedAppleFallback
                : CompanionPlaybackLauncherError.missingPlayableReference
        }

        if item.provider == .apple {
            try await playAppleMusic(item)
            return
        }

        guard let url = playbackURL(for: item) else {
            throw item.provider == .apple
                ? CompanionPlaybackLauncherError.unsupportedAppleFallback
                : CompanionPlaybackLauncherError.missingPlayableReference
        }

        #if canImport(UIKit)
        await MainActor.run {
            UIApplication.shared.open(url)
        }
        #elseif canImport(AppKit)
        _ = await MainActor.run {
            NSWorkspace.shared.open(url)
        }
        #else
        _ = url
        throw CompanionPlaybackLauncherError.missingPlayableReference
        #endif
    }

    private func playAppleMusic(_ item: CompanionMediaItem) async throws {
        #if canImport(MediaPlayer) && canImport(UIKit)
        if !item.id.isEmpty {
            let descriptor = MPMusicPlayerStoreQueueDescriptor(storeIDs: [item.id])
            await MainActor.run {
                let player = MPMusicPlayerController.applicationQueuePlayer
                player.setQueue(with: descriptor)
                player.play()
            }
            return
        }
        #endif

        guard let url = playbackURL(for: item) else {
            throw CompanionPlaybackLauncherError.unsupportedAppleFallback
        }

        #if canImport(UIKit)
        await MainActor.run {
            UIApplication.shared.open(url)
        }
        #elseif canImport(AppKit)
        _ = await MainActor.run {
            NSWorkspace.shared.open(url)
        }
        #else
        _ = url
        throw CompanionPlaybackLauncherError.unsupportedAppleFallback
        #endif
    }
}

/// I convert normalized daemon items into local launch URLs without teaching the view layer provider rules.
public func playbackURL(for item: CompanionMediaItem) -> URL? {
    if let explicitURL = item.url, let url = URL(string: explicitURL) {
        return url
    }

    guard let target = item.daemonPlaybackTarget else {
        return nil
    }

    if let directURL = URL(string: target), directURL.scheme?.hasPrefix("http") == true || directURL.scheme == "spotify" {
        return directURL
    }

    if target.hasPrefix("spotify:") {
        return URL(string: target)
    }

    if target.hasPrefix("youtube:video:") {
        return URL(string: "https://music.youtube.com/watch?v=\(target.replacingOccurrences(of: "youtube:video:", with: ""))")
    }

    if target.hasPrefix("youtube:playlist:") {
        return URL(string: "https://music.youtube.com/playlist?list=\(target.replacingOccurrences(of: "youtube:playlist:", with: ""))")
    }

    return nil
}

/// I keep local-play affordances honest before the UI invites the tap.
public func localPlaybackAvailability(for item: CompanionMediaItem) -> CompanionPlaybackAvailability {
    if item.provider == .apple {
        #if canImport(MediaPlayer) && canImport(UIKit)
        if item.kind == .song && !item.id.isEmpty {
            return CompanionPlaybackAvailability(enabled: true, mode: .directPlayback)
        }
        #endif

        if playbackURL(for: item) != nil {
            #if canImport(UIKit) || canImport(AppKit)
            return CompanionPlaybackAvailability(enabled: true, mode: .handoff)
            #else
            return CompanionPlaybackAvailability(
                enabled: false,
                mode: .handoff,
                reason: CompanionPlaybackLauncherError.unsupportedAppleFallback.localizedDescription
            )
            #endif
        }

        return CompanionPlaybackAvailability(
            enabled: false,
            mode: .handoff,
            reason: CompanionPlaybackLauncherError.unsupportedAppleFallback.localizedDescription
        )
    }

    if playbackURL(for: item) != nil {
        #if canImport(UIKit) || canImport(AppKit)
        return CompanionPlaybackAvailability(enabled: true, mode: .handoff)
        #else
        return CompanionPlaybackAvailability(
            enabled: false,
            mode: .handoff,
            reason: CompanionPlaybackLauncherError.missingPlayableReference.localizedDescription
        )
        #endif
    }

    return CompanionPlaybackAvailability(
        enabled: false,
        mode: .handoff,
        reason: CompanionPlaybackLauncherError.missingPlayableReference.localizedDescription
    )
}
