/**
 * Apple Music remote bridge and playback controller.
 *
 * I keep the iOS companion bridge here so cross-platform Apple playback stays
 * explicit and does not leak ad-hoc transport state into the HTTP daemon.
 */

import { randomUUID } from 'node:crypto';
import type { AppleMusicClient } from '@sriinnu/harmon-apple';
import type { MusicProvider } from '@sriinnu/harmon-core';
import type { TrackInfo } from '@sriinnu/harmon-protocol';
import type { RuntimePlaybackController, SessionStateResetOptions } from './provider-runtime.js';

const DEFAULT_REMOTE_COMPANION_TIMEOUT_MS = 45_000;

/** I describe one command the daemon wants the iOS Apple companion to execute. */
export interface AppleRemoteCommand {
  createdAt: string;
  id: string;
  track?: TrackInfo;
  type: 'next' | 'pause' | 'play' | 'previous' | 'seek';
  /** Target position for seek commands. */
  positionMs?: number;
  uri?: string;
}

/** I describe the currently active Apple companion device. */
export interface AppleRemoteCompanionInfo {
  appVersion?: string;
  connectedAt: string;
  deviceId: string;
  lastSeenAt: string;
  name?: string;
  platform?: string;
}

/** I describe the bridge status the daemon exposes for Apple remote playback. */
export interface AppleRemoteBridgeStatus {
  companion: AppleRemoteCompanionInfo | null;
  connected: boolean;
  currentTrack: TrackInfo | null;
  pendingCommands: number;
  playbackState: 'paused' | 'playing' | 'stopped';
}

/** I describe the registration payload the iOS companion sends on connect. */
export interface AppleRemoteCompanionRegistration {
  appVersion?: string;
  deviceId: string;
  name?: string;
  platform?: string;
}

/** I describe one companion state update pushed back into the daemon. */
export interface AppleRemoteStateUpdate {
  ackCommandId?: string;
  currentTrack?: TrackInfo | null;
  deviceId: string;
  playbackState?: 'paused' | 'playing' | 'stopped';
}

/** I describe the bridge contract shared by harmond routes and playback logic. */
export interface AppleRemoteBridge {
  acknowledgeCommand(deviceId: string, commandId: string): void;
  getStatus(): AppleRemoteBridgeStatus;
  isConnected(): boolean;
  listCommands(deviceId: string): AppleRemoteCommand[];
  queueCommand(command: Omit<AppleRemoteCommand, 'createdAt' | 'id'>): AppleRemoteCommand;
  registerCompanion(companion: AppleRemoteCompanionRegistration): AppleRemoteBridgeStatus;
  resetPlaybackState(options?: { preserveCurrentTrack?: boolean }): void;
  updateState(update: AppleRemoteStateUpdate): AppleRemoteBridgeStatus;
}

/** I create one in-memory Apple remote bridge for the active iOS companion. */
export function createAppleRemoteBridge(
  options: { companionTimeoutMs?: number } = {},
): AppleRemoteBridge {
  return new InMemoryAppleRemoteBridge(options.companionTimeoutMs ?? DEFAULT_REMOTE_COMPANION_TIMEOUT_MS);
}

/**
 * I create the Apple remote playback controller that sends commands to the iOS
 * companion instead of the local macOS Music app.
 */
export function createAppleRemotePlaybackController(options: {
  bridge: AppleRemoteBridge;
  client?: AppleMusicClient;
}): RuntimePlaybackController {
  return new AppleRemotePlaybackController(options.bridge, options.client);
}

/**
 * I keep Apple local and Apple remote playback available behind one runtime so
 * remote setup never regresses a working local macOS install.
 */
export function createAppleUnifiedPlaybackController(options: {
  bridge?: AppleRemoteBridge;
  local?: RuntimePlaybackController;
  remote?: RuntimePlaybackController;
}): RuntimePlaybackController {
  return new AppleUnifiedPlaybackController(options);
}

