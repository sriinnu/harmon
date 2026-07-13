/**
 * Provider runtime helpers for harmond.
 *
 * I keep daemon-owned playback controllers here so the HTTP surface can wire
 * Apple Music and YouTube Music honestly without pushing OS/browser concerns
 * down into the provider client packages.
 */

import { execFile } from 'node:child_process';
import { accessSync, constants as fsConstants } from 'node:fs';
import { delimiter, join } from 'node:path';
import { promisify } from 'node:util';
import type { TrackInfo, MusicProviderName } from '@sriinnu/harmon-protocol';
import type { MusicProvider, PlaybackController } from '@sriinnu/harmon-core';
import type { AppleMusicClient } from '@sriinnu/harmon-apple';

const execFileAsync = promisify(execFile);

/**
 * I describe one daemon-owned provider runtime: provider data surface,
 * playback surface, and the runtime metadata the daemon exposes publicly.
 */
export interface ProviderRuntime {
  name: MusicProviderName;
  provider: MusicProvider;
  playback: RuntimePlaybackController;
  playbackMode: 'native' | 'applescript' | 'browser-handoff' | 'remote';
  autoStartSession: boolean;
}

/**
 * I describe how daemon-owned playback state should be reset between sessions.
 */
export interface SessionStateResetOptions {
  preserveCurrentTrack?: boolean;
  preserveHistory?: boolean;
}

/**
 * I extend the shared playback contract with daemon-only lifecycle helpers.
 */
export interface RuntimePlaybackController extends PlaybackController {
  readonly supportsPause: boolean;
  resetSessionState(options?: SessionStateResetOptions): Promise<void>;
}

/**
 * I describe whether the host can launch browser-handoff playback.
 */
export interface BrowserLaunchSupport {
  available: boolean;
  launcher?: 'open' | 'cmd' | 'xdg-open';
  reason?: string;
}

/**
 * I wrap a stateless playback controller so the daemon can treat every provider
 * runtime uniformly when clearing per-session state.
 */
export function createRuntimePlaybackController(
  playback: PlaybackController,
  options: { supportsPause?: boolean } = {},
): RuntimePlaybackController {
  return new RuntimePlaybackControllerAdapter(playback, options.supportsPause ?? true);
}

/**
 * I create the Apple Music playback controller that bridges queue-driven engine
 * sessions into local Apple Music playback on macOS.
 */
export function createAppleMusicPlaybackController(client: AppleMusicClient): RuntimePlaybackController {
  return new AppleMusicPlaybackController(client);
}

/**
 * I create the browser-handoff playback controller for YouTube Music.
 */
export function createYouTubeMusicPlaybackController(): RuntimePlaybackController {
  return new BrowserQueuePlaybackController('youtube');
}

/**
 * I check whether the current host can launch browser-handoff playback
 * without assuming Linux always ships `xdg-open`.
 */
export function getBrowserLaunchSupport(
  platform: NodeJS.Platform = process.platform,
  pathEnv: string | undefined = process.env.PATH,
): BrowserLaunchSupport {
  if (platform === 'darwin') {
    return { available: true, launcher: 'open' };
  }

  if (platform === 'win32') {
    return { available: true, launcher: 'cmd' };
  }

  if (!pathEnv) {
    return { available: false, reason: 'Browser handoff requires xdg-open on PATH.' };
  }

  for (const segment of pathEnv.split(delimiter)) {
    if (!segment) {
      continue;
    }

    try {
      accessSync(join(segment, 'xdg-open'), fsConstants.X_OK);
      return { available: true, launcher: 'xdg-open' };
    } catch {
      // I keep scanning PATH until I find an executable launcher.
    }
  }

  return { available: false, reason: 'Browser handoff requires xdg-open on PATH.' };
}

class RuntimePlaybackControllerAdapter implements RuntimePlaybackController {
  readonly supportsPause: boolean;
  private playback: PlaybackController;

  constructor(playback: PlaybackController, supportsPause: boolean) {
    this.playback = playback;
    this.supportsPause = supportsPause;
  }

  get name(): RuntimePlaybackController['name'] {
    return this.playback.name;
  }

  async play(options?: { uri?: string; trackId?: string }): Promise<void> {
    await this.playback.play(options);
  }

  async pause(): Promise<void> {
    await this.playback.pause();
  }

  async next(): Promise<void> {
    await this.playback.next();
  }

  async previous(): Promise<void> {
    await this.playback.previous();
  }

  async seek(positionMs: number): Promise<void> {
    await this.playback.seek?.(positionMs);
  }

  async setVolume(volumePercent: number): Promise<void> {
    await this.playback.setVolume?.(volumePercent);
  }

  async setShuffle(state: boolean): Promise<void> {
    await this.playback.setShuffle?.(state);
  }

  async setRepeat(state: 'off' | 'track' | 'context'): Promise<void> {
    await this.playback.setRepeat?.(state);
  }

  async getNowPlaying(): Promise<TrackInfo | null> {
    return withPlaybackTruth(await this.playback.getNowPlaying(), 'verified');
  }

