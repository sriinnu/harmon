/**
 * Tests for arc.ts - Energy arc modulation for session progression
 */

import { describe, it, expect } from 'vitest';
import { calculateArcModulation } from './arc.js';
import type { EnergyArc } from '@athena/harmon-protocol';

// ============================================================================
// Flat Arc Tests
// ============================================================================

describe('calculateArcModulation - Flat Arc', () => {
  it('should return 0 for flat arc', () => {
    const arc: EnergyArc = { shape: 'flat' };

    expect(calculateArcModulation(0, arc, 3600000)).toBe(0);
    expect(calculateArcModulation(1800000, arc, 3600000)).toBe(0);
    expect(calculateArcModulation(3600000, arc, 3600000)).toBe(0);
  });

  it('should return 0 when no arc is specified', () => {
    expect(calculateArcModulation(0, undefined, 3600000)).toBe(0);
    expect(calculateArcModulation(1800000, undefined, 3600000)).toBe(0);
  });

  it('should return 0 when arc has no shape', () => {
    const arc: EnergyArc = {};

    expect(calculateArcModulation(0, arc, 3600000)).toBe(0);
    expect(calculateArcModulation(1800000, arc, 3600000)).toBe(0);
  });
});

// ============================================================================
// Ramp-Up Arc Tests
// ============================================================================

describe('calculateArcModulation - Ramp-Up', () => {
  it('should start low and end high', () => {
    const arc: EnergyArc = { shape: 'ramp-up' };
    const durationMs = 3600000; // 1 hour

    const startMod = calculateArcModulation(0, arc, durationMs);
    const midMod = calculateArcModulation(1800000, arc, durationMs);
    const endMod = calculateArcModulation(3600000, arc, durationMs);

    expect(startMod).toBeLessThan(0); // Start low
    expect(endMod).toBeGreaterThan(0); // End high
    expect(midMod).toBeGreaterThan(startMod);
    expect(endMod).toBeGreaterThan(midMod);
  });

  it('should apply linear progression after warmup', () => {
    const arc: EnergyArc = { shape: 'ramp-up' };
    const durationMs = 3600000;

    const mod25 = calculateArcModulation(900000, arc, durationMs); // 25%
    const mod50 = calculateArcModulation(1800000, arc, durationMs); // 50%
    const mod75 = calculateArcModulation(2700000, arc, durationMs); // 75%

    // Should increase linearly
    const diff1 = mod50 - mod25;
    const diff2 = mod75 - mod50;
    expect(Math.abs(diff1 - diff2)).toBeLessThan(0.01);
  });

  it('should handle warmup period', () => {
    const arc: EnergyArc = {
      shape: 'ramp-up',
      warmupMs: 600000, // 10 minute warmup
    };
    const durationMs = 3600000;

    const duringWarmup = calculateArcModulation(300000, arc, durationMs); // 5 min
    const afterWarmup = calculateArcModulation(900000, arc, durationMs); // 15 min

    expect(duringWarmup).toBeGreaterThan(-0.3);
    expect(duringWarmup).toBeLessThan(afterWarmup);
  });

  it('should modulate within reasonable bounds', () => {
    const arc: EnergyArc = { shape: 'ramp-up' };
    const durationMs = 3600000;

    for (let elapsed = 0; elapsed <= durationMs; elapsed += 600000) {
      const mod = calculateArcModulation(elapsed, arc, durationMs);
      expect(mod).toBeGreaterThanOrEqual(-0.5);
      expect(mod).toBeLessThanOrEqual(0.5);
    }
  });

  it('should reach approximately +0.3 at end', () => {
    const arc: EnergyArc = { shape: 'ramp-up' };
    const durationMs = 3600000;

    const endMod = calculateArcModulation(durationMs, arc, durationMs);
    expect(endMod).toBeCloseTo(0.3, 1);
  });
});

// ============================================================================
// Ramp-Down Arc Tests
// ============================================================================