/** I create a playback-only Apple provider when remote control exists without catalog auth. */
export function createApplePlaybackOnlyProvider(): MusicProvider {
  return {
    name: 'apple',
    isConnected: () => true,
    async getLibraryTracks() {
      throw new Error('Apple Music catalog or library auth is required for this surface.');
    },
    async getPlaylistTracks() {
      throw new Error('Apple Music catalog or library auth is required for this surface.');
    },
    async getRecommendations() {
      throw new Error('Apple Music catalog or library auth is required for this surface.');
    },
    async getRecentlyPlayed() {
      throw new Error('Apple Music catalog or library auth is required for this surface.');
    },
    async getTopTracks() {
      throw new Error('Apple Music catalog or library auth is required for this surface.');
    },
    async getTrackFeatures(trackIds: string[]) {
      return trackIds.map(() => null);
    },
    async search() {
      throw new Error('Apple Music catalog or library auth is required for this surface.');
    },
  };
}

class InMemoryAppleRemoteBridge implements AppleRemoteBridge {
  private commands: AppleRemoteCommand[] = [];
  private companion: AppleRemoteCompanionInfo | null = null;
  private currentTrack: TrackInfo | null = null;
  private readonly timeoutMs: number;
  private playbackState: AppleRemoteBridgeStatus['playbackState'] = 'stopped';

  constructor(timeoutMs: number) {
    this.timeoutMs = timeoutMs;
  }

  acknowledgeCommand(deviceId: string, commandId: string): void {
    this.touch(deviceId);
    this.commands = this.commands.filter((command) => command.id !== commandId);
  }

  getStatus(): AppleRemoteBridgeStatus {
    const connected = this.isConnected();
    return {
      companion: this.companion,
      connected,
      currentTrack: connected ? this.currentTrack : null,
      pendingCommands: this.commands.length,
      playbackState: connected ? this.playbackState : 'stopped',
    };
  }

  isConnected(): boolean {
    if (!this.companion) {
      return false;
    }
    return Date.now() - Date.parse(this.companion.lastSeenAt) <= this.timeoutMs;
  }

  listCommands(deviceId: string): AppleRemoteCommand[] {
    this.touch(deviceId);
    return [...this.commands];
  }

  queueCommand(command: Omit<AppleRemoteCommand, 'createdAt' | 'id'>): AppleRemoteCommand {
    if (!this.isConnected()) {
      throw new Error('Apple Music remote companion is not connected.');
    }

    const queuedCommand: AppleRemoteCommand = {
      ...command,
      createdAt: new Date().toISOString(),
      id: `apple_remote_${randomUUID()}`,
    };
    this.commands.push(queuedCommand);
    return queuedCommand;
  }

  registerCompanion(companion: AppleRemoteCompanionRegistration): AppleRemoteBridgeStatus {
    const sameActiveCompanion =
      this.companion?.deviceId === companion.deviceId &&
      this.isConnected();
    if (!sameActiveCompanion) {
      this.resetPlaybackState();
    }
    const timestamp = new Date().toISOString();
    this.companion = {
      ...companion,
      connectedAt: this.companion?.deviceId === companion.deviceId ? this.companion.connectedAt : timestamp,
      lastSeenAt: timestamp,
    };
    return this.getStatus();
  }

  updateState(update: AppleRemoteStateUpdate): AppleRemoteBridgeStatus {
    this.touch(update.deviceId);
    if (update.ackCommandId) {
      this.acknowledgeCommand(update.deviceId, update.ackCommandId);
    }
    if (update.currentTrack !== undefined) {
      this.currentTrack = update.currentTrack;
    }
    if (update.playbackState) {
      this.playbackState = update.playbackState;
      if (update.playbackState === 'stopped' && update.currentTrack === undefined) {
        this.currentTrack = null;
      }
    }
    return this.getStatus();
  }

  resetPlaybackState(options: { preserveCurrentTrack?: boolean } = {}): void {
    this.commands = [];
    this.playbackState = 'stopped';
    if (!options.preserveCurrentTrack) {
      this.currentTrack = null;
    }
  }