  async addToQueue(trackUri: string, track?: TrackInfo): Promise<void> {
    await this.playback.addToQueue(trackUri, track);
  }

  async resetSessionState(): Promise<void> {
    // I keep Spotify/native playback stateless at the daemon layer.
  }
}

class AppleMusicPlaybackController implements RuntimePlaybackController {
  readonly name = 'apple' as const;
  readonly supportsPause = true;
  private client: AppleMusicClient;
  private queuedTracks: TrackInfo[] = [];
  private history: TrackInfo[] = [];
  private currentTrack: TrackInfo | null = null;

  constructor(client: AppleMusicClient) {
    this.client = client;
  }

  async play(options?: { uri?: string; trackId?: string }): Promise<void> {
    if (options?.uri || options?.trackId) {
      const track = createMinimalTrack('apple', options.uri ?? `apple:song:${options.trackId}`);
      await this.playTrack(track);
      return;
    }

    const nextTrack = this.dequeueNextTrack();
    if (nextTrack) {
      await this.playTrack(nextTrack);
      return;
    }

    await runAppleScriptCommand('play');
    this.currentTrack = await this.getNowPlaying();
  }

  async pause(): Promise<void> {
    await runAppleScriptCommand('pause');
  }

  async next(): Promise<void> {
    const nextTrack = this.dequeueNextTrack();
    if (nextTrack) {
      await this.playTrack(nextTrack);
      return;
    }

    await runAppleScriptCommand('next track');
    this.currentTrack = await this.readLiveTrack();
  }

  async previous(): Promise<void> {
    const previousTrack = this.history.pop();
    if (previousTrack) {
      await this.playTrack(previousTrack, false);
      return;
    }

    await runAppleScriptCommand('previous track');
    this.currentTrack = await this.readLiveTrack();
  }

  async getNowPlaying(): Promise<TrackInfo | null> {
    const liveTrack = await this.readLiveTrack();
    if (!liveTrack) {
      this.currentTrack = null;
      return null;
    }
    this.currentTrack = liveTrack;
    return liveTrack;
  }

  async addToQueue(_trackUri: string, track?: TrackInfo): Promise<void> {
    if (!track) {
      return;
    }
    this.queuedTracks.push(track);
  }

  async resetSessionState(options: SessionStateResetOptions = {}): Promise<void> {
    this.queuedTracks = [];
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
    const url = await this.resolvePlayableUrl(track);
    if (rememberCurrent && this.currentTrack) {
      this.history.push(this.currentTrack);
    }
    this.currentTrack = { ...track, uri: url };
    await runAppleMusicUrl(url);
  }