describe('calculateArcModulation - Ramp-Down', () => {
  it('should start high and end low', () => {
    const arc: EnergyArc = { shape: 'ramp-down' };
    const durationMs = 3600000;

    const startMod = calculateArcModulation(0, arc, durationMs);
    const midMod = calculateArcModulation(1800000, arc, durationMs);
    const endMod = calculateArcModulation(3600000, arc, durationMs);

    expect(startMod).toBeGreaterThan(0); // Start high
    expect(endMod).toBeLessThan(0); // End low
    expect(midMod).toBeLessThan(startMod);
    expect(endMod).toBeLessThan(midMod);
  });

  it('should apply linear decline after warmup', () => {
    const arc: EnergyArc = {
      shape: 'ramp-down',
      warmupMs: 300000, // 5 minute warmup
    };
    const durationMs = 3600000;

    const afterWarmup = calculateArcModulation(600000, arc, durationMs); // 10 min
    const mid = calculateArcModulation(1800000, arc, durationMs); // 30 min
    const late = calculateArcModulation(3000000, arc, durationMs); // 50 min

    expect(afterWarmup).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(late);
  });

  it('should handle cooldown period', () => {
    const arc: EnergyArc = {
      shape: 'ramp-down',
      cooldownMs: 600000, // 10 minute cooldown
    };
    const durationMs = 3600000;

    const beforeCooldown = calculateArcModulation(2700000, arc, durationMs); // 45 min
    const duringCooldown = calculateArcModulation(3300000, arc, durationMs); // 55 min

    expect(duringCooldown).toBeLessThan(beforeCooldown);
    expect(duringCooldown).toBeLessThan(0);
  });

  it('should handle both warmup and cooldown', () => {
    const arc: EnergyArc = {
      shape: 'ramp-down',
      warmupMs: 300000,
      cooldownMs: 300000,
    };
    const durationMs = 3600000;

    const warmup = calculateArcModulation(150000, arc, durationMs);
    const middle = calculateArcModulation(1800000, arc, durationMs);
    const cooldown = calculateArcModulation(3450000, arc, durationMs);

    expect(warmup).toBeGreaterThan(0);
    expect(warmup).toBeLessThan(0.3);
    expect(cooldown).toBeLessThan(middle);
  });

  it('should reach approximately -0.3 at end', () => {
    const arc: EnergyArc = { shape: 'ramp-down' };
    const durationMs = 3600000;

    const endMod = calculateArcModulation(durationMs, arc, durationMs);
    expect(endMod).toBeCloseTo(-0.3, 1);
  });

  it('should modulate within reasonable bounds', () => {
    const arc: EnergyArc = { shape: 'ramp-down' };
    const durationMs = 3600000;

    for (let elapsed = 0; elapsed <= durationMs; elapsed += 600000) {
      const mod = calculateArcModulation(elapsed, arc, durationMs);
      expect(mod).toBeGreaterThanOrEqual(-0.5);
      expect(mod).toBeLessThanOrEqual(0.5);
    }
  });
});

// ============================================================================
// Wave Arc Tests
// ============================================================================