  private touch(deviceId: string): void {
    if (!this.companion || this.companion.deviceId !== deviceId) {
      throw new Error('Apple Music remote companion is not registered for this daemon.');
    }
    this.companion = {
      ...this.companion,
      lastSeenAt: new Date().toISOString(),
    };
  }
}

class AppleUnifiedPlaybackController implements RuntimePlaybackController {
  readonly name = 'apple' as const;
  readonly supportsPause: boolean;
  private activeTarget: 'local' | 'remote' | null = null;
  private readonly bridge?: AppleRemoteBridge;
  private readonly local?: RuntimePlaybackController;
  private readonly remote?: RuntimePlaybackController;

  constructor(options: {
    bridge?: AppleRemoteBridge;
    local?: RuntimePlaybackController;
    remote?: RuntimePlaybackController;
  }) {
    this.bridge = options.bridge;
    this.local = options.local;
    this.remote = options.remote;
    this.supportsPause = Boolean(options.local?.supportsPause || options.remote?.supportsPause);
  }

  async play(options?: { uri?: string; trackId?: string }): Promise<void> {
    await this.getPlaybackTarget(true).play(options);
  }

  async pause(): Promise<void> {
    await this.getPlaybackTarget(true).pause();
  }

  async next(): Promise<void> {
    await this.getPlaybackTarget(true).next();
  }

  async previous(): Promise<void> {
    await this.getPlaybackTarget(true).previous();
  }

  async getNowPlaying(): Promise<TrackInfo | null> {
    if (this.activeTarget === 'remote' && !this.isRemoteConnected()) {
      return null;
    }
    return this.getPlaybackTarget(false).getNowPlaying();
  }

  async addToQueue(trackUri: string, track?: TrackInfo): Promise<void> {
    if (this.activeTarget === 'local' && this.local) {
      await this.local.addToQueue(trackUri, track);
      return;
    }
    if (this.activeTarget === 'remote' && this.remote) {
      await this.remote.addToQueue(trackUri, track);
      return;
    }

    if (this.local) {
      await this.local.addToQueue(trackUri, track);
    }
    if (this.remote) {
      await this.remote.addToQueue(trackUri, track);
    }
  }

  async resetSessionState(options: SessionStateResetOptions = {}): Promise<void> {
    this.activeTarget = null;
    await Promise.all([
      this.local?.resetSessionState(options),
      this.remote?.resetSessionState(options),
    ]);
  }

  private getPlaybackTarget(lock: boolean): RuntimePlaybackController {
    const remoteReady = this.isRemoteConnected();
    if (this.activeTarget === 'remote' && this.remote && remoteReady) {
      return this.remote;
    }
    // A local lock must not outlive the reason for it: the lock exists so a
    // session keeps talking to one surface, but a remote player registering
    // IS the user saying "play here now". Without this re-check, one
    // AppleScript fallback (e.g. while the browser tab was throttled or not
    // yet enabled) pins every future play to Music.app forever.
    if (this.activeTarget === 'local' && this.local && !remoteReady) {
      return this.local;
    }

    const target = remoteReady && this.remote
      ? { controller: this.remote, name: 'remote' as const }
      : this.local
        ? { controller: this.local, name: 'local' as const }
        : this.remote
          ? { controller: this.remote, name: 'remote' as const }
          : null;

    if (!target) {
      throw new Error('Apple Music playback is not configured on this daemon instance.');
    }

    if (lock) {
      this.activeTarget = target.name;
    }
    return target.controller;
  }

  private isRemoteConnected(): boolean {
    return Boolean(this.bridge?.isConnected() && this.remote);
  }
}

class AppleRemotePlaybackController implements RuntimePlaybackController {
  readonly name = 'apple' as const;
  readonly supportsPause = true;
  private readonly bridge: AppleRemoteBridge;
  private readonly client?: AppleMusicClient;
  private currentTrack: TrackInfo | null = null;
  private history: TrackInfo[] = [];
  private queuedTracks: TrackInfo[] = [];