  /**
   * I resolve provider tracks to a real Apple Music URL so library-sourced
   * tracks can still be played via AppleScript.
   */
  private async resolvePlayableUrl(track: TrackInfo): Promise<string> {
    // Only hand Apple Music URLs to `open location` — this path drives the
    // desktop Music app, so arbitrary http(s) targets are not acceptable.
    const appleUrl = normalizeAppleMusicUrl(track.uri);
    if (appleUrl) {
      return appleUrl;
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

  private async readLiveTrack(): Promise<TrackInfo | null> {
    const output = await runAppleScript(`
tell application "Music"
  if player state is stopped then
    return ""
  end if
  set trackName to name of current track
  set artistName to artist of current track
  set albumName to album of current track
  set trackDuration to duration of current track
  return trackName & linefeed & artistName & linefeed & albumName & linefeed & trackDuration
end tell
`);

    const [name, artist, album, durationSeconds] = output.split('\n');
    if (!name || !artist) {
      return null;
    }

    const currentTrackMatchesLiveTrack =
      this.currentTrack?.name === name &&
      this.currentTrack?.artist === artist;

    return {
      id: currentTrackMatchesLiveTrack ? this.currentTrack?.id ?? `${artist}:${name}` : `${artist}:${name}`,
      name,
      artist,
      album: album ?? '',
      durationMs: Math.max(0, Number.parseFloat(durationSeconds || '0') * 1000),
      playbackTruth: 'verified',
      uri: currentTrackMatchesLiveTrack ? this.currentTrack?.uri : undefined,
      provider: 'apple',
    };
  }
}

class BrowserQueuePlaybackController implements RuntimePlaybackController {
  readonly name = 'youtube' as const;
  readonly supportsPause = false;
  private provider: 'youtube';
  private queuedTracks: TrackInfo[] = [];
  private history: TrackInfo[] = [];
  private currentTrack: TrackInfo | null = null;

  constructor(provider: 'youtube') {
    this.provider = provider;
  }

  async play(options?: { uri?: string; trackId?: string }): Promise<void> {
    if (options?.uri || options?.trackId) {
      const track = createMinimalTrack(this.provider, options.uri ?? `${this.provider}:video:${options.trackId}`);
      await this.playTrack(track);
      return;
    }

    const nextTrack = this.dequeueNextTrack();
    if (!nextTrack) {
      if (this.currentTrack) {
        await this.playTrack(this.currentTrack, false);
        return;
      }
      throw new Error('YouTube Music queue is empty. Start a session or add tracks before playback.');
    }

    await this.playTrack(nextTrack);
  }

  async pause(): Promise<void> {
    throw new Error('YouTube Music pause is not supported in browser-handoff mode.');
  }

  async next(): Promise<void> {
    const nextTrack = this.dequeueNextTrack();
    if (!nextTrack) {
      throw new Error('YouTube Music queue is empty. Start a session or add tracks before skipping.');
    }
    await this.playTrack(nextTrack);
  }

  async previous(): Promise<void> {
    const previousTrack = this.history.pop();
    if (!previousTrack) {
      throw new Error('YouTube Music playback history is empty.');
    }
    await this.playTrack(previousTrack, false);
  }

  async getNowPlaying(): Promise<TrackInfo | null> {
    return withPlaybackTruth(this.currentTrack, 'daemon-managed');
  }

  async addToQueue(_trackUri: string, track?: TrackInfo): Promise<void> {
    this.queuedTracks.push(track ?? createMinimalTrack(this.provider, _trackUri));
  }

  async resetSessionState(options: SessionStateResetOptions = {}): Promise<void> {
    this.queuedTracks = [];
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
    const url = normalizeYouTubePlaybackUrl(track.uri ?? track.id);
    if (!url) {
      throw new Error('YouTube Music track could not be resolved to a playable URL.');
    }

    const nextTrack: TrackInfo = {
      ...track,
      uri: url,
      provider: this.provider,
    };

    await openUrl(url);

    if (rememberCurrent && this.currentTrack) {
      this.history.push(this.currentTrack);
    }
    this.currentTrack = nextTrack;
  }
}

function createMinimalTrack(provider: MusicProviderName, uriOrId: string): TrackInfo {
  const url = provider === 'youtube' ? normalizeYouTubePlaybackUrl(uriOrId) : uriOrId;
  const fallbackId = uriOrId.split(':').pop() || uriOrId;

  return {
    id: fallbackId,
    name: fallbackId,
    artist: provider === 'youtube' ? 'YouTube Music' : 'Apple Music',
    album: '',
    durationMs: 0,
    uri: url ?? uriOrId,
    provider,
  };
}

function normalizeAppleMusicUrl(value: string | undefined): string | null {
  if (!value || !/^https?:\/\//.test(value)) {
    return null;
  }
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    if (host === 'music.apple.com' || host.endsWith('.music.apple.com') || host === 'itunes.apple.com') {
      parsed.protocol = 'https:';
      return parsed.toString();
    }
  } catch {
    return null;
  }
  return null;
}

function normalizeYouTubePlaybackUrl(value: string): string | null {
  if (!value) {
    return null;
  }
  if (value.startsWith('youtube:video:')) {
    return `https://music.youtube.com/watch?v=${value.split(':').pop()}`;
  }
  // Accept every real-world YouTube link shape (youtu.be shares, mobile,
  // plain http) and normalize to a canonical https URL on an allowed host.
  if (/^https?:\/\//.test(value)) {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      return null;
    }
    const host = parsed.hostname.toLowerCase();
    if (host === 'youtu.be') {
      const id = parsed.pathname.split('/').filter(Boolean)[0];
      return id ? `https://music.youtube.com/watch?v=${id}` : null;
    }
    if (host === 'music.youtube.com' || host === 'www.youtube.com' || host === 'youtube.com' || host === 'm.youtube.com') {
      parsed.protocol = 'https:';
      if (host === 'youtube.com' || host === 'm.youtube.com') {
        parsed.hostname = 'www.youtube.com';
      }
      return parsed.toString();
    }
    return null;
  }
  if (/^[a-zA-Z0-9_-]{6,}$/.test(value)) {
    return `https://music.youtube.com/watch?v=${value}`;
  }
  return null;
}

async function runAppleMusicUrl(url: string): Promise<void> {
  const escapedUrl = escapeAppleScriptString(url);
  await runAppleScript(`
tell application "Music"
  activate
  open location "${escapedUrl}"
end tell
`);
}

async function runAppleScriptCommand(command: string): Promise<void> {
  await runAppleScript(`tell application "Music" to ${command}`);
}

async function runAppleScript(script: string): Promise<string> {
  if (process.platform !== 'darwin') {
    throw new Error('Apple Music local playback is only supported on macOS.');
  }
  const result = await execFileAsync('osascript', ['-e', script]);
  return result.stdout.trim();
}

function escapeAppleScriptString(value: string): string {
  return value
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

async function openUrl(url: string): Promise<void> {
  const support = getBrowserLaunchSupport();
  if (!support.available || !support.launcher) {
    throw new Error(support.reason ?? 'Browser handoff is not available on this host.');
  }

  if (support.launcher === 'open') {
    await execFileAsync('open', [url]);
    return;
  }

  if (support.launcher === 'cmd') {
    await execFileAsync('cmd', ['/c', 'start', '', url]);
    return;
  }

  await execFileAsync('xdg-open', [url]);
}

function withPlaybackTruth(
  track: TrackInfo | null,
  playbackTruth: NonNullable<TrackInfo['playbackTruth']>,
): TrackInfo | null {
  if (!track) {
    return null;
  }

  return {
    ...track,
    playbackTruth,
  };
}
