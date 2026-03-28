/**
 * History-backed provider wrappers for harmond.
 *
 * I keep local-history sources in the daemon because they are Harmon runtime
 * semantics, not raw third-party API semantics.
 */

import type { MusicProvider } from '@sriinnu/harmon-core';
import type { MusicProviderName, TrackInfo } from '@sriinnu/harmon-protocol';
import { HarmonStore } from '@sriinnu/harmon-store';

const DEFAULT_HISTORY_SCAN_LIMIT = 4000;

export interface HistoryBackedProviderOptions {
  provider: Extract<MusicProviderName, 'apple' | 'youtube'>;
  baseProvider: MusicProvider;
  store: HarmonStore;
  topTracksMode?: 'local' | 'delegate';
  recentPlaysMode?: 'local' | 'delegate' | 'delegate-or-local';
  historyScanLimit?: number;
}

/**
 * I wrap a provider with Harmon-local playback history so `topTracks` and weak
 * `recentPlays` surfaces stay truthful without inventing upstream APIs.
 */
export function createHistoryBackedProvider(options: HistoryBackedProviderOptions): MusicProvider {
  return new HistoryBackedProvider(options);
}

class HistoryBackedProvider implements MusicProvider {
  readonly name: Extract<MusicProviderName, 'apple' | 'youtube'>;

  private readonly baseProvider: MusicProvider;
  private readonly historyScanLimit: number;
  private readonly recentPlaysMode: 'local' | 'delegate' | 'delegate-or-local';
  private readonly store: HarmonStore;
  private readonly topTracksMode: 'local' | 'delegate';

  constructor(options: HistoryBackedProviderOptions) {
    this.baseProvider = options.baseProvider;
    this.historyScanLimit = options.historyScanLimit ?? DEFAULT_HISTORY_SCAN_LIMIT;
    this.name = options.provider;
    this.recentPlaysMode = options.recentPlaysMode ?? 'delegate';
    this.store = options.store;
    this.topTracksMode = options.topTracksMode ?? 'local';
  }

  isConnected(): boolean {
    return this.baseProvider.isConnected();
  }

  async search(query: string, limit?: number): Promise<TrackInfo[]> {
    return this.baseProvider.search(query, limit);
  }

  async getLibraryTracks(options?: { limit?: number; offset?: number }): Promise<TrackInfo[]> {
    return this.baseProvider.getLibraryTracks(options);
  }

  async getTopTracks(options?: { limit?: number; timeRange?: string }): Promise<TrackInfo[]> {
    if (this.topTracksMode === 'delegate') {
      return this.baseProvider.getTopTracks(options);
    }
    return this.getTopTracksFromHistory(options?.limit ?? 20);
  }

  async getRecentlyPlayed(options?: { limit?: number }): Promise<TrackInfo[]> {
    if (this.recentPlaysMode === 'delegate') {
      return this.baseProvider.getRecentlyPlayed(options);
    }

    if (this.recentPlaysMode === 'local') {
      return this.getRecentlyPlayedFromHistory(options?.limit ?? 20);
    }

    try {
      const recentTracks = await this.baseProvider.getRecentlyPlayed(options);
      if (recentTracks.length > 0) {
        return recentTracks;
      }
    } catch (error) {
      if (!isUnsupportedHistoryFallbackError(error)) {
        throw error;
      }
    }

    return this.getRecentlyPlayedFromHistory(options?.limit ?? 20);
  }

  async getPlaylistTracks(playlistId: string, options?: { limit?: number }): Promise<TrackInfo[]> {
    return this.baseProvider.getPlaylistTracks(playlistId, options);
  }

  async getRecommendations(options: { seedTrackIds?: string[]; limit?: number }): Promise<TrackInfo[]> {
    return this.baseProvider.getRecommendations(options);
  }

  async getTrackFeatures(trackIds: string[]) {
    return this.baseProvider.getTrackFeatures(trackIds);
  }

  /**
   * I derive local top tracks from daemon-observed playback starts so Apple and
   * YouTube can expose a truthful history-backed affinity surface.
   */
  private async getTopTracksFromHistory(limit: number): Promise<TrackInfo[]> {
    const counts = new Map<string, { count: number; lastPlayedAt: string; track: TrackInfo }>();
    for (const eventTrack of await this.getHistoryTracks()) {
      const key = `${eventTrack.provider ?? this.name}:${eventTrack.id}`;
      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
        continue;
      }
      counts.set(key, {
        count: 1,
        lastPlayedAt: eventTrack.playedAt ?? '',
        track: stripPlayedAt(eventTrack),
      });
    }

    return [...counts.values()]
      .sort((left, right) => {
        if (right.count !== left.count) {
          return right.count - left.count;
        }
        return right.lastPlayedAt.localeCompare(left.lastPlayedAt);
      })
      .slice(0, limit)
      .map((entry) => entry.track);
  }

  /**
   * I derive recent tracks from daemon-observed playback so browser-handoff and
   * catalog-only providers can still seed recent-play sessions honestly.
   */
  private async getRecentlyPlayedFromHistory(limit: number): Promise<TrackInfo[]> {
    const seen = new Set<string>();
    const recentTracks: TrackInfo[] = [];

    for (const eventTrack of await this.getHistoryTracks()) {
      const key = `${eventTrack.provider ?? this.name}:${eventTrack.id}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      recentTracks.push(stripPlayedAt(eventTrack));
      if (recentTracks.length >= limit) {
        break;
      }
    }

    return recentTracks;
  }

  private async getHistoryTracks(): Promise<TrackInfoWithHistory[]> {
    const events = await this.store.getRecentEvents(this.historyScanLimit);
    const historyTracks: TrackInfoWithHistory[] = [];

    for (const event of events) {
      if (event.type !== 'track.started') {
        continue;
      }

      const track = parseTrackEvent(event.payload, this.name, event.createdAt);
      if (track) {
        historyTracks.push(track);
      }
    }

    return historyTracks;
  }
}

interface TrackInfoWithHistory extends TrackInfo {
  playedAt: string;
}

function parseTrackEvent(
  payload: string,
  provider: Extract<MusicProviderName, 'apple' | 'youtube'>,
  createdAt: string,
): TrackInfoWithHistory | null {
  try {
    const parsed = JSON.parse(payload) as { track?: unknown };
    if (!isTrackInfo(parsed.track) || parsed.track.provider !== provider) {
      return null;
    }
    return {
      ...parsed.track,
      playedAt: createdAt,
    };
  } catch {
    return null;
  }
}

function isTrackInfo(value: unknown): value is TrackInfo {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const track = value as Record<string, unknown>;
  return (
    typeof track.id === 'string' &&
    track.id.length > 0 &&
    typeof track.name === 'string' &&
    track.name.length > 0 &&
    typeof track.artist === 'string' &&
    track.artist.length > 0 &&
    typeof track.album === 'string' &&
    typeof track.durationMs === 'number'
  );
}

function isUnsupportedHistoryFallbackError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    /not available|not supported|not implemented|unavailable|user token required/i.test(error.message) ||
    /Apple Music API error:\s*(401|403|404)\b/i.test(error.message)
  );
}

function stripPlayedAt(track: TrackInfoWithHistory): TrackInfo {
  return {
    album: track.album,
    artist: track.artist,
    artistIds: track.artistIds,
    durationMs: track.durationMs,
    id: track.id,
    imageUrl: track.imageUrl,
    isrc: track.isrc,
    name: track.name,
    playbackTruth: track.playbackTruth,
    provider: track.provider,
    uri: track.uri,
  };
}
