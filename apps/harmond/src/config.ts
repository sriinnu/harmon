/**
 * I keep daemon startup validation in one place so production safety checks
 * fail before the HTTP surface starts accepting traffic.
 */

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const SPOTIFY_CALLBACK_PATH = '/v1/auth/spotify/callback';

export interface DaemonEnvironmentOptions {
  apiToken?: string;
  corsOrigins: string[];
  encryptionSecret?: string;
  host: string;
  nodeEnv?: string;
  port: number;
  spotifyClientId?: string;
  spotifyRedirectUri?: string;
}

export interface ValidatedDaemonEnvironment {
  isProduction: boolean;
  spotifyRedirectUri: string;
}

/**
 * I validate the daemon's environment contract before runtime state is created.
 */
export function validateDaemonEnvironment(
  options: DaemonEnvironmentOptions,
): ValidatedDaemonEnvironment {
  const isProduction = options.nodeEnv === 'production';
  const spotifyClientId = normalizeOptionalString(options.spotifyClientId);
  const spotifyRedirectUri = normalizeOptionalString(options.spotifyRedirectUri);
  const spotifyOAuthConfigured = Boolean(spotifyClientId || spotifyRedirectUri);

  if (isProduction && !options.apiToken) {
    throw new Error('HARMON_API_TOKEN is required in production.');
  }

  // The security model leans on the loopback bind: without a token, every
  // endpoint (playback, cookies, journal) is open to whoever can reach the
  // port. Never allow an unauthenticated daemon on a routable interface.
  if (!isLoopbackBindHost(options.host) && !options.apiToken) {
    throw new Error(
      `HARMON_API_TOKEN is required when binding to a non-loopback address (${options.host}).`,
    );
  }

  if (isProduction && !options.encryptionSecret) {
    throw new Error('HARMON_ENCRYPTION_SECRET is required in production.');
  }

  if (isProduction && options.corsOrigins.includes('*')) {
    throw new Error('HARMON_CORS_ORIGINS cannot include "*" in production.');
  }

  // Wildcard CORS on a tokenless daemon lets any website the user visits
  // read their listening data and drive playback cross-origin. Require a
  // token before reflecting arbitrary origins, in every environment.
  if (options.corsOrigins.includes('*') && !options.apiToken) {
    throw new Error('HARMON_CORS_ORIGINS="*" requires HARMON_API_TOKEN to be set.');
  }

  if (isProduction && spotifyRedirectUri && !spotifyClientId) {
    throw new Error('SPOTIFY_CLIENT_ID is required when SPOTIFY_REDIRECT_URI is set in production.');
  }

  return {
    isProduction,
    spotifyRedirectUri: resolveSpotifyRedirectUri(options, isProduction, spotifyOAuthConfigured),
  };
}

/**
 * I force an explicit production callback URL so OAuth never depends on an
 * inferred bind address once the daemon is deployed.
 */
function resolveSpotifyRedirectUri(
  options: DaemonEnvironmentOptions,
  isProduction: boolean,
  spotifyOAuthConfigured: boolean,
): string {
  const redirectUri =
    options.spotifyRedirectUri ||
    `http://${options.host}:${options.port}${SPOTIFY_CALLBACK_PATH}`;

  if (isProduction && spotifyOAuthConfigured && !options.spotifyRedirectUri) {
    throw new Error('SPOTIFY_REDIRECT_URI is required in production.');
  }

  const parsed = new URL(redirectUri);

  if (parsed.pathname !== SPOTIFY_CALLBACK_PATH) {
    throw new Error(`SPOTIFY_REDIRECT_URI must use the ${SPOTIFY_CALLBACK_PATH} callback path.`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('SPOTIFY_REDIRECT_URI must use http or https.');
  }

  if (isProduction && parsed.protocol === 'http:' && !isLoopbackHostname(parsed.hostname)) {
    throw new Error(
      'SPOTIFY_REDIRECT_URI must use https in production unless it points to a loopback host.',
    );
  }

  return parsed.toString();
}

/**
 * I treat loopback callback hosts as the only safe plain-http production case.
 */
function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_HOSTNAMES.has(hostname.toLowerCase());
}

/**
 * I decide whether a bind address keeps the daemon local-only. Wildcard
 * binds expose every interface, so they count as non-loopback.
 */
function isLoopbackBindHost(host: string): boolean {
  return isLoopbackHostname(host);
}

/**
 * I normalize blank environment strings so validation can reason about intent
 * instead of raw shell values.
 */
function normalizeOptionalString(value?: string): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}