describe('calculateArcModulation - Wave', () => {
  it('should create a wave pattern (low -> high -> low)', () => {
    const arc: EnergyArc = { shape: 'wave' };
    const durationMs = 3600000;

    const start = calculateArcModulation(0, arc, durationMs);
    const quarter = calculateArcModulation(900000, arc, durationMs);
    const mid = calculateArcModulation(1800000, arc, durationMs);
    const threeQuarter = calculateArcModulation(2700000, arc, durationMs);
    const end = calculateArcModulation(3600000, arc, durationMs);

    // Start low
    expect(start).toBeLessThan(0);

    // Rise to peak at middle
    expect(quarter).toBeGreaterThan(start);
    expect(mid).toBeGreaterThan(quarter);
    expect(mid).toBeGreaterThan(0); // Peak is positive

    // Descend back down
    expect(threeQuarter).toBeLessThan(mid);
    expect(end).toBeLessThan(threeQuarter);
    expect(end).toBeLessThan(0);
  });

  it('should peak at approximately middle of session', () => {
    const arc: EnergyArc = { shape: 'wave' };
    const durationMs = 3600000;

    const mid = calculateArcModulation(1800000, arc, durationMs);

    // Middle should be the highest point
    const before = calculateArcModulation(1200000, arc, durationMs);
    const after = calculateArcModulation(2400000, arc, durationMs);

    expect(mid).toBeGreaterThan(before);
    expect(mid).toBeGreaterThan(after);
    expect(mid).toBeCloseTo(0.3, 1);
  });

  it('should handle warmup period', () => {
    const arc: EnergyArc = {
      shape: 'wave',
      warmupMs: 600000,
    };
    const durationMs = 3600000;

    const duringWarmup = calculateArcModulation(300000, arc, durationMs);
    const afterWarmup = calculateArcModulation(900000, arc, durationMs);

    expect(duringWarmup).toBeGreaterThan(-0.3);
    expect(afterWarmup).toBeGreaterThan(duringWarmup);
  });

  it('should handle cooldown period', () => {
    const arc: EnergyArc = {
      shape: 'wave',
      cooldownMs: 600000,
    };
    const durationMs = 3600000;

    const beforeCooldown = calculateArcModulation(2700000, arc, durationMs);
    const duringCooldown = calculateArcModulation(3300000, arc, durationMs);

    expect(duringCooldown).toBeLessThan(0);
    expect(duringCooldown).toBeLessThan(beforeCooldown);
  });

  it('should be symmetric around midpoint (without warmup/cooldown)', () => {
    const arc: EnergyArc = { shape: 'wave' };
    const durationMs = 3600000;

    const quarter = calculateArcModulation(900000, arc, durationMs);
    const threeQuarter = calculateArcModulation(2700000, arc, durationMs);

    // Should be roughly symmetric
    expect(Math.abs(quarter - threeQuarter)).toBeLessThan(0.05);
  });

  it('should modulate within reasonable bounds', () => {
    const arc: EnergyArc = { shape: 'wave' };
    const durationMs = 3600000;

    for (let elapsed = 0; elapsed <= durationMs; elapsed += 600000) {
      const mod = calculateArcModulation(elapsed, arc, durationMs);
      expect(mod).toBeGreaterThanOrEqual(-0.5);
      expect(mod).toBeLessThanOrEqual(0.5);
    }
  });
});

// ============================================================================
// Edge Cases and Default Values
// ============================================================================

describe('calculateArcModulation - Edge Cases', () => {
  it('should use default duration when not specified', () => {
    const arc: EnergyArc = { shape: 'ramp-up' };

    // Should not throw and should return reasonable value
    const mod = calculateArcModulation(1800000, arc);
    expect(mod).toBeGreaterThanOrEqual(-0.5);
    expect(mod).toBeLessThanOrEqual(0.5);
  });

  it('should handle elapsed time exceeding duration', () => {
    const arc: EnergyArc = { shape: 'ramp-up' };
    const durationMs = 3600000;

    const mod = calculateArcModulation(5000000, arc, durationMs);

    // Progress should be clamped to 1.0
    expect(mod).toBeGreaterThanOrEqual(-0.5);
    expect(mod).toBeLessThanOrEqual(0.5);
  });

  it('should handle zero elapsed time', () => {
    const arc: EnergyArc = { shape: 'ramp-up' };
    const durationMs = 3600000;

    const mod = calculateArcModulation(0, arc, durationMs);
    expect(mod).toBeCloseTo(-0.3, 1);
  });

  it('should handle zero warmup time', () => {
    const arc: EnergyArc = {
      shape: 'ramp-up',
      warmupMs: 0,
    };
    const durationMs = 3600000;

    const mod = calculateArcModulation(0, arc, durationMs);
    expect(mod).toBeCloseTo(-0.3, 1);
  });

  it('should handle zero cooldown time', () => {
    const arc: EnergyArc = {
      shape: 'ramp-down',
      cooldownMs: 0,
    };
    const durationMs = 3600000;

    const mod = calculateArcModulation(3600000, arc, durationMs);
    expect(mod).toBeCloseTo(-0.3, 1);
  });

  it('should handle very short session duration', () => {
    const arc: EnergyArc = { shape: 'wave' };
    const durationMs = 60000; // 1 minute

    const start = calculateArcModulation(0, arc, durationMs);
    const mid = calculateArcModulation(30000, arc, durationMs);
    const end = calculateArcModulation(60000, arc, durationMs);

    expect(start).toBeLessThan(mid);
    expect(end).toBeLessThan(mid);
  });

  it('should handle very long session duration', () => {
    const arc: EnergyArc = { shape: 'ramp-up' };
    const durationMs = 36000000; // 10 hours

    const start = calculateArcModulation(0, arc, durationMs);
    const end = calculateArcModulation(36000000, arc, durationMs);

    expect(start).toBeLessThan(end);
    expect(end).toBeCloseTo(0.3, 1);
  });

  it('should handle warmup longer than session', () => {
    const arc: EnergyArc = {
      shape: 'ramp-up',
      warmupMs: 7200000, // 2 hours
    };
    const durationMs = 3600000; // 1 hour

    const end = calculateArcModulation(3600000, arc, durationMs);

    // Should still complete warmup phase
    expect(end).toBeGreaterThanOrEqual(-0.3);
    expect(end).toBeLessThanOrEqual(0.5);
  });

  it('should handle cooldown longer than session', () => {
    const arc: EnergyArc = {
      shape: 'ramp-down',
      cooldownMs: 7200000,
    };
    const durationMs = 3600000;

    const end = calculateArcModulation(3600000, arc, durationMs);

    expect(end).toBeGreaterThanOrEqual(-0.5);
    expect(end).toBeLessThanOrEqual(0.3);
  });

  it('should handle extremely small elapsed times', () => {
    const arc: EnergyArc = { shape: 'ramp-up' };
    const durationMs = 3600000;

    const mod = calculateArcModulation(1, arc, durationMs);
    expect(mod).toBeCloseTo(-0.3, 1);
  });

  it('should handle all arc shapes consistently', () => {
    const shapes: Array<'flat' | 'ramp-up' | 'ramp-down' | 'wave'> = [
      'flat',
      'ramp-up',
      'ramp-down',
      'wave',
    ];
    const durationMs = 3600000;

    shapes.forEach(shape => {
      const arc: EnergyArc = { shape };

      for (let elapsed = 0; elapsed <= durationMs; elapsed += 900000) {
        const mod = calculateArcModulation(elapsed, arc, durationMs);
        expect(mod).toBeGreaterThanOrEqual(-0.5);
        expect(mod).toBeLessThanOrEqual(0.5);
      }
    });
  });
});

