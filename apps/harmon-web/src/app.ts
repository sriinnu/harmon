/**
 * I wire the minimal DOM shell onto the normalized Harmon web client.
 */

import { HarmonWebClient } from './api.js';
import {
  getDaemonPlaybackTarget,
  getLocalPlaybackUrl,
  type MediaItem,
  type Provider,
  type ProviderStatus,
  type SearchKind,
} from './types.js';
import {
  escapeHtml,
  getDaemonControlAvailability,
  getDaemonPlayAvailability,
  getLocalActionLabel,
  getNowPlayingMessage,
} from './ui.js';

const elements = {
  daemonUrl: document.querySelector<HTMLInputElement>('#daemon-url'),
  token: document.querySelector<HTMLInputElement>('#api-token'),
  provider: document.querySelector<HTMLSelectElement>('#provider'),
  searchForm: document.querySelector<HTMLFormElement>('#search-form'),
  kind: document.querySelector<HTMLSelectElement>('#search-kind'),
  query: document.querySelector<HTMLInputElement>('#search-query'),
  status: document.querySelector<HTMLElement>('#status'),
  nowPlaying: document.querySelector<HTMLElement>('#now-playing'),
  playlistContext: document.querySelector<HTMLElement>('#playlist-context'),
  transportNote: document.querySelector<HTMLElement>('#transport-note'),
  error: document.querySelector<HTMLElement>('#error'),
  searchResults: document.querySelector<HTMLElement>('#search-results'),
  libraryResults: document.querySelector<HTMLElement>('#library-results'),
  playlists: document.querySelector<HTMLElement>('#playlists'),
  playlistTracks: document.querySelector<HTMLElement>('#playlist-tracks'),
};

let client = createClient();
let selectedProvider = getProvider();
let selectedProviderStatus: ProviderStatus | undefined;
let providerScope = 0;
const requestState = {
  library: 0,
  nowPlaying: 0,
  playlists: 0,
  playlistTracks: 0,
  search: 0,
  status: 0,
};

/**
 * I bootstrap the event wiring for the static web shell.
 */
function main(): void {
  document.querySelector('#refresh-status')?.addEventListener('click', () => void refreshStatus());
  elements.searchForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    void runSearch();
  });
  document.querySelector('#load-library')?.addEventListener('click', () => void loadLibrary());
  document.querySelector('#load-playlists')?.addEventListener('click', () => void loadPlaylists());
  document.querySelector('#pause-button')?.addEventListener('click', () => void control('pause'));
  document.querySelector('#next-button')?.addEventListener('click', () => void control('next'));
  document.querySelector('#previous-button')?.addEventListener('click', () => void control('previous'));
  elements.provider?.addEventListener('change', () => {
    selectedProvider = getProvider();
    providerScope += 1;
    resetProviderSurface();
    void refreshStatus();
  });
  elements.daemonUrl?.addEventListener('change', () => {
    client = createClient();
    providerScope += 1;
    resetProviderSurface();
    void refreshStatus();
  });
  elements.token?.addEventListener('change', () => {
    client = createClient();
    providerScope += 1;
    resetProviderSurface();
    void refreshStatus();
  });
  updatePlaybackControls();
  void refreshStatus();
}

