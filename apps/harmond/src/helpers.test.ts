/**
 * Tests for helpers.ts - Pure parsing and validation utilities
 */

import { describe, it, expect } from 'vitest';
import {
  clampNumber,
  parseBodyString,
  parseBodyNumber,
  parseBodyBoolean,
  isPlainObject,
  parseSearchTypes,
  parseAppleSearchTypes,
  parseYouTubeSearchTypes,
  parseJournalEntry,
  sanitizeImportedSpotifyCookies,
  serializeJournalField,
  parseAppleRemotePlaybackState,
} from './helpers.js';

// ============================================================================
// clampNumber
// ============================================================================

describe('clampNumber', () => {
  it('returns undefined for non-string input', () => {
    expect(clampNumber(42, 0, 100)).toBeUndefined();
    expect(clampNumber(null, 0, 100)).toBeUndefined();
    expect(clampNumber(undefined, 0, 100)).toBeUndefined();
    expect(clampNumber(true, 0, 100)).toBeUndefined();
  });

  it('returns undefined for non-numeric strings', () => {
    expect(clampNumber('abc', 0, 100)).toBeUndefined();
    expect(clampNumber('', 0, 100)).toBeUndefined();
    expect(clampNumber('NaN', 0, 100)).toBeUndefined();
  });

  it('clamps to min', () => {
    expect(clampNumber('-10', 0, 100)).toBe(0);
    expect(clampNumber('0', 5, 100)).toBe(5);
  });

  it('clamps to max', () => {
    expect(clampNumber('200', 0, 100)).toBe(100);
    expect(clampNumber('999', 0, 50)).toBe(50);
  });

  it('passes through valid numbers within range', () => {
    expect(clampNumber('50', 0, 100)).toBe(50);
    expect(clampNumber('1', 0, 10)).toBe(1);
    expect(clampNumber('10', 10, 10)).toBe(10);
  });
});

// ============================================================================
// parseBodyString
// ============================================================================

describe('parseBodyString', () => {
  it('returns string values', () => {
    expect(parseBodyString('hello')).toBe('hello');
    expect(parseBodyString('world')).toBe('world');
  });

  it('returns undefined for non-strings', () => {
    expect(parseBodyString(42)).toBeUndefined();
    expect(parseBodyString(null)).toBeUndefined();
    expect(parseBodyString(undefined)).toBeUndefined();
    expect(parseBodyString(true)).toBeUndefined();
    expect(parseBodyString({})).toBeUndefined();
  });

  it('trims whitespace', () => {
    expect(parseBodyString('  hello  ')).toBe('hello');
    expect(parseBodyString('\thello\n')).toBe('hello');
  });

  it('returns undefined for empty or whitespace-only strings', () => {
    expect(parseBodyString('')).toBeUndefined();
    expect(parseBodyString('   ')).toBeUndefined();
    expect(parseBodyString('\t\n')).toBeUndefined();
  });
});

// ============================================================================
// parseBodyNumber
// ============================================================================

describe('parseBodyNumber', () => {
  it('parses numeric strings', () => {
    expect(parseBodyNumber('42')).toBe(42);
    expect(parseBodyNumber('0')).toBe(0);
    expect(parseBodyNumber('-5')).toBe(-5);
  });

  it('accepts finite numbers directly', () => {
    expect(parseBodyNumber(42)).toBe(42);
    expect(parseBodyNumber(0)).toBe(0);
    expect(parseBodyNumber(3.7)).toBe(3); // truncates
  });

  it('returns undefined for non-finite numbers', () => {
    expect(parseBodyNumber(NaN)).toBeUndefined();
    expect(parseBodyNumber(Infinity)).toBeUndefined();
    expect(parseBodyNumber(-Infinity)).toBeUndefined();
  });

  it('returns undefined for non-numeric input', () => {
    expect(parseBodyNumber('abc')).toBeUndefined();
    expect(parseBodyNumber(null)).toBeUndefined();
    expect(parseBodyNumber(undefined)).toBeUndefined();
    expect(parseBodyNumber(true)).toBeUndefined();
  });
});

// ============================================================================
// parseBodyBoolean
// ============================================================================

describe('parseBodyBoolean', () => {
  it('returns native booleans', () => {
    expect(parseBodyBoolean(true)).toBe(true);
    expect(parseBodyBoolean(false)).toBe(false);
  });

  it('parses boolean strings', () => {
    expect(parseBodyBoolean('true')).toBe(true);
    expect(parseBodyBoolean('false')).toBe(false);
  });

  it('returns undefined for other values', () => {
    expect(parseBodyBoolean('yes')).toBeUndefined();
    expect(parseBodyBoolean(1)).toBeUndefined();
    expect(parseBodyBoolean(null)).toBeUndefined();
    expect(parseBodyBoolean(undefined)).toBeUndefined();
  });
});

// ============================================================================
// isPlainObject
// ============================================================================

describe('isPlainObject', () => {
  it('returns true for plain objects', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ key: 'value' })).toBe(true);
  });

  it('returns false for arrays', () => {
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject([1, 2, 3])).toBe(false);
  });

  it('returns false for null and non-objects', () => {
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject(undefined)).toBe(false);
    expect(isPlainObject('string')).toBe(false);
    expect(isPlainObject(42)).toBe(false);
  });
});