// ============================================================================
// Real-World Scenario Tests
// ============================================================================

describe('calculateArcModulation - Real-World Scenarios', () => {
  it('should create proper meditation arc (ramp-down with long cooldown)', () => {
    const arc: EnergyArc = {
      shape: 'ramp-down',
      warmupMs: 300000, // 5 min warmup
      cooldownMs: 600000, // 10 min cooldown
    };
    const durationMs = 3600000; // 1 hour

    const start = calculateArcModulation(0, arc, durationMs);
    const afterWarmup = calculateArcModulation(600000, arc, durationMs);
    const middle = calculateArcModulation(1800000, arc, durationMs);
    const beforeCooldown = calculateArcModulation(2700000, arc, durationMs);
    const end = calculateArcModulation(3600000, arc, durationMs);

    expect(start).toBeGreaterThan(0);
    expect(afterWarmup).toBeGreaterThan(middle);
    expect(middle).toBeGreaterThan(beforeCooldown);
    expect(beforeCooldown).toBeGreaterThan(end);
    expect(end).toBeLessThan(0);
  });

  it('should create proper workout arc (ramp-up then high energy)', () => {
    const arc: EnergyArc = {
      shape: 'ramp-up',
      warmupMs: 600000, // 10 min warmup
    };
    const durationMs = 3600000;

    const duringWarmup = calculateArcModulation(300000, arc, durationMs);
    const afterWarmup = calculateArcModulation(900000, arc, durationMs);
    const end = calculateArcModulation(3600000, arc, durationMs);

    expect(duringWarmup).toBeLessThan(afterWarmup);
    expect(afterWarmup).toBeLessThan(end);
    expect(end).toBeGreaterThan(0);
  });

  it('should create proper focus session arc (wave)', () => {
    const arc: EnergyArc = {
      shape: 'wave',
      warmupMs: 600000,
      cooldownMs: 600000,
    };
    const durationMs = 7200000; // 2 hours

    const start = calculateArcModulation(300000, arc, durationMs);
    const peak = calculateArcModulation(3600000, arc, durationMs);
    const end = calculateArcModulation(6900000, arc, durationMs);

    expect(start).toBeLessThan(0);
    expect(peak).toBeGreaterThan(start);
    expect(peak).toBeGreaterThan(end);
    expect(end).toBeLessThan(0);
  });
});
