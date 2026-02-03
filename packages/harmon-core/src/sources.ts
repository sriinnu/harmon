/**
 * Candidate fetching from Spotify sources
 */

import type { SpotifyClient } from '@athena/harmon-spotify';
import type { SourcesConfig, TrackWithFeatures } from './types.js';

/**
 * Fetch candidate tracks from configured sources
 *
 * @param client Spotify client
 * @param sources Sources configuration
 * @param targetCount Target number of candidates
 * @returns Array of tracks with audio features
 */
export async function fetchCandidates(
  client: SpotifyClient,
  sources: SourcesConfig,
  targetCount: number
): Promise<TrackWithFeatures[]> {
  const candidates: TrackWithFeatures[] = [];
  const perSource = Math.ceil(targetCount / countActiveSources(sources));

  try {
    // Liked tracks
    if (sources.likedTracks) {
      const liked = await client.getSavedTracks({ limit: perSource });
      const tracks = liked.items.map(item => item.track);
      const withFeatures = await enrichWithFeatures(client, tracks);
      candidates.push(...withFeatures);
    }

    // Top tracks
    if (sources.topTracks) {
      const top = await client.getTopTracks({
        timeRange: 'medium_term',
        limit: perSource
      });
      const withFeatures = await enrichWithFeatures(client, top.items);
      candidates.push(...withFeatures);
    }

    // Recent plays
    if (sources.recentPlays) {
      const recent = await client.getRecentlyPlayed({ limit: perSource });
      const tracks = recent.items.map(item => item.track);
      const withFeatures = await enrichWithFeatures(client, tracks);
      candidates.push(...withFeatures);
    }

    // Seed playlists
    if (sources.seedPlaylists && sources.seedPlaylists.length > 0) {
      for (const playlistId of sources.seedPlaylists.slice(0, 3)) {
        const playlist = await client.getPlaylistTracks(
          extractId(playlistId),
          { limit: Math.ceil(perSource / sources.seedPlaylists.length) }
        );
        const tracks = playlist.items.map(item => item.track);
        const withFeatures = await enrichWithFeatures(client, tracks);
        candidates.push(...withFeatures);
      }
    }

    // Discovery via recommendations
    if (sources.discovery?.enabled) {
      const discoveryCount = Math.ceil(
        targetCount * (sources.discovery.ratio || 0.15)
      );

      // Use seed artists or top tracks as seeds
      const seedTracks = candidates.slice(0, 5).map(t => t.id);

      if (seedTracks.length > 0) {
        const recommendations = await client.getRecommendations({
          seedTracks,
          limit: discoveryCount,
        });
        const withFeatures = await enrichWithFeatures(client, recommendations);
        candidates.push(...withFeatures);
      }
    }

    // Deduplicate by track ID
    const unique = deduplicateTracks(candidates);

    return unique;
  } catch (error) {
    console.error('Error fetching candidates:', error);
    return candidates;  // Return what we have
  }
}

/**
 * Enrich tracks with audio features
 */
async function enrichWithFeatures(
  client: SpotifyClient,
  tracks: Array<{ id: string; name: string; artist: string; album: string; durationMs: number; uri?: string }>
): Promise<TrackWithFeatures[]> {
  if (tracks.length === 0) {
    return [];
  }

  const trackIds = tracks.map(t => t.id);
  const features = await client.getAudioFeatures(trackIds);

  // Match features to tracks
  const enriched: TrackWithFeatures[] = [];

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const feature = features[i];

    if (feature) {
      enriched.push({
        ...track,
        features: feature,
      });
    }
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
 * Extract Spotify ID from URI or URL
 */
function extractId(uri: string): string {
  if (uri.startsWith('spotify:')) {
    return uri.split(':').pop() || uri;
  }
  if (uri.includes('spotify.com/')) {
    const parts = uri.split('/');
    return parts[parts.length - 1].split('?')[0];
  }
  return uri;
}
