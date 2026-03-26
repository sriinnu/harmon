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

  if (isProduction && !options.apiToken) {
    throw new Error('HARMON_API_TOKEN is required in production.');
  }

  if (isProduction && !options.encryptionSecret) {
    throw new Error('HARMON_ENCRYPTION_SECRET is required in production.');
  }

  if (isProduction && options.corsOrigins.includes('*')) {
    throw new Error('HARMON_CORS_ORIGINS cannot include "*" in production.');
  }

  return {
    isProduction,
    spotifyRedirectUri: resolveSpotifyRedirectUri(options, isProduction),
  };
}

/**
 * I force an explicit production callback URL so OAuth never depends on an
 * inferred bind address once the daemon is deployed.
 */
function resolveSpotifyRedirectUri(
  options: DaemonEnvironmentOptions,
  isProduction: boolean,
): string {
  const redirectUri =
    options.spotifyRedirectUri ||
    `http://${options.host}:${options.port}${SPOTIFY_CALLBACK_PATH}`;

  if (isProduction && !options.spotifyRedirectUri) {
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
