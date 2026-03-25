/**
 * Two-phase track ranking algorithm
 */

import type { SessionPolicy } from '@athena/harmon-protocol';
import type { TrackWithFeatures, PlayRecord, RankedTrack } from './types.js';
import { calculateArcModulation } from './arc.js';
import { checkRecencyPenalty } from './history.js';

/**
 * Two-phase ranking:
 * 1. Hard constraint filtering (pass/fail)
 * 2. Soft weight scoring (0-1 score)
 *
 * @param candidates Candidate tracks to rank
 * @param policy Session policy
 * @param history Play history
 * @param elapsedMs Elapsed session time in milliseconds
 * @returns Ranked tracks sorted by score (descending)
 */
export async function rankTracks(
  candidates: TrackWithFeatures[],
  policy: SessionPolicy,
  history: PlayRecord[],
  elapsedMs: number
): Promise<RankedTrack[]> {
  // Phase 1: Hard constraints
  const filtered = candidates.filter(candidate =>
    passesHardConstraints(candidate, policy)
  );

  if (filtered.length === 0) {
    return [];
  }

  // Phase 2: Soft scoring
  const scored = filtered.map(track => {
    const score = calculateSoftScore(track, policy, history, elapsedMs);
    const reason = buildScoreReason(track, score);

    return {
      track,
      score,
      reason,
    };
  });

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  return scored;
}

/**
 * Phase 1: Hard constraint filtering
 */
function passesHardConstraints(
  track: TrackWithFeatures,
  policy: SessionPolicy
): boolean {
  const hard = policy.hard || {};
  const features = track.features;

  // No vocals check
  if (hard.noVocals && features.instrumentalness < 0.5) {
    return false;
  }

  // Explicit content check
  // Note: Would need explicit flag on track - skipping for now
  // if (hard.explicit === 'avoid' && track.explicit) return false;
  // if (hard.explicit === 'require' && !track.explicit) return false;

  // Tempo range
  if (hard.tempo) {
    if (hard.tempo.min !== undefined && features.tempo < hard.tempo.min) {
      return false;
    }
    if (hard.tempo.max !== undefined && features.tempo > hard.tempo.max) {
      return false;
    }
  }

  // Energy range
  if (hard.energy) {
    if (hard.energy.min !== undefined && features.energy < hard.energy.min) {
      return false;
    }
    if (hard.energy.max !== undefined && features.energy > hard.energy.max) {
      return false;
    }
  }

  // Instrumentalness minimum
  if (hard.instrumentalnessMin !== undefined) {
    if (features.instrumentalness < hard.instrumentalnessMin) {
      return false;
    }
  }

  return true;
}

/**
 * Phase 2: Soft scoring (0-1)
 */
function calculateSoftScore(
  track: TrackWithFeatures,
  policy: SessionPolicy,
  history: PlayRecord[],
  elapsedMs: number
): number {
  const soft = policy.soft || {};
  const weights = soft.weights || {};
  const features = track.features;

  let score = 0;
  let totalWeight = 0;

  // Energy weight (with arc modulation)
  if (typeof weights.energy === 'number') {
    const arcMod = calculateArcModulation(elapsedMs, soft.arc, policy.durationMs);
    const targetEnergy = 0.5 + arcMod;  // Base 0.5, modified by arc
    const energyScore = 1 - Math.abs(features.energy - targetEnergy);
    score += weights.energy * energyScore;
    totalWeight += Math.abs(weights.energy);
  }

  // Instrumentalness weight
  if (typeof weights.instrumentalness === 'number') {
    score += weights.instrumentalness * features.instrumentalness;
    totalWeight += Math.abs(weights.instrumentalness);
  }

  // Speechiness weight (usually negative)
  if (typeof weights.speechiness === 'number') {
    const speechScore = weights.speechiness > 0
      ? features.speechiness
      : (1 - features.speechiness);
    score += Math.abs(weights.speechiness) * speechScore;
    totalWeight += Math.abs(weights.speechiness);
  }

  // Valence weight
  if (typeof weights.valence === 'number') {
    score += weights.valence * features.valence;
    totalWeight += Math.abs(weights.valence);
  }

  // Acousticness weight
  if (typeof weights.acousticness === 'number') {
    score += weights.acousticness * features.acousticness;
    totalWeight += Math.abs(weights.acousticness);
  }

  // Tempo weight (normalized to 0-1, assuming 60-180 BPM range)
  if (typeof weights.tempo === 'number') {
    const normalizedTempo = clamp((features.tempo - 60) / 120, 0, 1);
    score += weights.tempo * normalizedTempo;
    totalWeight += Math.abs(weights.tempo);
  }

  // Normalize by total weight
  if (totalWeight > 0) {
    score = score / totalWeight;
  }

  // Clamp to [0,1] BEFORE applying penalty (prevents negative * penalty inversion)
  score = clamp(score, 0, 1);

  // Apply recency penalty
  const recencyPenalty = checkRecencyPenalty(track, history, policy.limits);
  score = score * (1 - recencyPenalty);

  return clamp(score, 0, 1);
}

function buildScoreReason(track: TrackWithFeatures, score: number): string {
  return `${track.name} scored ${score.toFixed(3)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
