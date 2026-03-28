/**
 * I normalize the daemon's mixed provider payloads into one stable media list.
 */

import type { MediaItem, Provider, SearchKind } from './types.js';

/**
 * I normalize a provider payload into one UI-ready list.
 */
export function normalizeMediaItems(provider: Provider, kind: SearchKind, payload: unknown): MediaItem[] {
  if (Array.isArray(payload)) {
    return normalizeArray(provider, kind, payload);
  }

  if (payload && typeof payload === 'object') {
    return normalizeObject(provider, kind, payload as Record<string, unknown>);
  }

  return [];
}

function normalizeObject(provider: Provider, kind: SearchKind, payload: Record<string, unknown>): MediaItem[] {
  if (provider === 'spotify') {
    const key = kind === 'song' ? 'tracks' : `${kind}s`;
    return kind === 'song'
      ? normalizeArray(provider, kind, unwrapSpotifyItems(payload[key]))
      : normalizeArray(provider, kind, unwrapSpotifyItems(payload[key === 'playlists' ? 'playlists' : key]));
  }

  const key = kind === 'song' ? 'songs' : `${kind}s`;
  return normalizeArray(provider, kind, payload[key]);
}

function normalizeArray(provider: Provider, kind: SearchKind, payload: unknown): MediaItem[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload.flatMap((value) => {
    if (!value || typeof value !== 'object') {
      return [];
    }

    const item = value as Record<string, unknown>;
    const title = firstString(item.name, item.title);
    if (!title) {
      return [];
    }

    const id = firstString(item.id) ?? title;
    return [{
      album: firstString(item.album, item.albumName),
      durationMs: firstNumber(item.durationMs),
      id,
      imageUrl: firstString(item.imageUrl, item.thumbnailUrl),
      kind,
      provider,
      subtitle: firstString(item.artist, item.artistName, item.owner, item.curatorName, item.author, item.publisher),
      title,
      uri: firstString(item.uri) ?? defaultUri(provider, kind, id),
      url: firstString(item.url),
    }];
  });
}

function unwrapSpotifyItems(payload: unknown): unknown[] {
  if (payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown[] }).items)) {
    return (payload as { items: unknown[] }).items;
  }
  return Array.isArray(payload) ? payload : [];
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.length > 0);
}

function firstNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function defaultUri(provider: Provider, kind: SearchKind, id: string): string | undefined {
  if (provider === 'spotify') {
    return `spotify:${kind === 'song' ? 'track' : kind}:${id}`;
  }
  if (provider === 'apple') {
    return `apple:${kind}:${id}`;
  }
  if (provider === 'youtube') {
    if (kind === 'playlist') {
      return `youtube:playlist:${id}`;
    }
    if (kind === 'song') {
      return `youtube:video:${id}`;
    }
    return undefined;
  }
  return undefined;
}
