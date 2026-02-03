/**
 * Energy arc modulation for session progression
 */

import type { EnergyArc } from '@athena/harmon-protocol';

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
    case 'ramp-up':
      // Start low, end high
      if (warmupProgress < 1) {
        return -0.3 * (1 - warmupProgress);  // Warming up
      }
      return -0.3 + (0.6 * progress);  // Linear ramp from -0.3 to +0.3

    case 'ramp-down':
      // Start high, end low
      if (warmupProgress < 1) {
        return 0.3 * warmupProgress;  // Warming up
      }
      if (cooldownProgress > 0) {
        return 0.3 * (1 - cooldownProgress);  // Cooling down
      }
      return 0.3 - (0.6 * progress);  // Linear ramp from +0.3 to -0.3

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