async function refreshStatus(): Promise<void> {
  const scope = captureScope();
  const requestId = nextRequest('status');
  try {
    clearError();
    selectedProviderStatus = undefined;
    updatePlaybackControls();
    renderTransportNote('I am checking provider playback capabilities…');
    renderNowPlayingMessageBlock('I am checking playback state for this provider.');
    const status = await client.fetchStatus();
    if (!isRequestCurrent('status', requestId, scope)) {
      return;
    }
    const providerStatus = status.providers?.[selectedProvider];
    selectedProviderStatus = providerStatus;
    renderStatus([
      `Daemon: ${status.isRunning ? 'running' : 'stopped'}`,
      `Version: ${status.version}`,
      `Provider: ${selectedProvider}`,
      `Provider status: ${providerStatus?.status ?? 'unknown'}`,
      `Playback mode: ${providerStatus?.playbackMode ?? 'unknown'}`,
    ]);
    updatePlaybackControls();
    renderTransportNote(getTransportSummary(providerStatus));
    if (!providerStatus?.capabilities?.playback) {
      renderNowPlaying(null);
      return;
    }
    try {
      const nowPlaying = await client.fetchNowPlaying(selectedProvider);
      if (!isRequestCurrent('status', requestId, scope)) {
        return;
      }
      renderNowPlaying(nowPlaying as { artist?: string; name?: string; provider?: string } | null);
    } catch {
      if (!isRequestCurrent('status', requestId, scope)) {
        return;
      }
      renderNowPlayingMessageBlock('I could not load now playing. Check provider auth or playback runtime.');
    }
  } catch (error) {
    if (!isRequestCurrent('status', requestId, scope)) {
      return;
    }
    selectedProviderStatus = undefined;
    updatePlaybackControls();
    renderTransportNote('I could not confirm playback controls yet.');
    renderNowPlayingMessageBlock('I could not load provider status. Check daemon connection or auth.');
    renderError(error);
  }
}

async function runSearch(): Promise<void> {
  const scope = captureScope();
  const requestId = nextRequest('search');
  const query = elements.query?.value.trim() ?? '';
  if (!query) {
    renderError(new Error('I need a search query before I can search.'));
    return;
  }

  try {
    clearError();
    renderMediaList(elements.searchResults, [], 'Searching this provider…');
    const items = await client.search(selectedProvider, query, getKind(), 12);
    if (!isRequestCurrent('search', requestId, scope)) {
      return;
    }
    renderMediaList(elements.searchResults, items);
  } catch (error) {
    if (!isRequestCurrent('search', requestId, scope)) {
      return;
    }
    renderMediaList(elements.searchResults, [], 'I could not load search results for this provider.');
    renderError(error);
  }
}

async function loadLibrary(): Promise<void> {
  const scope = captureScope();
  const requestId = nextRequest('library');
  try {
    clearError();
    renderMediaList(elements.libraryResults, [], 'Loading library tracks…');
    const items = await client.fetchLibraryTracks(selectedProvider, 25);
    if (!isRequestCurrent('library', requestId, scope)) {
      return;
    }
    renderMediaList(elements.libraryResults, items);
  } catch (error) {
    if (!isRequestCurrent('library', requestId, scope)) {
      return;
    }
    renderMediaList(elements.libraryResults, [], 'I could not load library tracks for this provider.');
    renderError(error);
  }
}

async function loadPlaylists(): Promise<void> {
  const scope = captureScope();
  const requestId = nextRequest('playlists');
  try {
    clearError();
    renderPlaylistList([], 'Loading playlists…');
    const items = await client.fetchPlaylists(selectedProvider, 25);
    if (!isRequestCurrent('playlists', requestId, scope)) {
      return;
    }
    renderPlaylistList(items);
  } catch (error) {
    if (!isRequestCurrent('playlists', requestId, scope)) {
      return;
    }
    renderPlaylistList([], 'I could not load playlists for this provider.');
    renderError(error);
  }
}

async function loadPlaylistTracks(item: MediaItem): Promise<void> {
  const scope = captureScope();
  const requestId = nextRequest('playlistTracks');
  try {
    clearError();
    renderPlaylistContext(`Showing tracks from ${item.title}`);
    renderMediaList(elements.playlistTracks, [], 'Loading playlist tracks…');
    const items = await client.fetchPlaylistTracks(item.provider, item.id, 50);
    if (!isRequestCurrent('playlistTracks', requestId, scope)) {
      return;
    }
    renderMediaList(elements.playlistTracks, items);
  } catch (error) {
    if (!isRequestCurrent('playlistTracks', requestId, scope)) {
      return;
    }
    renderPlaylistContext(`I could not load tracks from ${item.title}`);
    renderMediaList(elements.playlistTracks, [], 'I could not load playlist tracks for this provider.');
    renderError(error);
  }
}

async function control(action: 'next' | 'pause' | 'previous'): Promise<void> {
  try {
    clearError();
    if (action === 'pause') {
      await client.pause(selectedProvider);
    } else if (action === 'next') {
      await client.next(selectedProvider);
    } else {
      await client.previous(selectedProvider);
    }
    await refreshStatus();
  } catch (error) {
    renderError(error);
  }
}

