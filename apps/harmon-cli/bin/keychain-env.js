/**
 * macOS Keychain fallback for secret environment variables.
 *
 * For each listed variable that is still unset after the shell and .env,
 * look up a generic password with service "harmon" and the variable name
 * as the account:
 *
 *   security add-generic-password -s harmon -a HARMON_ENCRYPTION_SECRET -w '<value>' -U
 *
 * Non-macOS platforms and missing entries are silently skipped — the
 * existing validation still reports anything genuinely absent.
 */

import { execFileSync } from 'node:child_process';

const KEYCHAIN_SERVICE = 'harmon';

export const KEYCHAIN_BACKED_VARS = [
  'HARMON_API_TOKEN',
  'HARMON_ENCRYPTION_SECRET',
  'SPOTIFY_CLIENT_SECRET',
  'YOUTUBE_MUSIC_CLIENT_SECRET',
  'APPLE_MUSIC_PRIVATE_KEY',
  'APPLE_MUSIC_REMOTE_TOKEN',
  'AUDD_API_TOKEN',
];

export function loadKeychainSecrets(vars = KEYCHAIN_BACKED_VARS) {
  if (process.platform !== 'darwin') {
    return;
  }

  for (const name of vars) {
    if (process.env[name]) {
      continue;
    }
    try {
      const value = execFileSync(
        'security',
        ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', name, '-w'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      ).replace(/\n$/, '');
      if (value) {
        process.env[name] = decodeKeychainValue(value);
      }
    } catch {
      // Not in the keychain — fine, other config paths still apply.
    }
  }
}

/**
 * `security ... -w` prints multi-line values (like PEM private keys) as hex
 * instead of raw text. Decode when the value is pure hex and the decoded
 * bytes are a PEM block — narrowly targeted so hex-looking tokens pass
 * through untouched.
 */
export function decodeKeychainValue(value) {
  if (!/^(?:[0-9a-f]{2})+$/.test(value)) {
    return value;
  }
  try {
    const decoded = Buffer.from(value, 'hex').toString('utf8');
    if (decoded.includes('-----BEGIN')) {
      return decoded;
    }
  } catch {
    // fall through to the raw value
  }
  return value;
}
