/**
 * helpers.ts — Pure parsing and validation utilities for daemon route handlers
 *
 * Every function here is stateless and independently testable.
 * Route modules import these instead of relying on Harmond instance methods.
 *
 * @module helpers
 */

import { SessionPolicy } from '@sriinnu/harmon-protocol';
import type { SpotifyCookieRecord } from '@sriinnu/harmon-spotify';
import { ValidationError } from './errors.js';

// ============================================================================
// JournalEntryInput — the validated shape route handlers work with
// ============================================================================

/**
 * Validated journal entry payload produced by {@link parseJournalEntry}.
 * Route handlers pass this to `HarmonStore.addJournalEntry()`.
 */
export interface JournalEntryInput {
  content: string;
  context?: Record<string, unknown>;
  device: string;
  energyLevel?: string;
  moodTags: string[];
  policy?: SessionPolicy;
  sessionId?: string;
  source: string;
}

// ============================================================================
// Primitive parsing helpers
// ============================================================================

/**
 * Parse a numeric string and clamp it into the inclusive [min, max] range.
 * Returns `undefined` when the value is not a finite integer string.
 */
export function clampNumber(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== 'string') return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(max, Math.max(min, parsed));
}

/**
 * Trim a string body field, returning `undefined` for empty or non-string values.
 */
export function parseBodyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Parse a body field as a finite integer.
 * Accepts both `number` and numeric `string` inputs.
 */
export function parseBodyNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value !== 'string') return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Parse a body field as a boolean.
 * Accepts native booleans and the strings `"true"` / `"false"`.
 */
export function parseBodyBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

// ============================================================================
// Object / JSON helpers
// ============================================================================

/**
 * Return `true` when the value is a plain object (not an array or null).
 * Used to guard journal `context` and `policy` fields before serialization.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * JSON-serialize a structured journal field, rejecting payloads that exceed
 * the given byte limit.  Throws {@link ValidationError} for non-serializable
 * or oversize values instead of silently truncating JSON mid-token.
 */
export function serializeJournalField(
  value: Record<string, unknown> | SessionPolicy | undefined,
  fieldName: 'context' | 'policy',
  maxBytes: number,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new ValidationError(`Invalid journal entry: ${fieldName} must be JSON serializable`);
  }

  if (Buffer.byteLength(serialized, 'utf8') > maxBytes) {
    throw new ValidationError(`Invalid journal entry: ${fieldName} exceeds ${maxBytes} bytes once serialized`);
  }

  return serialized;
}

// ============================================================================
// Apple remote playback state
// ============================================================================

/**
 * Parse and validate the `playbackState` field sent by Apple remote companions.
 * Throws {@link ValidationError} for values outside the allowed enum.
 */
export function parseAppleRemotePlaybackState(value: unknown): 'paused' | 'playing' | 'stopped' | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === 'paused' || value === 'playing' || value === 'stopped') {
    return value;
  }
  throw new ValidationError('Invalid Apple remote playbackState');
}

// ============================================================================
// Journal entry parsing
// ============================================================================

/**
 * Validate and normalize a raw journal entry payload from an HTTP request body.
 * Returns a {@link JournalEntryInput} ready for persistence.
 *
 * Throws {@link ValidationError} for structurally invalid input such as
 * missing `content`, non-array `moodTags`, or a malformed `policy`.
 */
export function parseJournalEntry(value: unknown): JournalEntryInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('Invalid journal entry');
  }

  const entry = value as Record<string, unknown>;
  const content = parseBodyString(entry.content);
  if (!content) {
    throw new ValidationError('Invalid journal entry: content is required');
  }

  if (entry.moodTags !== undefined && !Array.isArray(entry.moodTags)) {
    throw new ValidationError('Invalid journal entry: moodTags must be an array');
  }

  const moodTags = Array.isArray(entry.moodTags)
    ? entry.moodTags
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)
        .slice(0, 20)
    : [];

  if (entry.context !== undefined && !isPlainObject(entry.context)) {
    throw new ValidationError('Invalid journal entry: context must be an object');
  }

  let policy: SessionPolicy | undefined;
  if (entry.policy !== undefined) {
    if (!isPlainObject(entry.policy)) {
      throw new ValidationError('Invalid journal entry: policy must be an object');
    }
    const policyResult = SessionPolicy.safeParse(entry.policy);
    if (!policyResult.success) {
      throw new ValidationError(
        `Invalid journal entry: policy ${policyResult.error.issues.map((issue) => issue.message).join(', ')}`,
        policyResult.error.issues,
      );
    }
    policy = policyResult.data;
  }

  return {
    content: content.slice(0, 10000),
    context: entry.context as Record<string, unknown> | undefined,
    device: (parseBodyString(entry.device) || 'linux').slice(0, 50),
    energyLevel: parseBodyString(entry.energyLevel)?.slice(0, 50),
    moodTags,
    policy,
    sessionId: parseBodyString(entry.sessionId),
    source: (parseBodyString(entry.source) || 'cli').slice(0, 50),
  };
}

