import Combine
import Foundation

/// I provide the main SwiftUI-facing state container for the Apple companion app.
@MainActor
public final class AppleRemoteCompanionStore: ObservableObject {
    @Published public private(set) var appliedCommands: [AppleRemoteCommand] = []
    @Published public private(set) var bridgeStatus: AppleRemoteBridgeStatus?
    @Published public private(set) var currentTrack: RemoteTrack?
    @Published public private(set) var isRunning = false
    @Published public private(set) var lastError: String?
    @Published public private(set) var lastSyncAt: Date?
    @Published public private(set) var playbackState: RemotePlaybackState = .stopped

    private let service: AppleRemoteCompanionService
    private var loopGeneration = 0
    private var loopTask: Task<Void, Never>?

    public init(service: AppleRemoteCompanionService) {
        self.service = service
    }

    public func start() {
        guard loopTask == nil else {
            return
        }

        loopGeneration += 1
        let generation = loopGeneration
        isRunning = true
        lastError = nil
        loopTask = Task { [weak self] in
            guard let self else { return }
            await self.runLoop(generation: generation)
        }
    }

    public func stop() {
        loopGeneration += 1
        let task = loopTask
        loopTask = nil
        task?.cancel()
        isRunning = false
    }

    public func syncNow() async {
        await runSingleTurn(generation: loopGeneration)
    }

    private func runLoop(generation: Int) async {
        do {
            let status = try await service.connect()
            guard isCurrentLoop(generation) else { return }
            bridgeStatus = status
        } catch {
            guard isCurrentLoop(generation) else { return }
            handleSyncFailure(error)
        }

        while !Task.isCancelled && isCurrentLoop(generation) {
            await runSingleTurn(generation: generation)

            do {
                try await Task.sleep(nanoseconds: await service.heartbeatIntervalNanoseconds())
            } catch {
                break
            }
        }

        if isCurrentLoop(generation) {
            isRunning = false
            loopTask = nil
        }
    }

    private func runSingleTurn(generation: Int) async {
        do {
            let result = try await service.syncOnce()
            guard isCurrentLoop(generation) else { return }
            appliedCommands = result.appliedCommands
            bridgeStatus = result.bridgeStatus
            currentTrack = result.snapshot.currentTrack
            playbackState = result.snapshot.playbackState
            lastError = nil
            lastSyncAt = Date()
        } catch {
            guard isCurrentLoop(generation) else { return }
            handleSyncFailure(error)
        }
    }

    private func handleSyncFailure(_ error: Error) {
        bridgeStatus = nil
        currentTrack = nil
        playbackState = .stopped
        lastError = error.localizedDescription
    }

    private func isCurrentLoop(_ generation: Int) -> Bool {
        generation == loopGeneration
    }
}