function renderStatus(lines: string[]): void {
  if (!elements.status) {
    return;
  }
  elements.status.replaceChildren(...lines.map(createParagraph));
}

function renderNowPlaying(nowPlaying: { artist?: string; name?: string; provider?: string } | null): void {
  renderNowPlayingMessageBlock(getNowPlayingMessage(selectedProviderStatus, selectedProvider, nowPlaying));
}

function renderMediaList(target: HTMLElement | null, items: MediaItem[], emptyMessage = 'No items.'): void {
  if (!target) {
    return;
  }
  target.innerHTML = items.length === 0 ? `<p class="panel-subtle">${escapeHtml(emptyMessage)}</p>` : items.map(renderMediaCard).join('');
  wireMediaActions(target, items);
}

function renderPlaylistList(items: MediaItem[], emptyMessage = 'No playlists.'): void {
  if (!elements.playlists) {
    return;
  }
  elements.playlists.innerHTML = items.length === 0
    ? `<p class="panel-subtle">${escapeHtml(emptyMessage)}</p>`
    : items.map(renderPlaylistCard).join('');
  elements.playlists.querySelectorAll<HTMLButtonElement>('button[data-playlist-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const item = items.find((candidate) => candidate.id === button.dataset.playlistId);
      if (item) {
        void loadPlaylistTracks(item);
      }
    });
  });
}

function renderMediaCard(item: MediaItem): string {
  const daemonPlay = getDaemonPlayAvailability(item, selectedProviderStatus);
  const localUrl = getLocalPlaybackUrl(item);
  const hints = [
    !localUrl ? 'I cannot open that item locally from this shell.' : null,
    !daemonPlay.enabled ? daemonPlay.reason ?? null : null,
  ].filter((value): value is string => Boolean(value));

  return `
    <article class="card">
      <div class="card-media">
        ${item.imageUrl ? `<img class="card-art" src="${escapeHtml(item.imageUrl)}" alt="" />` : '<div class="card-art" aria-hidden="true"></div>'}
        <div class="card-copy">
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.subtitle ?? item.provider)}</p>
        </div>
      </div>
      <div class="actions">
        <button data-open-id="${escapeHtml(item.id)}"${renderDisabledState(
          Boolean(localUrl),
          'I could not derive a local playback target for that item.',
        )}>${escapeHtml(getLocalActionLabel(item))}</button>
        <button data-daemon-id="${escapeHtml(item.id)}"${renderDisabledState(
          daemonPlay.enabled,
          daemonPlay.reason,
        )}>Play On Daemon</button>
      </div>
      ${hints.map((hint) => `<p class="hint">${escapeHtml(hint)}</p>`).join('')}
    </article>
  `;
}

function renderPlaylistCard(item: MediaItem): string {
  const daemonPlay = getDaemonPlayAvailability(item, selectedProviderStatus);
  const hints = [
    !daemonPlay.enabled ? daemonPlay.reason ?? null : null,
  ].filter((value): value is string => Boolean(value));

  return `
    <article class="card">
      <div class="card-media">
        ${item.imageUrl ? `<img class="card-art" src="${escapeHtml(item.imageUrl)}" alt="" />` : '<div class="card-art" aria-hidden="true"></div>'}
        <div class="card-copy">
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.subtitle ?? item.provider)}</p>
        </div>
      </div>
      <div class="actions">
        <button data-playlist-id="${escapeHtml(item.id)}">Load Tracks</button>
        <button data-daemon-id="${escapeHtml(item.id)}"${renderDisabledState(
          daemonPlay.enabled,
          daemonPlay.reason,
        )}>Play On Daemon</button>
      </div>
      ${hints.map((hint) => `<p class="hint">${escapeHtml(hint)}</p>`).join('')}
    </article>
  `;
}

