/**
 * I centralize the small web-shell safety and capability helpers so the UI can
 * stay honest without duplicating provider rules.
 */

import { getDaemonPlaybackTarget, type MediaItem, type ProviderStatus } from './types.js';

export type DaemonControlAction = 'next' | 'pause' | 'previous';

export interface AvailabilityResult {
  enabled: boolean;
  reason?: string;
}

/**
 * I escape user/provider-controlled strings before they are interpolated into
 * the small static HTML shell.
 */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * I return the honest local action label for one media item.
 */
export function getLocalActionLabel(item: MediaItem): string {
  return item.provider === 'apple' ? 'Open In Apple Music' : 'Open Here';
}

/**
 * I tell the web shell whether one provider control is actually available.
 */
export function getDaemonControlAvailability(
  providerStatus: ProviderStatus | undefined,
  action: DaemonControlAction,
): AvailabilityResult {
  const capabilities = providerStatus?.capabilities;
  if (!capabilities?.playback) {
    return {
      enabled: false,
      reason: 'I can browse this provider here, but daemon playback is not available on this host.',
    };
  }

  if (capabilities[action] === false) {
    return {
      enabled: false,
      reason: `I cannot ${action} this provider from the daemon runtime on this host.`,
    };
  }

  return { enabled: true };
}

/**
 * I gate daemon-side play actions to the item/provider combinations the daemon
 * can actually honor.
 */
export function getDaemonPlayAvailability(
  item: MediaItem,
  providerStatus: ProviderStatus | undefined,
): AvailabilityResult {
  const capabilities = providerStatus?.capabilities;
  const target = getDaemonPlaybackTarget(item);

  if (!capabilities?.playback) {
    return {
      enabled: false,
      reason: 'I can browse this provider here, but daemon playback is not available on this host.',
    };
  }

  if (!target) {
    return {
      enabled: false,
      reason: 'I could not derive a daemon playback target for that item.',
    };
  }

  if (item.provider === 'spotify') {
    return { enabled: true };
  }

  if (item.provider === 'apple') {
    if (item.kind !== 'song') {
      return {
        enabled: false,
        reason: 'Apple daemon playback only supports song items in this build.',
      };
    }
    return { enabled: true };
  }

  if (item.kind !== 'song') {
    return {
      enabled: false,
      reason: 'YouTube daemon playback only supports individual songs in this build.',
    };
  }

  if (target.startsWith('youtube:video:') || target.startsWith('http://') || target.startsWith('https://')) {
    return { enabled: true };
  }

  return {
    enabled: false,
    reason: 'I need a YouTube Music video target before the daemon can play that item.',
  };
}

/**
 * I return the status-aware message for the now-playing panel.
 */
export function getNowPlayingMessage(
  providerStatus: ProviderStatus | undefined,
  provider: string,
  nowPlaying: { artist?: string; name?: string; provider?: string } | null,
): string {
  if (!providerStatus?.capabilities?.playback) {
    return 'I can browse this provider here, but playback is not available on this host.';
  }

  if (!nowPlaying?.name) {
    return 'I do not see active playback for this provider.';
  }

  return `${nowPlaying.name} by ${nowPlaying.artist ?? 'Unknown artist'} (${nowPlaying.provider ?? provider})`;
}