// ============================================================================
// parseSearchTypes (Spotify)
// ============================================================================

describe('parseSearchTypes', () => {
  it('parses comma-separated types', () => {
    expect(parseSearchTypes('track,album')).toEqual(['track', 'album']);
    expect(parseSearchTypes('artist,playlist,episode')).toEqual(['artist', 'playlist', 'episode']);
  });

  it('parses single type', () => {
    expect(parseSearchTypes('track')).toEqual(['track']);
  });

  it('throws on invalid types', () => {
    expect(() => parseSearchTypes('track,invalid')).toThrow('Search type must be one of');
  });

  it('throws on empty string', () => {
    expect(() => parseSearchTypes('')).toThrow('Search type must be one of');
  });

  it('trims whitespace around types', () => {
    expect(parseSearchTypes(' track , album ')).toEqual(['track', 'album']);
  });
});

// ============================================================================
// parseAppleSearchTypes
// ============================================================================

describe('parseAppleSearchTypes', () => {
  it('parses valid Apple search types', () => {
    expect(parseAppleSearchTypes('songs,albums')).toEqual(['songs', 'albums']);
    expect(parseAppleSearchTypes('artists,playlists')).toEqual(['artists', 'playlists']);
  });

  it('throws on invalid types', () => {
    expect(() => parseAppleSearchTypes('songs,tracks')).toThrow('Apple search type must be one of');
  });

  it('throws on empty string', () => {
    expect(() => parseAppleSearchTypes('')).toThrow('Apple search type must be one of');
  });
});

// ============================================================================
// parseYouTubeSearchTypes
// ============================================================================

describe('parseYouTubeSearchTypes', () => {
  it('parses valid YouTube search types', () => {
    expect(parseYouTubeSearchTypes('songs,albums')).toEqual(['songs', 'albums']);
  });

  it('accepts aliases like track, tracks, song', () => {
    expect(parseYouTubeSearchTypes('track')).toEqual(['songs']);
    expect(parseYouTubeSearchTypes('tracks')).toEqual(['songs']);
    expect(parseYouTubeSearchTypes('song')).toEqual(['songs']);
  });

  it('deduplicates normalized types', () => {
    const result = parseYouTubeSearchTypes('song,track,songs,tracks');
    expect(result).toEqual(['songs']);
  });

  it('throws on unrecognised types', () => {
    expect(() => parseYouTubeSearchTypes('episodes')).toThrow('YouTube search type must be one of');
  });

  it('throws on empty string', () => {
    expect(() => parseYouTubeSearchTypes('')).toThrow('YouTube search type must be one of');
  });
});

// ============================================================================
// parseJournalEntry
// ============================================================================

describe('parseJournalEntry', () => {
  it('validates required fields', () => {
    const entry = parseJournalEntry({
      content: 'Feeling calm today',
      source: 'cli',
      device: 'macos',
    });

    expect(entry.content).toBe('Feeling calm today');
    expect(entry.source).toBe('cli');
    expect(entry.device).toBe('macos');
    expect(entry.moodTags).toEqual([]);
  });

  it('rejects non-object input', () => {
    expect(() => parseJournalEntry(null)).toThrow('Invalid journal entry');
    expect(() => parseJournalEntry('string')).toThrow('Invalid journal entry');
    expect(() => parseJournalEntry(42)).toThrow('Invalid journal entry');
    expect(() => parseJournalEntry([])).toThrow('Invalid journal entry');
  });

  it('rejects missing content', () => {
    expect(() => parseJournalEntry({ source: 'cli' })).toThrow('content is required');
  });

  it('rejects empty content', () => {
    expect(() => parseJournalEntry({ content: '   ' })).toThrow('content is required');
  });

  it('validates mood tags as array', () => {
    expect(() => parseJournalEntry({ content: 'test', moodTags: 'not-array' })).toThrow(
      'moodTags must be an array',
    );
  });

  it('parses valid mood tags', () => {
    const entry = parseJournalEntry({
      content: 'test',
      moodTags: ['calm', 'focused', '  ', 42, 'happy'],
    });

    // Filters non-strings and empty strings, trims whitespace
    expect(entry.moodTags).toEqual(['calm', 'focused', 'happy']);
  });

  it('limits mood tags to 20', () => {
    const tags = Array.from({ length: 25 }, (_, i) => `tag-${i}`);
    const entry = parseJournalEntry({ content: 'test', moodTags: tags });
    expect(entry.moodTags).toHaveLength(20);
  });

  it('rejects non-object context', () => {
    expect(() => parseJournalEntry({ content: 'test', context: 'string' })).toThrow(
      'context must be an object',
    );
    expect(() => parseJournalEntry({ content: 'test', context: [1, 2] })).toThrow(
      'context must be an object',
    );
  });

  it('rejects non-object policy', () => {
    expect(() => parseJournalEntry({ content: 'test', policy: 'string' })).toThrow(
      'policy must be an object',
    );
  });

  it('defaults source to cli and device to linux', () => {
    const entry = parseJournalEntry({ content: 'test' });
    expect(entry.source).toBe('cli');
    expect(entry.device).toBe('linux');
  });

  it('truncates long content to 10000 characters', () => {
    const longContent = 'x'.repeat(20000);
    const entry = parseJournalEntry({ content: longContent });
    expect(entry.content).toHaveLength(10000);
  });
});

