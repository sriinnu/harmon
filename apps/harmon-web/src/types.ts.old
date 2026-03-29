/**
 * I define the normalized provider and media shapes the web app renders.
 */

export type Provider = 'spotify' | 'apple' | 'youtube';
export type SearchKind = 'song' | 'album' | 'artist' | 'playlist';

export interface MediaItem {
  album?: string;
  durationMs?: number;
  id: string;
  imageUrl?: string;
  kind: SearchKind;
  provider: Provider;
  subtitle?: string;
  title: string;
  uri?: string;
  url?: string;
}

export interface ProviderStatus {
  auth?: string;
  capabilities?: Record<string, boolean>;
  connected: boolean;
  name?: string;
  playbackMode?: string;
  status?: string;
}

export interface DaemonStatus {
  isRunning: boolean;
  providers?: Record<string, ProviderStatus>;
  spotifyConnected: boolean;
  version: string;
}

/**
 * I return the provider-native target the daemon expects for one media item.
 */
export function getDaemonPlaybackTarget(item: MediaItem): string | undefined {
  return item.uri ?? item.url ?? getFallbackTarget(item);
}

/**
 * I return the best local browser or app URL for one media item.
 */
export function getLocalPlaybackUrl(item: MediaItem): string | undefined {
  if (item.url && isSafeProviderPlaybackUrl(item.url, item.provider)) {
    return item.url;
  }

  const target = getDaemonPlaybackTarget(item);
  if (!target) {
    return undefined;
  }

  if (target.startsWith('spotify:')) {
    return target;
  }

  if (target.startsWith('youtube:video:')) {
    return `https://music.youtube.com/watch?v=${target.replace('youtube:video:', '')}`;
  }

  if (target.startsWith('youtube:playlist:')) {
    return `https://music.youtube.com/playlist?list=${target.replace('youtube:playlist:', '')}`;
  }

  return isSafeProviderPlaybackUrl(target, item.provider) ? target : undefined;
}

function getFallbackTarget(item: MediaItem): string | undefined {
  if (item.provider === 'spotify') {
    return `spotify:${item.kind === 'song' ? 'track' : item.kind}:${item.id}`;
  }

  if (item.provider === 'apple') {
    return `apple:${item.kind}:${item.id}`;
  }

  if (item.provider === 'youtube') {
    if (item.kind === 'playlist') {
      return `youtube:playlist:${item.id}`;
    }
    if (item.kind === 'song') {
      return `youtube:video:${item.id}`;
    }
    return undefined;
  }

  return undefined;
}

/**
 * I only open provider-owned HTTPS URLs so the browser shell does not navigate
 * to arbitrary locations from daemon or upstream payloads.
 */
function isSafeProviderPlaybackUrl(candidate: string, provider: Provider): boolean {
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:') {
      return false;
    }

    return getAllowedProviderHosts(provider).some((host) => {
      return url.hostname === host || url.hostname.endsWith(`.${host}`);
    });
  } catch {
    return false;
  }
}

function getAllowedProviderHosts(provider: Provider): string[] {
  switch (provider) {
    case 'spotify':
      return ['open.spotify.com'];
    case 'apple':
      return ['music.apple.com'];
    case 'youtube':
      return ['music.youtube.com', 'www.youtube.com', 'youtube.com'];
  }
}
