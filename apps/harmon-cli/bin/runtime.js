/**
 * Runtime helpers for the Harmon CLI binary.
 *
 * I keep parsing and error classification here so I can test
 * the CLI contract without booting the full command tree.
 */

export const EXIT_OK = 0;
export const EXIT_GENERIC = 1;
export const EXIT_USAGE = 2;
export const EXIT_AUTH = 3;
export const EXIT_NETWORK = 4;

export const PLAYBACK_ENGINES = ['connect', 'applescript'];
export const SUPPORTED_PROVIDERS = ['spotify', 'apple', 'youtube'];
export const SESSION_MODES = ['focus', 'relax', 'energize', 'meditate', 'workout', 'custom'];
export const SPOTIFY_SEARCH_TYPES = ['track', 'album', 'artist', 'playlist', 'episode', 'show'];

const WSL_ENV_KEYS = ['WSL_DISTRO_NAME', 'WSL_INTEROP'];
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

/**
 * I use a dedicated usage error so local validation failures
 * always map to the documented usage exit code.
 */
export class CliUsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CliUsageError';
  }
}

/**
 * I parse user-facing duration input and reject dishonest fallbacks.
 *
 * @param {string | undefined} value
 * @param {{ label: string, defaultMs: number, maxMs: number }} options
 * @returns {number}
 */
function parseDurationInput(value, options) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return options.defaultMs;
  }

  const match = value.trim().match(/^(\d+)(ms|s|m|h)?$/);
  if (!match) {
    throw new CliUsageError(`${options.label} must be a positive duration like 500ms, 10s, 30m, or 1h.`);
  }

  const amount = Number.parseInt(match[1], 10);
  const unit = match[2] || 's';
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new CliUsageError(`${options.label} must be a positive duration.`);
  }

  const multiplier =
    unit === 'ms' ? 1 :
    unit === 's' ? 1000 :
    unit === 'm' ? 60 * 1000 :
    unit === 'h' ? 60 * 60 * 1000 :
    null;

  if (multiplier === null) {
    throw new CliUsageError(`${options.label} uses an unsupported duration unit.`);
  }

  const durationMs = amount * multiplier;
  if (durationMs > options.maxMs) {
    throw new CliUsageError(`${options.label} must be ${formatMaxDuration(options.maxMs)} or less.`);
  }

  return durationMs;
}

/**
 * I format max-duration validation messages using the same units
 * users already see in the CLI help text.
 *
 * @param {number} maxMs
 * @returns {string}
 */
function formatMaxDuration(maxMs) {
  if (maxMs % (60 * 60 * 1000) === 0) {
    return `${maxMs / (60 * 60 * 1000)}h`;
  }
  if (maxMs % (60 * 1000) === 0) {
    return `${maxMs / (60 * 1000)}m`;
  }
  if (maxMs % 1000 === 0) {
    return `${maxMs / 1000}s`;
  }
  return `${maxMs}ms`;
}

/**
 * @param {string | undefined} value
 * @returns {number}
 */
export function parseTimeoutOption(value) {
  return parseDurationInput(value, {
    label: 'timeout',
    defaultMs: 10 * 1000,
    maxMs: 10 * 60 * 1000,
  });
}

/**
 * @param {string | undefined} value
 * @returns {number}
 */
export function parseSessionDurationOption(value) {
  return parseDurationInput(value, {
    label: 'duration',
    defaultMs: 60 * 60 * 1000,
    maxMs: 24 * 60 * 60 * 1000,
  });
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {number | undefined}
 */
export function validateFraction(value, label) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new CliUsageError(`${label} must be a number between 0 and 1.`);
  }

  return value;
}

/**
 * @template {string} T
 * @param {T} value
 * @param {string} label
 * @param {readonly T[]} allowed
 * @returns {T}
 */
export function validateChoice(value, label, allowed) {
  if (!allowed.includes(value)) {
    throw new CliUsageError(`${label} must be one of: ${allowed.join(', ')}.`);
  }
  return value;
}