// ============================================================================
// sanitizeImportedSpotifyCookies
// ============================================================================

describe('sanitizeImportedSpotifyCookies', () => {
  it('keeps valid sp_dc cookies', () => {
    const records = [
      {
        domain: '.spotify.com',
        name: 'sp_dc',
        path: '/',
        value: 'test-value-123',
        isSecure: true,
        isHTTPOnly: true,
      },
    ];

    const result = sanitizeImportedSpotifyCookies(records);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('sp_dc');
    expect(result[0].value).toBe('test-value-123');
  });

  it('keeps valid sp_key cookies', () => {
    const records = [
      {
        domain: 'open.spotify.com',
        name: 'sp_key',
        path: '/',
        value: 'key-value',
        isSecure: true,
        isHTTPOnly: true,
      },
    ];

    const result = sanitizeImportedSpotifyCookies(records);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('sp_key');
  });

  it('rejects non-spotify cookies', () => {
    const records = [
      {
        domain: 'example.com',
        name: 'sp_dc',
        path: '/',
        value: 'test',
        isSecure: true,
        isHTTPOnly: true,
      },
    ];

    const result = sanitizeImportedSpotifyCookies(records);
    expect(result).toHaveLength(0);
  });

  it('rejects cookies with non-sp names', () => {
    const records = [
      {
        domain: '.spotify.com',
        name: 'session_id',
        path: '/',
        value: 'test',
        isSecure: true,
        isHTTPOnly: true,
      },
    ];

    const result = sanitizeImportedSpotifyCookies(records);
    expect(result).toHaveLength(0);
  });

  it('truncates long values to 4096 bytes', () => {
    const longValue = 'x'.repeat(5000);
    const records = [
      {
        domain: '.spotify.com',
        name: 'sp_dc',
        path: '/',
        value: longValue,
        isSecure: true,
        isHTTPOnly: true,
      },
    ];

    const result = sanitizeImportedSpotifyCookies(records);
    expect(result).toHaveLength(1);
    expect(result[0].value).toHaveLength(4096);
  });

  it('normalizes domain by stripping leading dots', () => {
    const records = [
      {
        domain: '...spotify.com',
        name: 'sp_dc',
        path: '/',
        value: 'test',
        isSecure: true,
        isHTTPOnly: true,
      },
    ];

    const result = sanitizeImportedSpotifyCookies(records);
    expect(result).toHaveLength(1);
    expect(result[0].domain).toBe('spotify.com');
  });

  it('skips null and non-object records', () => {
    const records = [null, 'string', 42, undefined];
    const result = sanitizeImportedSpotifyCookies(records);
    expect(result).toHaveLength(0);
  });

  it('deduplicates by domain+path+name', () => {
    const records = [
      {
        domain: '.spotify.com',
        name: 'sp_dc',
        path: '/',
        value: 'first',
        isSecure: true,
        isHTTPOnly: true,
      },
      {
        domain: '.spotify.com',
        name: 'sp_dc',
        path: '/',
        value: 'second',
        isSecure: true,
        isHTTPOnly: true,
      },
    ];

    const result = sanitizeImportedSpotifyCookies(records);
    expect(result).toHaveLength(1);
    // Last wins
    expect(result[0].value).toBe('second');
  });
});

// ============================================================================
// serializeJournalField
// ============================================================================

describe('serializeJournalField', () => {
  it('serializes a valid object', () => {
    const result = serializeJournalField({ key: 'value' }, 'context', 10000);
    expect(result).toBe('{"key":"value"}');
  });

  it('returns undefined for undefined input', () => {
    expect(serializeJournalField(undefined, 'context', 10000)).toBeUndefined();
  });

  it('throws for oversize payloads', () => {
    const huge = { data: 'x'.repeat(20000) };
    expect(() => serializeJournalField(huge, 'context', 100)).toThrow('exceeds 100 bytes');
  });
});

// ============================================================================
// parseAppleRemotePlaybackState
// ============================================================================

describe('parseAppleRemotePlaybackState', () => {
  it('returns valid states', () => {
    expect(parseAppleRemotePlaybackState('paused')).toBe('paused');
    expect(parseAppleRemotePlaybackState('playing')).toBe('playing');
    expect(parseAppleRemotePlaybackState('stopped')).toBe('stopped');
  });

  it('returns undefined when value is undefined', () => {
    expect(parseAppleRemotePlaybackState(undefined)).toBeUndefined();
  });

  it('throws for invalid values', () => {
    expect(() => parseAppleRemotePlaybackState('buffering')).toThrow('Invalid Apple remote playbackState');
    expect(() => parseAppleRemotePlaybackState(42)).toThrow('Invalid Apple remote playbackState');
  });
});