  constructor(bridge: AppleRemoteBridge, client?: AppleMusicClient) {
    this.bridge = bridge;
    this.client = client;
  }

  async play(options?: { uri?: string; trackId?: string }): Promise<void> {
    if (options?.uri || options?.trackId) {
      const track = createMinimalAppleTrack(options.uri ?? `apple:song:${options.trackId}`);
      await this.playTrack(track);
      return;
    }

    const nextTrack = this.queuedTracks[0] ?? null;
    if (nextTrack) {
      await this.playTrack(nextTrack);
      this.queuedTracks.shift();
      return;
    }

    this.bridge.queueCommand({ type: 'play' });
  }

  async pause(): Promise<void> {
    this.bridge.queueCommand({ type: 'pause' });
  }

  async next(): Promise<void> {
    const nextTrack = this.queuedTracks[0] ?? null;
    if (nextTrack) {
      await this.playTrack(nextTrack);
      this.queuedTracks.shift();
      return;
    }
    this.bridge.queueCommand({ type: 'next' });
  }

  async previous(): Promise<void> {
    const previousTrack = this.history.at(-1) ?? null;
    if (previousTrack) {
      await this.playTrack(previousTrack, false);
      this.history.pop();
      return;
    }
    this.bridge.queueCommand({ type: 'previous' });
  }

  async getNowPlaying(): Promise<TrackInfo | null> {
    const status = this.bridge.getStatus();
    if (!status.connected) {
      return null;
    }
    if (status.currentTrack) {
      this.currentTrack = status.currentTrack;
      return { ...status.currentTrack, playbackTruth: 'verified' };
    }
    return this.currentTrack ? { ...this.currentTrack, playbackTruth: 'daemon-managed' } : null;
  }

  async addToQueue(_trackUri: string, track?: TrackInfo): Promise<void> {
    this.queuedTracks.push(track ?? createMinimalAppleTrack(_trackUri));
  }

  async resetSessionState(options: SessionStateResetOptions = {}): Promise<void> {
    this.queuedTracks = [];
    this.bridge.resetPlaybackState({ preserveCurrentTrack: options.preserveCurrentTrack });
    if (!options.preserveHistory) {
      this.history = [];
    }
    if (!options.preserveCurrentTrack) {
      this.currentTrack = null;
    }
  }

  private dequeueNextTrack(): TrackInfo | null {
    return this.queuedTracks.shift() ?? null;
  }

  private async playTrack(track: TrackInfo, rememberCurrent = true): Promise<void> {
    const uri = await this.resolvePlayableUrl(track);
    const nextTrack = { ...track, provider: 'apple' as const, uri };
    this.bridge.queueCommand({ type: 'play', track: nextTrack, uri });
    if (rememberCurrent && this.currentTrack) {
      this.history.push(this.currentTrack);
    }
    this.currentTrack = nextTrack;
  }

  private async resolvePlayableUrl(track: TrackInfo): Promise<string> {
    if (track.uri?.startsWith('http://') || track.uri?.startsWith('https://')) {
      return track.uri;
    }
    if (!this.client) {
      throw new Error('Apple Music remote playback needs a direct URL or an Apple Music client to resolve tracks.');
    }
    if (track.name && track.artist) {
      const result = await this.client.search(`${track.artist} ${track.name}`, ['songs'], { limit: 1 });
      const match = result.songs.find((song) => typeof song.url === 'string' && song.url.length > 0);
      if (match?.url) {
        return match.url;
      }
    }
    if (track.id) {
      const song = await this.client.getSong(track.id);
      if (song?.url) {
        return song.url;
      }
    }
    throw new Error('Apple Music track could not be resolved to a playable URL.');
  }
}

function createMinimalAppleTrack(uriOrId: string): TrackInfo {
  return {
    album: '',
    artist: 'Apple Music',
    durationMs: 0,
    id: uriOrId.split(':').pop() || uriOrId,
    name: uriOrId.split(':').pop() || uriOrId,
    provider: 'apple',
    uri: uriOrId,
  };
}
