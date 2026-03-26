import { describe, expect, it } from 'vitest';
import { getDaemonVersion } from './version.js';

describe('getDaemonVersion', () => {
  it('reads the daemon version from package metadata', () => {
    expect(getDaemonVersion()).toBe('0.1.0');
  });
});
