import { describe, expect, it } from 'vitest';
import {
  classifyCliError,
  CliUsageError,
  detectDeviceOS,
  assertSafeAuthImportEndpoint,
  EXIT_AUTH,
  EXIT_OK,
  EXIT_NETWORK,
  EXIT_USAGE,
  parseSessionDurationOption,
  parseTimeoutOption,
  validateChoice,
  validateFraction,
} from './runtime.js';

describe('harmon CLI runtime helpers', () => {
  describe('parseTimeoutOption', () => {
    it('parses bounded timeout values', () => {
      expect(parseTimeoutOption('5s')).toBe(5000);
      expect(parseTimeoutOption('10m')).toBe(600000);
    });

    it('rejects invalid timeout values instead of silently falling back', () => {
      expect(() => parseTimeoutOption('oops')).toThrow('timeout must be a positive duration');
      expect(() => parseTimeoutOption('11m')).toThrow('timeout must be 10m or less');
    });
  });

  describe('parseSessionDurationOption', () => {
    it('keeps the documented one-hour default honest', () => {
      expect(parseSessionDurationOption(undefined)).toBe(3600000);
      expect(parseSessionDurationOption('1h')).toBe(3600000);
    });

    it('rejects out-of-range session durations', () => {
      expect(() => parseSessionDurationOption('25h')).toThrow('duration must be 24h or less');
    });
  });

  describe('validation helpers', () => {
    it('validates bounded fractions', () => {
      expect(validateFraction(0.5, 'energy')).toBe(0.5);
      expect(() => validateFraction(1.5, 'energy')).toThrow('energy must be a number between 0 and 1');
    });

    it('validates explicit choices', () => {
      expect(validateChoice('focus', 'mode', ['focus', 'relax'])).toBe('focus');
      expect(() => validateChoice('party', 'mode', ['focus', 'relax'])).toThrow('mode must be one of');
    });
  });

  describe('detectDeviceOS', () => {
    it('maps supported runtime platforms into the protocol enum', () => {
      expect(detectDeviceOS('darwin', {})).toBe('macos');
      expect(detectDeviceOS('win32', {})).toBe('windows');
      expect(detectDeviceOS('linux', { WSL_DISTRO_NAME: 'Ubuntu' })).toBe('wsl');
      expect(detectDeviceOS('linux', {})).toBe('linux');
    });
  });

  describe('assertSafeAuthImportEndpoint', () => {
    it('allows loopback HTTP and HTTPS cookie-import targets', () => {
      expect(() => assertSafeAuthImportEndpoint('http://127.0.0.1:17373')).not.toThrow();
      expect(() => assertSafeAuthImportEndpoint('https://harmon.example.com')).not.toThrow();
    });

    it('rejects insecure remote HTTP cookie-import targets', () => {
      expect(() => assertSafeAuthImportEndpoint('http://10.0.0.8:17373')).toThrow(
        'Cookie import only allows loopback HTTP or HTTPS endpoints',
      );
    });
  });

  describe('classifyCliError', () => {
    it('maps usage, auth, and network failures to the documented exit codes', () => {
      expect(classifyCliError(new CliUsageError('bad input')).exitCode).toBe(EXIT_USAGE);
      expect(classifyCliError(new Error('401 Unauthorized')).exitCode).toBe(EXIT_AUTH);
      expect(classifyCliError(new Error('fetch failed')).exitCode).toBe(EXIT_NETWORK);
    });

    it('keeps the auth recovery message provider-agnostic', () => {
      expect(classifyCliError(new Error('403 Forbidden')).message).toContain('harmon auth status');
      expect(classifyCliError(new Error('403 Forbidden')).message).not.toContain('harmon auth import');
    });

    it('treats Commander parse failures as usage errors', () => {
      const commanderError = new Error('unknown option');
      commanderError.name = 'CommanderError';
      commanderError.code = 'commander.unknownOption';
      expect(classifyCliError(commanderError).exitCode).toBe(EXIT_USAGE);
    });

    it('keeps Commander help/version exits as successful exits', () => {
      const helpError = new Error('(outputHelp)');
      helpError.name = 'CommanderError';
      helpError.code = 'commander.helpDisplayed';
      helpError.exitCode = 0;

      const versionError = new Error('0.1.0');
      versionError.name = 'CommanderError';
      versionError.code = 'commander.version';
      versionError.exitCode = 0;

      expect(classifyCliError(helpError).exitCode).toBe(EXIT_OK);
      expect(classifyCliError(versionError).exitCode).toBe(EXIT_OK);
    });
  });
});

describe('onboarding validators', () => {
  it('accepts a valid spotify client id and rejects near-misses', async () => {
    const { validateSpotifyClientId } = await import('./runtime.js');
    expect(validateSpotifyClientId('0123456789abcdef0123456789abcdef').ok).toBe(true);
    expect(validateSpotifyClientId('0123456789abcdef').ok).toBe(false);
    expect(validateSpotifyClientId('').ok).toBe(false);
  });

  it('validates google client ids by suffix', async () => {
    const { validateGoogleClientId } = await import('./runtime.js');
    expect(validateGoogleClientId('123-abc.apps.googleusercontent.com').ok).toBe(true);
    expect(validateGoogleClientId('123-abc.example.com').ok).toBe(false);
  });

  it('catches truncated google client secrets — the real-world failure', async () => {
    const { validateGoogleClientSecret } = await import('./runtime.js');
    expect(validateGoogleClientSecret('GOCSPX-' + 'x'.repeat(28)).ok).toBe(true);
    // one char short: the truncated-paste case that produces invalid_client
    expect(validateGoogleClientSecret('GOCSPX-' + 'x'.repeat(27)).ok).toBe(false);
    expect(validateGoogleClientSecret('BADPREFIX-' + 'x'.repeat(25)).ok).toBe(false);
  });
});