function wireMediaActions(target: HTMLElement, items: MediaItem[]): void {
  target.querySelectorAll<HTMLButtonElement>('button[data-open-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const item = items.find((candidate) => candidate.id === button.dataset.openId);
      if (!item) {
        return;
      }
      const localUrl = getLocalPlaybackUrl(item);
      if (!localUrl) {
        renderError(new Error('I could not derive a local playback URL for that item.'));
        return;
      }
      window.open(localUrl, '_blank', 'noopener,noreferrer');
    });
  });

  target.querySelectorAll<HTMLButtonElement>('button[data-daemon-id]').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.disabled) {
        return;
      }
      const item = items.find((candidate) => candidate.id === button.dataset.daemonId);
      if (!item) {
        return;
      }
      void client.play(item.provider, getDaemonPlaybackTarget(item))
        .then(() => refreshStatus())
        .catch(renderError);
    });
  });
}

function createClient(): HarmonWebClient {
  return new HarmonWebClient({
    baseUrl: elements.daemonUrl?.value || 'http://127.0.0.1:17373',
    token: elements.token?.value || undefined,
  });
}

function getProvider(): Provider {
  return (elements.provider?.value as Provider) || 'spotify';
}

function getKind(): SearchKind {
  return (elements.kind?.value as SearchKind) || 'song';
}

function clearLists(): void {
  renderMediaList(elements.searchResults, []);
  renderMediaList(elements.libraryResults, []);
  renderMediaList(elements.playlistTracks, []);
  renderPlaylistList([]);
  renderPlaylistContext('');
}

/**
 * I keep the transport controls aligned with the daemon capability surface.
 */
function updatePlaybackControls(): void {
  setControlState('#previous-button', getDaemonControlAvailability(selectedProviderStatus, 'previous'));
  setControlState('#pause-button', getDaemonControlAvailability(selectedProviderStatus, 'pause'));
  setControlState('#next-button', getDaemonControlAvailability(selectedProviderStatus, 'next'));
}

function setControlState(selector: string, availability: { enabled: boolean; reason?: string }): void {
  const button = document.querySelector<HTMLButtonElement>(selector);
  if (!button) {
    return;
  }
  button.disabled = !availability.enabled;
  button.title = availability.enabled ? '' : availability.reason ?? '';
}

function renderTransportNote(text: string): void {
  if (!elements.transportNote) {
    return;
  }
  elements.transportNote.textContent = text;
}

function renderDisabledState(enabled: boolean, reason?: string): string {
  if (enabled) {
    return '';
  }
  return ` disabled title="${escapeHtml(reason ?? 'This action is not available.')}"`;
}

function createParagraph(text: string): HTMLParagraphElement {
  const element = document.createElement('p');
  element.textContent = text;
  return element;
}

function renderNowPlayingMessageBlock(text: string): void {
  if (!elements.nowPlaying) {
    return;
  }
  elements.nowPlaying.replaceChildren(createParagraph(text));
}

function renderPlaylistContext(text: string): void {
  if (!elements.playlistContext) {
    return;
  }
  elements.playlistContext.textContent = text;
}

function clearError(): void {
  if (elements.error) {
    elements.error.textContent = '';
  }
}

function renderError(error: unknown): void {
  if (!elements.error) {
    return;
  }
  elements.error.textContent = error instanceof Error ? error.message : String(error);
}

function resetProviderSurface(): void {
  selectedProviderStatus = undefined;
  renderTransportNote('I am waiting on provider status.');
  renderNowPlayingMessageBlock('I am refreshing provider state…');
  clearLists();
  updatePlaybackControls();
  clearError();
}

function captureScope(): { provider: Provider; scope: number } {
  return { provider: selectedProvider, scope: providerScope };
}

function nextRequest(kind: keyof typeof requestState): number {
  requestState[kind] += 1;
  return requestState[kind];
}

function isRequestCurrent(
  kind: keyof typeof requestState,
  requestId: number,
  scope: { provider: Provider; scope: number },
): boolean {
  return requestState[kind] === requestId && scope.scope === providerScope && scope.provider === selectedProvider;
}

function getTransportSummary(providerStatus: ProviderStatus | undefined): string {
  if (!providerStatus?.capabilities?.playback) {
    return 'I can browse this provider here, but daemon playback controls are not available on this host.';
  }

  if (providerStatus.capabilities.pause === false) {
    return 'Playback is available, but some transport actions stay intentionally limited for this provider.';
  }

  return 'Daemon playback controls are available for this provider.';
}

main();
