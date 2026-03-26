import { describe, expect, it } from 'vitest';
import { getFlowServerVersion } from './version.js';

describe('getFlowServerVersion', () => {
  it('reads the flow package version from package metadata', () => {
    expect(getFlowServerVersion()).toBe('0.1.0');
  });
});
