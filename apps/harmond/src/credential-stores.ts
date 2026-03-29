/**
 * credential-stores.ts — Encrypted credential stores for Spotify, Apple Music, and YouTube
 *
 * Creates TokenStore and CookieStore implementations that persist
 * provider credentials in the daemon's HarmonStore, optionally
 * encrypting them with the configured Encryptor.
 *
 * Extracted from Harmond to keep credential I/O logic isolated
 * from the main orchestrator.
 *
 * @module credential-stores
 */

import type { HarmonStore } from '@sriinnu/harmon-store';
import type { Encryptor } from '@sriinnu/harmon-crypto';
import type { Logger } from '@sriinnu/harmon-logger';
import type {
  TokenStore,
  CookieStore,
  SpotifyTokens,
  SpotifyCookieRecord,
} from '@sriinnu/harmon-spotify';
import type { AppleTokens, AppleTokenStore } from './apple-auth.js';
import type { YouTubeTokens, YouTubeTokenStore } from './youtube-auth.js';

/** Mutable flags that the caller can observe after store operations. */
export interface CredentialLoadFlags {
  spotifyTokenLoadFailure: boolean;
  spotifyCookieLoadFailure: boolean;
  appleTokenLoadFailure?: boolean;
  youtubeTokenLoadFailure?: boolean;
}

/**
 * Create a TokenStore that persists Spotify OAuth tokens in HarmonStore,
 * encrypting them when an Encryptor is available.
 */
export function createSpotifyTokenStore(
  store: HarmonStore,
  encryptor: Encryptor | undefined,
  logger: Logger,
  flags: CredentialLoadFlags,
): TokenStore {
  return {
    get: async () => {
      const raw = await store.getSetting('spotify.tokens');
      if (!raw) return null;
      try {
        const decrypted = encryptor ? encryptor.decrypt(raw) : raw;
        flags.spotifyTokenLoadFailure = false;
        return JSON.parse(decrypted) as SpotifyTokens;
      } catch (error) {
        flags.spotifyTokenLoadFailure = true;
        logger.warn(
          { error: error instanceof Error ? error.message : String(error) },
          'Stored Spotify tokens are unreadable; treating them as degraded auth state',
        );
        return null;
      }
    },
    set: async (tokens) => {
      if (!tokens) {
        flags.spotifyTokenLoadFailure = false;
        await store.deleteSetting('spotify.tokens');
        return;
      }
      const json = JSON.stringify(tokens);
      const value = encryptor ? encryptor.encrypt(json) : json;
      flags.spotifyTokenLoadFailure = false;
      await store.setSetting('spotify.tokens', value);
    },
  };
}

/**
 * Create a CookieStore that persists Spotify browser cookies in HarmonStore,
 * encrypting them when an Encryptor is available.
 */
export function createSpotifyCookieStore(
  store: HarmonStore,
  encryptor: Encryptor | undefined,
  logger: Logger,
  flags: CredentialLoadFlags,
): CookieStore {
  return {
    get: async () => {
      const raw = await store.getSetting('spotify.cookies');
      if (!raw) return null;
      try {
        const decrypted = encryptor ? encryptor.decrypt(raw) : raw;
        flags.spotifyCookieLoadFailure = false;
        return JSON.parse(decrypted) as SpotifyCookieRecord[];
      } catch (error) {
        flags.spotifyCookieLoadFailure = true;
        logger.warn(
          { error: error instanceof Error ? error.message : String(error) },
          'Stored Spotify cookies are unreadable; treating them as degraded auth state',
        );
        return null;
      }
    },
    set: async (cookies) => {
      if (!cookies || cookies.length === 0) {
        flags.spotifyCookieLoadFailure = false;
        await store.deleteSetting('spotify.cookies');
        return;
      }
      const json = JSON.stringify(cookies);
      const value = encryptor ? encryptor.encrypt(json) : json;
      flags.spotifyCookieLoadFailure = false;
      await store.setSetting('spotify.cookies', value);
    },
  };
}

/**
 * Create an AppleTokenStore that persists Apple Music tokens in HarmonStore,
 * encrypting them when an Encryptor is available.
 */
export function createAppleTokenStore(
  store: HarmonStore,
  encryptor: Encryptor | undefined,
  flags: { appleTokenLoadFailure: boolean },
): AppleTokenStore {
  return {
    get: async () => {
      const raw = await store.getSetting('apple.tokens');
      if (!raw) return null;
      try {
        const decrypted = encryptor ? encryptor.decrypt(raw) : raw;
        flags.appleTokenLoadFailure = false;
        return JSON.parse(decrypted) as AppleTokens;
      } catch {
        flags.appleTokenLoadFailure = true;
        return null;
      }
    },
    set: async (tokens) => {
      if (!tokens) {
        flags.appleTokenLoadFailure = false;
        await store.deleteSetting('apple.tokens');
        return;
      }
      const json = JSON.stringify(tokens);
      const value = encryptor ? encryptor.encrypt(json) : json;
      flags.appleTokenLoadFailure = false;
      await store.setSetting('apple.tokens', value);
    },
  };
}

/**
 * Create a YouTubeTokenStore that persists YouTube OAuth tokens in HarmonStore,
 * encrypting them when an Encryptor is available.
 */
export function createYouTubeTokenStore(
  store: HarmonStore,
  encryptor: Encryptor | undefined,
  flags: { youtubeTokenLoadFailure: boolean },
): YouTubeTokenStore {
  return {
    get: async () => {
      const raw = await store.getSetting('youtube.tokens');
      if (!raw) return null;
      try {
        const decrypted = encryptor ? encryptor.decrypt(raw) : raw;
        flags.youtubeTokenLoadFailure = false;
        return JSON.parse(decrypted) as YouTubeTokens;
      } catch {
        flags.youtubeTokenLoadFailure = true;
        return null;
      }
    },
    set: async (tokens) => {
      if (!tokens) {
        flags.youtubeTokenLoadFailure = false;
        await store.deleteSetting('youtube.tokens');
        return;
      }
      const json = JSON.stringify(tokens);
      const value = encryptor ? encryptor.encrypt(json) : json;
      flags.youtubeTokenLoadFailure = false;
      await store.setSetting('youtube.tokens', value);
    },
  };
}
