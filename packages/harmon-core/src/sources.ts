/**
 * Candidate fetching from music providers (provider-agnostic)
 */

import type { TrackInfo } from '@athena/harmon-protocol';
import type { MusicProvider, SourcesConfig, TrackWithFeatures, AudioFeatures } from './types.js';

/** Default features for tracks from providers without audio analysis (Apple Music, YouTube Music) */
const DEFAULT_FEATURES: AudioFeatures = {
  energy: 0.5, instrumentalness: 0.1, speechiness: 0.1, valence: 0.5,
  acousticness: 0.3, tempo: 120, danceability: 0.5, liveness: 0.2,
  loudness: -8, key: 5, mode: 1, timeSignature: 4,
};

/**
 * Fetch candidate tracks from configured sources
 *
 * @param provider Music provider (Spotify, Apple Music, YouTube Music, etc.)
 * @param sources Sources configuration
 * @param targetCount Target number of candidates
 * @returns Array of tracks with audio features
 */
export async function fetchCandidates(
  provider: MusicProvider,
  sources: SourcesConfig,
  targetCount: number
): Promise<TrackWithFeatures[]> {
  const candidates: TrackWithFeatures[] = [];
  const perSource = Math.ceil(targetCount / countActiveSources(sources));

  try {
    // Liked/library tracks
    if (sources.likedTracks) {
      const tracks = await provider.getLibraryTracks({ limit: perSource });
      const withFeatures = await enrichWithFeatures(provider, tracks);
      candidates.push(...withFeatures);
    }

    // Top tracks
    if (sources.topTracks) {
      const tracks = await provider.getTopTracks({ limit: perSource });
      const withFeatures = await enrichWithFeatures(provider, tracks);
      candidates.push(...withFeatures);
    }

    // Recent plays
    if (sources.recentPlays) {
      const tracks = await provider.getRecentlyPlayed({ limit: perSource });
      const withFeatures = await enrichWithFeatures(provider, tracks);
      candidates.push(...withFeatures);
    }

    // Seed playlists
    if (sources.seedPlaylists && sources.seedPlaylists.length > 0) {
      for (const playlistId of sources.seedPlaylists.slice(0, 3)) {
        const tracks = await provider.getPlaylistTracks(
          extractId(playlistId),
          { limit: Math.ceil(perSource / sources.seedPlaylists.length) }
        );
        const withFeatures = await enrichWithFeatures(provider, tracks);
        candidates.push(...withFeatures);
      }
    }

    // Discovery via recommendations
    if (sources.discovery?.enabled) {
      const discoveryCount = Math.ceil(
        targetCount * (sources.discovery.ratio || 0.15)
      );

      const seedTracks = candidates.slice(0, 5).map(t => t.id);

      if (seedTracks.length > 0) {
        const recommendations = await provider.getRecommendations({
          seedTrackIds: seedTracks,
          limit: discoveryCount,
        });
        const withFeatures = await enrichWithFeatures(provider, recommendations);
        candidates.push(...withFeatures);
      }
    }

    // Deduplicate by track ID
    return deduplicateTracks(candidates);
  } catch (error) {
    console.error('Error fetching candidates:', error);
    return candidates;  // Return what we have
  }
}

/**
 * Enrich tracks with audio features.
 * Uses positional correspondence — provider.getTrackFeatures returns
 * (AudioFeatures | null)[] with nulls preserved at correct indices.
 */
async function enrichWithFeatures(
  provider: MusicProvider,
  tracks: TrackInfo[]
): Promise<TrackWithFeatures[]> {
  if (tracks.length === 0) {
    return [];
  }

  const trackIds = tracks.map(t => t.id);
  let featureResults = await provider.getTrackFeatures(trackIds);

  // If the provider breaks positional correspondence, I prefer
  // a safe full fallback over silently attaching the wrong features
  // to the wrong tracks.
  if (featureResults.length !== tracks.length) {
    console.warn(
      `Feature result length mismatch: expected ${tracks.length}, received ${featureResults.length}. Falling back to defaults.`
    );
    featureResults = Array.from({ length: tracks.length }, () => null);
  }

  // Match features to tracks by position (nulls preserved).
  // Tracks without features get DEFAULT_FEATURES so non-Spotify providers still work.
  const enriched: TrackWithFeatures[] = [];
  for (let i = 0; i < tracks.length; i++) {
    const feature = featureResults[i];
    enriched.push({
      ...tracks[i],
      features: feature || DEFAULT_FEATURES,
    });
  }

  return enriched;
}

/**
 * Remove duplicate tracks by ID
 */
function deduplicateTracks(tracks: TrackWithFeatures[]): TrackWithFeatures[] {
  const seen = new Set<string>();
  const unique: TrackWithFeatures[] = [];

  for (const track of tracks) {
    if (!seen.has(track.id)) {
      seen.add(track.id);
      unique.push(track);
    }
  }

  return unique;
}

/**
 * Count active sources for distribution
 */
function countActiveSources(sources: SourcesConfig): number {
  let count = 0;

  if (sources.likedTracks) count++;
  if (sources.topTracks) count++;
  if (sources.recentPlays) count++;
  if (sources.seedPlaylists && sources.seedPlaylists.length > 0) count++;
  if (sources.discovery?.enabled) count++;

  return Math.max(count, 1);
}

/**
 * Extract provider ID from URI or URL
 */
function extractId(uri: string): string {
  // Spotify URIs
  if (uri.startsWith('spotify:')) {
    return uri.split(':').pop() || uri;
  }
  // Spotify/YouTube URLs
  if (uri.includes('spotify.com/') || uri.includes('youtube.com/') || uri.includes('music.apple.com/')) {
    const parts = uri.split('/');
    return parts[parts.length - 1].split('?')[0];
  }
  return uri;
}
