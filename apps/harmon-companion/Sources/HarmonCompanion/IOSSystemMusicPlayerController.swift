#if os(iOS)
import Foundation
import MediaPlayer
import UIKit

/// I bind Apple remote commands onto the system music player on iPhone or iPad.
public actor IOSSystemMusicPlayerController: ApplePlaybackControlling {
    private let player: MPMusicPlayerController

    public init(player: MPMusicPlayerController = .applicationQueuePlayer) {
        self.player = player
    }

    public func apply(_ command: AppleRemoteCommand) async throws {
        switch command.type {
        case .next:
            player.skipToNextItem()
        case .pause:
            player.pause()
        case .previous:
            player.skipToPreviousItem()
        case .play:
            try await play(command: command)
        }
    }

    public func snapshot() async -> CompanionPlaybackSnapshot {
        let currentTrack = player.nowPlayingItem.map { item in
            RemoteTrack(
                album: item.albumTitle ?? "",
                artist: item.artist ?? "",
                durationMs: Int(item.playbackDuration * 1000),
                id: item.playbackStoreID,
                imageURL: nil,
                name: item.title ?? item.playbackStoreID,
                playbackTruth: "verified",
                provider: "apple",
                uri: item.playbackStoreID.isEmpty ? nil : "apple:song:\(item.playbackStoreID)"
            )
        }

        return CompanionPlaybackSnapshot(
            currentTrack: currentTrack,
            playbackState: mapPlaybackState(player.playbackState)
        )
    }

    private func play(command: AppleRemoteCommand) async throws {
        if let storeID = command.track?.id, !storeID.isEmpty {
            let descriptor = MPMusicPlayerStoreQueueDescriptor(storeIDs: [storeID])
            player.setQueue(with: descriptor)
            player.play()
            return
        }

        guard let urlText = command.uri ?? command.track?.uri, let url = URL(string: urlText) else {
            throw ApplePlaybackControllerError.missingPlayableReference
        }

        await MainActor.run {
            UIApplication.shared.open(url)
        }
    }

    private func mapPlaybackState(_ state: MPMusicPlaybackState) -> RemotePlaybackState {
        switch state {
        case .playing:
            return .playing
        case .paused, .interrupted, .seekingBackward, .seekingForward:
            return .paused
        default:
            return .stopped
        }
    }
}
#endif