/**
 * I keep browser-cookie import scoped to loopback HTTP or HTTPS endpoints
 * unless the operator explicitly opts into a less safe target.
 *
 * @param {string} endpoint
 * @param {boolean} [allowInsecure]
 * @returns {void}
 */
export function assertSafeAuthImportEndpoint(
  endpoint,
  allowInsecure = process.env.HARMON_ALLOW_INSECURE_AUTH_IMPORT === '1'
) {
  if (allowInsecure) {
    return;
  }

  const url = new URL(endpoint);
  if (url.protocol === 'https:') {
    return;
  }

  if (url.protocol === 'http:' && isLoopbackHostname(url.hostname)) {
    return;
  }

  throw new CliUsageError(
    'Cookie import only allows loopback HTTP or HTTPS endpoints. Set HARMON_ALLOW_INSECURE_AUTH_IMPORT=1 to override for local development.'
  );
}

/**
 * I normalize the current runtime platform into the protocol's
 * device OS enum so session commands stay valid across hosts.
 *
 * @param {NodeJS.Platform} [platform]
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {'macos' | 'windows' | 'wsl' | 'linux'}
 */
export function detectDeviceOS(platform = process.platform, env = process.env) {
  if (platform === 'darwin') {
    return 'macos';
  }
  if (platform === 'win32') {
    return 'windows';
  }
  if (platform === 'linux' && WSL_ENV_KEYS.some((key) => Boolean(env[key]))) {
    return 'wsl';
  }
  return 'linux';
}

function isLoopbackHostname(hostname) {
  return LOOPBACK_HOSTS.has(hostname) || hostname.endsWith('.localhost');
}

/**
 * I map arbitrary runtime failures back into the CLI's documented
 * exit-code contract.
 *
 * @param {unknown} error
 * @param {string[]} [argv]
 * @returns {{ exitCode: number, message: string, json: boolean }}
 */
export function classifyCliError(error, argv = process.argv) {
  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error ? error.cause : undefined;
  const json = argv.includes('--json');

  if (error instanceof CliUsageError) {
    return { exitCode: EXIT_USAGE, message, json };
  }

  const errorCode = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  const errorExitCode =
    error && typeof error === 'object' && 'exitCode' in error
      ? Number(error.exitCode)
      : undefined;
  if (
    (error instanceof Error && error.name === 'CommanderError') &&
    errorExitCode === EXIT_OK &&
    (errorCode === 'commander.helpDisplayed' || errorCode === 'commander.version')
  ) {
    return { exitCode: EXIT_OK, message, json };
  }
  if (
    (error instanceof Error && error.name === 'CommanderError') ||
    errorCode.startsWith('commander.')
  ) {
    return { exitCode: EXIT_USAGE, message, json };
  }

  if (
    message.includes('fetch failed') ||
    message.includes('ECONNREFUSED') ||
    message.includes('EHOSTUNREACH') ||
    message.includes('ENOTFOUND') ||
    message.includes('ETIMEDOUT') ||
    (cause && String(cause).includes('ECONNREFUSED'))
  ) {
    return { exitCode: EXIT_NETWORK, message, json };
  }

  if (error instanceof Error && error.name === 'AbortError') {
    return { exitCode: EXIT_NETWORK, message: 'Request timed out. Use --timeout to increase.', json };
  }

  if (message.includes('401') || message.includes('403') || message.includes('Unauthorized')) {
    return {
      exitCode: EXIT_AUTH,
      message: 'Authentication failed. Run "harmon auth status" to inspect provider auth, then use the provider-specific auth flow if needed.',
      json,
    };
  }

  if (
    message.includes('Unknown device') ||
    message.includes('Invalid') ||
    message.includes('Missing') ||
    message.includes('must be')
  ) {
    return { exitCode: EXIT_USAGE, message, json };
  }

  return { exitCode: EXIT_GENERIC, message, json };
}
