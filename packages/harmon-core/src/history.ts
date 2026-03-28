/**
 * Play history tracking and recency penalty calculation
 */

import type { RepetitionLimits } from '@sriinnu/harmon-protocol';
import type { TrackWithFeatures, PlayRecord } from './types.js';

/**
 * Calculate recency penalty (0-1)
 *
 * 0 = no penalty, 1 = maximum penalty (completely exclude)
 *
 * @param track Track to check
 * @param history Play history
 * @param limits Repetition limits from policy
 * @returns Penalty value 0-1
 */
export function checkRecencyPenalty(
  track: TrackWithFeatures,
  history: PlayRecord[],
  limits?: RepetitionLimits
): number {
  if (!limits) {
    return 0;
  }

  const now = Date.now();
  let penalty = 0;

  // Check track repetition
  if (limits.repeatTrackWithinDays) {
    const windowMs = limits.repeatTrackWithinDays * 24 * 60 * 60 * 1000;
    const recentPlay = history.find(
      r => r.trackId === track.id && (now - r.playedAt) < windowMs
    );

    if (recentPlay) {
      // Full penalty if played within window
      penalty = Math.max(penalty, 1.0);
    }
  }

  // Check artist repetition
  if (limits.repeatArtistWithinHours && penalty < 1.0) {
    const windowMs = limits.repeatArtistWithinHours * 60 * 60 * 1000;

    // Find recent plays of same artist
    const recentArtistPlays = history.filter(r => {
      const timeSince = now - r.playedAt;
      if (timeSince >= windowMs) return false;

      // Use structured artistIds when available, fall back to exact name match
      return r.artistIds.some(aid => {
        if (track.artistIds && track.artistIds.length > 0) {
          return track.artistIds.includes(aid);
        }
        return aid === track.artist;
      });
    });

    if (recentArtistPlays.length > 0) {
      // Graduated penalty based on how many recent plays
      const artistPenalty = Math.min(recentArtistPlays.length * 0.3, 0.8);
      penalty = Math.max(penalty, artistPenalty);
    }
  }

  return penalty;
}

/**
 * Get tracks played in the last N hours
 *
 * @param history Play history
 * @param hoursAgo Hours to look back
 * @returns Recent play records
 */
export function getRecentPlays(
  history: PlayRecord[],
  hoursAgo: number
): PlayRecord[] {
  const cutoff = Date.now() - (hoursAgo * 60 * 60 * 1000);
  return history.filter(r => r.playedAt >= cutoff);
}

/**
 * Get unique artists from history
 *
 * @param history Play history
 * @param hoursAgo Hours to look back
 * @returns Array of artist IDs
 */
export function getRecentArtists(
  history: PlayRecord[],
  hoursAgo: number
): string[] {
  const recent = getRecentPlays(history, hoursAgo);
  const artists = new Set<string>();

  for (const record of recent) {
    for (const artistId of record.artistIds) {
      artists.add(artistId);
    }
  }

  return Array.from(artists);
}