// ============================================================================
// Search type parsers (one per provider)
// ============================================================================

/** Valid Spotify search type literals. */
export type SpotifySearchType = 'track' | 'album' | 'artist' | 'playlist' | 'episode' | 'show';

/**
 * Parse a comma-separated Spotify search type string into a validated array.
 * Throws {@link ValidationError} when the string is empty or contains unknown types.
 */
export function parseSearchTypes(value: string): SpotifySearchType[] {
  const allowed = new Set<string>(['track', 'album', 'artist', 'playlist', 'episode', 'show']);
  const requested = value.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  if (requested.length === 0) {
    throw new ValidationError('Search type must be one of: track, album, artist, playlist, episode, show');
  }
  if (requested.some((entry) => !allowed.has(entry))) {
    throw new ValidationError('Search type must be one of: track, album, artist, playlist, episode, show');
  }
  return requested as SpotifySearchType[];
}

/** Valid Apple Music search type literals. */
export type AppleSearchType = 'songs' | 'albums' | 'artists' | 'playlists';

/**
 * Parse a comma-separated Apple Music search type string into a validated array.
 * Throws {@link ValidationError} when the string is empty or contains unknown types.
 */
export function parseAppleSearchTypes(value: string): AppleSearchType[] {
  const allowed = new Set<string>(['songs', 'albums', 'artists', 'playlists']);
  const requested = value.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  if (requested.length === 0) {
    throw new ValidationError('Apple search type must be one of: songs, albums, artists, playlists');
  }
  if (requested.some((entry) => !allowed.has(entry))) {
    throw new ValidationError('Apple search type must be one of: songs, albums, artists, playlists');
  }
  return requested as AppleSearchType[];
}

/** Valid YouTube Music search type literals. */
export type YouTubeSearchType = 'songs' | 'albums' | 'artists' | 'playlists';

/**
 * Parse a comma-separated YouTube Music search type string into a validated array.
 * Accepts common aliases (e.g. `"song"`, `"track"`, `"tracks"`) and deduplicates.
 * Throws {@link ValidationError} for unrecognised types.
 */
export function parseYouTubeSearchTypes(value: string): YouTubeSearchType[] {
  const requested = value.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  const normalized = requested.map((entry) => {
    if (entry === 'song' || entry === 'songs' || entry === 'track' || entry === 'tracks') return 'songs';
    if (entry === 'album' || entry === 'albums') return 'albums';
    if (entry === 'artist' || entry === 'artists') return 'artists';
    if (entry === 'playlist' || entry === 'playlists') return 'playlists';
    return null;
  });
  if (normalized.length === 0 || normalized.some((entry) => entry === null)) {
    throw new ValidationError('YouTube search type must be one of: song, songs, track, tracks, album, albums, artist, artists, playlist, playlists');
  }
  return Array.from(new Set(normalized.filter((entry): entry is YouTubeSearchType => entry !== null)));
}

// ============================================================================
// Spotify cookie sanitization
// ============================================================================

/**
 * Sanitize an array of raw imported Spotify cookie records.
 *
 * Only `sp_dc` and `sp_key` cookies on recognised Spotify domains are kept.
 * Duplicate domain+path+name combinations are deduplicated (last wins).
 * Cookie values are truncated to 4 096 bytes as a safety rail.
 */
export function sanitizeImportedSpotifyCookies(records: unknown[]): SpotifyCookieRecord[] {
  const sanitized = new Map<string, SpotifyCookieRecord>();

  for (const record of records) {
    if (!record || typeof record !== 'object') {
      continue;
    }

    const value = record as Partial<SpotifyCookieRecord>;
    const domain = typeof value.domain === 'string' ? value.domain.trim().toLowerCase().replace(/^\.+/, '') : '';
    const name = typeof value.name === 'string' ? value.name.trim() : '';
    const path = typeof value.path === 'string' ? value.path.trim() : '/';

    if (!['spotify.com', 'open.spotify.com'].includes(domain)) {
      continue;
    }
    if (!['sp_dc', 'sp_key'].includes(name)) {
      continue;
    }
    if (!path.startsWith('/')) {
      continue;
    }
    if (typeof value.value !== 'string') {
      continue;
    }

    sanitized.set(`${domain}:${path}:${name}`, {
      domain,
      name,
      path,
      value: value.value.slice(0, 4096),
      expires: typeof value.expires === 'string' ? value.expires : null,
      isSecure: value.isSecure === true,
      isHTTPOnly: value.isHTTPOnly === true,
    });
  }

  return Array.from(sanitized.values());
}
