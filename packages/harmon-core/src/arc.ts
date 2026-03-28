/**
 * Energy arc modulation for session progression
 */

import type { EnergyArc } from '@sriinnu/harmon-protocol';

/**
 * Calculate energy arc modulation based on session progress
 *
 * Returns: -0.5 to +0.5 modifier to apply to target energy
 *
 * @param elapsedMs Milliseconds elapsed since session start
 * @param arc Energy arc configuration
 * @param durationMs Total session duration (optional)
 * @returns Energy modulation value
 */
export function calculateArcModulation(
  elapsedMs: number,
  arc?: EnergyArc,
  durationMs?: number
): number {
  if (!arc || !arc.shape || arc.shape === 'flat') {
    return 0;
  }

  const totalDuration = durationMs || 3600000;  // Default 1 hour
  const progress = Math.min(elapsedMs / totalDuration, 1);  // 0-1

  const warmupMs = arc.warmupMs || 0;
  const cooldownMs = arc.cooldownMs || 0;
  const warmupProgress = warmupMs > 0 ? Math.min(elapsedMs / warmupMs, 1) : 1;
  const cooldownProgress = cooldownMs > 0 && durationMs
    ? Math.max(0, (elapsedMs - (durationMs - cooldownMs)) / cooldownMs)
    : 0;

  switch (arc.shape) {
    case 'ramp-up': {
      // Start low (-0.3), end high (+0.3)
      if (warmupProgress < 1) {
        return -0.3 * (1 - warmupProgress);  // Warming up: -0.3 → 0
      }
      // Post-warmup: use adjusted progress for continuity
      // At warmup end, this yields 0. At session end, yields +0.3.
      const postWarmupProgress = warmupMs > 0
        ? Math.min((elapsedMs - warmupMs) / Math.max(totalDuration - warmupMs, 1), 1)
        : progress;
      // Without warmup: -0.3 + 0.6*progress (full range -0.3 to +0.3)
      // With warmup: 0 + 0.3*postProgress (0 to +0.3, continuous from warmup end)
      if (warmupMs > 0) {
        return 0.3 * postWarmupProgress;
      }
      return -0.3 + (0.6 * progress);
    }

    case 'ramp-down': {
      // Start high (+0.3), end low (-0.3)
      if (warmupProgress < 1) {
        return 0.3 * warmupProgress;  // Warming up: 0 → +0.3
      }
      if (cooldownProgress > 0) {
        // During cooldown, ramp to negative
        const preCooldownValue = warmupMs > 0
          ? (() => {
              const postProg = Math.min((durationMs! - cooldownMs - warmupMs) / Math.max(totalDuration - warmupMs, 1), 1);
              return 0.3 - (0.6 * postProg);
            })()
          : 0.3 - (0.6 * ((durationMs! - cooldownMs) / totalDuration));
        return preCooldownValue + ((-0.3 - preCooldownValue) * cooldownProgress);
      }
      // Post-warmup: linear ramp from +0.3 to -0.3
      if (warmupMs > 0) {
        const postWarmupProgress = Math.min((elapsedMs - warmupMs) / Math.max(totalDuration - warmupMs, 1), 1);
        return 0.3 - (0.6 * postWarmupProgress);
      }
      return 0.3 - (0.6 * progress);
    }

    case 'wave':
      // Sine wave: low -> high -> low
      if (warmupProgress < 1) {
        return -0.3 * (1 - warmupProgress);
      }
      if (cooldownProgress > 0) {
        return -0.3 * cooldownProgress;
      }
      return 0.3 * Math.sin(progress * Math.PI);  // Peak at middle

    default:
      return 0;
  }
}
