#!/usr/bin/env node
/**
 * Harmon CLI entry point
 */

import { Command } from 'commander';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createCLI, getDefaultEndpoint } from '../dist/index.js';
import { listen } from './listen.js';
import {
  assertSafeAuthImportEndpoint,
  classifyCliError,
  CliUsageError,
  detectDeviceOS,
  parseSessionDurationOption,
  parseTimeoutOption,
  PLAYBACK_ENGINES,
  SESSION_MODES,
  SPOTIFY_SEARCH_TYPES,
  SUPPORTED_PROVIDERS,
  validateChoice,
  validateFraction,
} from './runtime.js';

const program = new Command();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const siloPackagePath = path.join(repoRoot, 'tools', 'harmon-silo');
const packageVersion =
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version || '0.0.0';

function resolveOptions(command) {
  const chain = [];
  let current = command;
  while (current) {
    chain.push(current);
    current = current.parent;
  }
  const resolved = {};
  for (const entry of chain.reverse()) {
    Object.assign(resolved, entry.opts());
  }
  return resolved;
}

function createContext(command) {
  const opts = resolveOptions(command);
  const endpoint = getDefaultEndpoint();
  const token = process.env.HARMON_API_TOKEN;
  const engine = validateChoice(opts.engine, 'engine', PLAYBACK_ENGINES);
  const provider = resolveProviderOption(opts.provider, engine);
  const timeoutMs = parseTimeoutOption(opts.timeout);

  if (opts.debug) {
    console.error(`[debug] endpoint: ${endpoint}`);
    console.error(`[debug] timeout: ${timeoutMs}ms`);
    console.error(`[debug] auth: ${token ? 'token set' : 'no token'}`);
    console.error(`[debug] engine: ${engine}`);
    console.error(`[debug] provider: ${provider}`);
  }

  return {
    opts: { ...opts, engine, provider },
    cli: createCLI({ endpoint, token, timeoutMs }),
    endpoint,
  };
}

function resolveProviderOption(value, engine) {
  const provider = validateChoice(value || 'spotify', 'provider', SUPPORTED_PROVIDERS);
  if (engine === 'applescript' && provider !== 'apple') {
    throw new CliUsageError('--engine applescript requires --provider apple.');
  }
  return provider;
}

function outputResult(opts, data, formatters = {}) {
  if (opts.quiet) return;
  if (opts.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  if (opts.plain && typeof formatters.plain === 'function') {
    console.log(formatters.plain(data));
    return;
  }
  if (typeof formatters.human === 'function') {
    console.log(formatters.human(data));
    return;
  }
  console.log(JSON.stringify(data, null, 2));
}

function formatProviderStatusLine(name, provider) {
  if (!provider) {
    return `${name}: unavailable`;
  }

  const status = provider.status || (provider.connected ? 'ready' : 'missing');
  const auth = provider.auth ? ` (${provider.auth})` : '';
  return `${name}: ${status}${auth}`;
}

async function readCookieFile(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (parsed && Array.isArray(parsed.records)) {
    return parsed.records;
  }
  throw new CliUsageError('Unsupported cookie file format.');
}

async function runSiloExport(options) {
  const helper = process.env.HARMON_SILO_HELPER;
  const args = [];
  if (options.browser) args.push('--browser', options.browser);
  if (options.browserProfile) args.push('--browser-profile', options.browserProfile);
  if (options.domain) args.push('--domain', options.domain);
  if (options.includeExpired) args.push('--include-expired');

  const cmd = helper || 'swift';
  const cmdArgs = helper
    ? args
    : ['run', '--package-path', siloPackagePath, 'harmon-silo', 'export', ...args];

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      reject(error);
    });
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Silo export failed (${code}).`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        resolve(parsed);
      } catch (error) {
        reject(new Error('Failed to parse Silo output.'));
      }
    });
  });
}

async function ensureSiloHelperAvailable() {
  if (process.env.HARMON_SILO_HELPER) {
    return;
  }

  try {
    await fs.access(path.join(siloPackagePath, 'Package.swift'));
  } catch {
    throw new CliUsageError(
      'Browser cookie import without --cookie-path only works from a repo checkout with tools/harmon-silo or when HARMON_SILO_HELPER points to an installed helper.'
    );
  }
}

function normalizeCookies(records) {
  if (!Array.isArray(records)) return [];
  return records
    .map((record) => ({
      domain: record.domain ?? '',
      name: record.name ?? '',
      path: record.path ?? '/',
      value: record.value ?? '',
      expires: record.expires ?? record.expiry ?? null,
      isSecure: Boolean(record.isSecure ?? record.secure),
      isHTTPOnly: Boolean(record.isHTTPOnly ?? record.isHttpOnly ?? record.httpOnly),
    }))
    .filter((record) => record.name && record.value);
}

function formatTrackLines(tracks) {
  if (!Array.isArray(tracks) || tracks.length === 0) return 'No results.';
  return tracks
    .map((track, index) => {
      const uri = track.uri ? ` [${track.uri}]` : '';
      return `${index + 1}. ${track.artist} - ${track.name} (${track.album})${uri}`;
    })
    .join('\n');
}

function formatTrackPlain(tracks) {
  if (!Array.isArray(tracks) || tracks.length === 0) return '';
  return tracks
    .map((track) => `${track.name}\t${track.artist}\t${track.album}\t${track.uri ?? ''}`)
    .join('\n');
}

function formatAlbumLines(albums) {
  if (!Array.isArray(albums) || albums.length === 0) return 'No results.';
  return albums
    .map((album, index) => {
      const artists = Array.isArray(album.artists) ? album.artists.join(', ') : '';
      const uri = album.uri ? ` [${album.uri}]` : '';
      return `${index + 1}. ${album.name} - ${artists}${uri}`;
    })
    .join('\n');
}

function formatAlbumPlain(albums) {
  if (!Array.isArray(albums) || albums.length === 0) return '';
  return albums
    .map((album) => `${album.name}\t${(album.artists || []).join(', ')}\t${album.uri ?? ''}`)
    .join('\n');
}

function formatArtistLines(artists) {
  if (!Array.isArray(artists) || artists.length === 0) return 'No results.';
  return artists
    .map((artist, index) => {
      const uri = artist.uri ? ` [${artist.uri}]` : '';
      return `${index + 1}. ${artist.name}${uri}`;
    })
    .join('\n');
}

function formatArtistPlain(artists) {
  if (!Array.isArray(artists) || artists.length === 0) return '';
  return artists.map((artist) => `${artist.name}\t${artist.uri ?? ''}`).join('\n');
}

function formatPlaylistLines(playlists) {
  if (!Array.isArray(playlists) || playlists.length === 0) return 'No results.';
  return playlists
    .map((playlist, index) => {
      const uri = playlist.uri ? ` [${playlist.uri}]` : '';
      return `${index + 1}. ${playlist.name} (${playlist.owner}, ${playlist.totalTracks} tracks)${uri}`;
    })
    .join('\n');
}

function formatPlaylistPlain(playlists) {
  if (!Array.isArray(playlists) || playlists.length === 0) return '';
  return playlists
    .map((playlist) => `${playlist.name}\t${playlist.owner}\t${playlist.totalTracks}\t${playlist.uri ?? ''}`)
    .join('\n');
}

function formatEpisodeLines(episodes) {
  if (!Array.isArray(episodes) || episodes.length === 0) return 'No results.';
  return episodes
    .map((episode, index) => {
      const showName = episode.showName ? ` (${episode.showName})` : '';
      const uri = episode.uri ? ` [${episode.uri}]` : '';
      return `${index + 1}. ${episode.name}${showName}${uri}`;
    })
    .join('\n');
}

function formatEpisodePlain(episodes) {
  if (!Array.isArray(episodes) || episodes.length === 0) return '';
  return episodes
    .map((episode) => `${episode.name}\t${episode.showName ?? ''}\t${episode.releaseDate ?? ''}\t${episode.uri ?? ''}`)
    .join('\n');
}

function formatShowLines(shows) {
  if (!Array.isArray(shows) || shows.length === 0) return 'No results.';
  return shows
    .map((show, index) => {
      const publisher = show.publisher ? ` (${show.publisher})` : '';
      const uri = show.uri ? ` [${show.uri}]` : '';
      return `${index + 1}. ${show.name}${publisher}${uri}`;
    })
    .join('\n');
}

function formatShowPlain(shows) {
  if (!Array.isArray(shows) || shows.length === 0) return '';
  return shows
    .map((show) => `${show.name}\t${show.publisher ?? ''}\t${show.totalEpisodes ?? ''}\t${show.uri ?? ''}`)
    .join('\n');
}

async function fetchNowPlaying(cli, provider) {
  if (provider === 'apple') {
    return cli.appleNowPlaying();
  }
  if (provider === 'youtube') {
    return cli.youtubeNowPlaying();
  }
  return cli.spotifyNowPlaying();
}

async function searchCatalog(cli, provider, type, query, options) {
  if (provider === 'apple') {
    const appleType = mapAppleSearchType(type);
    const result = await cli.appleSearch(query, appleType, options);
    return normalizeAppleSearchResult(type, result);
  }

  if (provider === 'youtube') {
    if (options?.offset && options.offset > 0) {
      throw new CliUsageError('YouTube Music search does not support --offset.');
    }
    const youtubeType = mapYouTubeSearchType(type);
    const result = await cli.youtubeSearch(query, youtubeType, { limit: options?.limit });
    return normalizeYouTubeSearchResult(type, result);
  }

  return cli.spotifySearch(query, type, options);
}

function mapAppleSearchType(type) {
  if (type === 'track') return 'songs';
  if (type === 'album') return 'albums';
  if (type === 'artist') return 'artists';
  if (type === 'playlist') return 'playlists';
  throw new CliUsageError('Apple Music search supports track, album, artist, and playlist.');
}

function mapYouTubeSearchType(type) {
  if (type === 'track') return 'songs';
  if (type === 'album') return 'albums';
  if (type === 'artist') return 'artists';
  if (type === 'playlist') return 'playlists';
  throw new CliUsageError('YouTube Music search supports track, album, artist, and playlist.');
}

function normalizeAppleSearchResult(type, result) {
  if (type === 'track') {
    return {
      tracks: (result.songs || []).map((song) => ({
        name: song.name,
        artist: song.artistName,
        album: song.albumName || '',
        uri: song.url || `apple:song:${song.id}`,
      })),
    };
  }

  if (type === 'album') {
    return {
      albums: (result.albums || []).map((album) => ({
        name: album.name,
        artists: [album.artistName],
        uri: album.url || `apple:album:${album.id}`,
      })),
    };
  }

  if (type === 'artist') {
    return {
      artists: (result.artists || []).map((artist) => ({
        name: artist.name,
        uri: artist.url || `apple:artist:${artist.id}`,
      })),
    };
  }

  return {
    playlists: (result.playlists || []).map((playlist) => ({
      name: playlist.name,
      owner: playlist.curatorName || 'Apple Music',
      totalTracks: playlist.trackCount || 0,
      uri: playlist.url || `apple:playlist:${playlist.id}`,
    })),
  };
}

function normalizeYouTubeSearchResult(type, result) {
  if (type === 'track') {
    return {
      tracks: (result.songs || []).map((song) => ({
        name: song.name,
        artist: song.artistName,
        album: song.albumName || '',
        uri: `youtube:video:${song.id}`,
      })),
    };
  }

  if (type === 'album') {
    return {
      albums: (result.albums || []).map((album) => ({
        name: album.name,
        artists: [album.artistName],
        uri: `youtube:playlist:${album.id}`,
      })),
    };
  }

  if (type === 'artist') {
    return {
      artists: (result.artists || []).map((artist) => ({
        name: artist.name,
        uri: `youtube:artist:${artist.id}`,
      })),
    };
  }

  return {
    playlists: (result.playlists || []).map((playlist) => ({
      name: playlist.name,
      owner: playlist.author || 'YouTube Music',
      totalTracks: playlist.trackCount || 0,
      uri: `youtube:playlist:${playlist.id}`,
    })),
  };
}

function searchOutputFormatters(type) {
  return {
    track: { human: (data) => formatTrackLines(data.tracks), plain: (data) => formatTrackPlain(data.tracks) },
    album: { human: (data) => formatAlbumLines(data.albums), plain: (data) => formatAlbumPlain(data.albums) },
    artist: { human: (data) => formatArtistLines(data.artists), plain: (data) => formatArtistPlain(data.artists) },
    playlist: {
      human: (data) => formatPlaylistLines(data.playlists),
      plain: (data) => formatPlaylistPlain(data.playlists),
    },
    episode: {
      human: (data) => formatEpisodeLines(data.episodes),
      plain: (data) => formatEpisodePlain(data.episodes),
    },
    show: {
      human: (data) => formatShowLines(data.shows),
      plain: (data) => formatShowPlain(data.shows),
    },
  }[type] || {};
}

function normalizeTrackCollection(provider, tracks) {
  const collection = Array.isArray(tracks) ? tracks : Array.isArray(tracks?.items) ? tracks.items : [];
  if (!Array.isArray(collection)) {
    return [];
  }

  return collection.map((track) => ({
    name: track.name,
    artist: track.artist ?? track.artistName ?? '',
    album: track.album ?? track.albumName ?? '',
    uri:
      track.uri ||
      track.url ||
      (provider === 'apple'
        ? `apple:song:${track.id}`
        : provider === 'youtube'
          ? `youtube:video:${track.id}`
          : track.uri),
  }));
}

function normalizePlaylistCollection(provider, playlists) {
  const collection = Array.isArray(playlists) ? playlists : Array.isArray(playlists?.items) ? playlists.items : [];
  if (!Array.isArray(collection)) {
    return [];
  }

  return collection.map((playlist) => ({
    name: playlist.name,
    owner:
      playlist.owner ||
      playlist.curatorName ||
      playlist.author ||
      (provider === 'apple' ? 'Apple Music' : provider === 'youtube' ? 'YouTube Music' : ''),
    totalTracks: playlist.totalTracks ?? playlist.trackCount ?? 0,
    uri:
      playlist.uri ||
      playlist.url ||
      (provider === 'apple'
        ? `apple:playlist:${playlist.id}`
        : provider === 'youtube'
          ? `youtube:playlist:${playlist.id}`
          : playlist.uri),
  }));
}

function isAppleInput(value) {
  if (!value) return false;
  return value.startsWith('applemusic:') || value.includes('music.apple.com');
}

function isYouTubeInput(value) {
  if (!value) return false;
  return (
    value.startsWith('youtube:video:') ||
    value.startsWith('youtube:playlist:') ||
    value.includes('youtube.com/watch') ||
    value.includes('music.youtube.com/watch') ||
    value.includes('youtube.com/playlist') ||
    value.includes('music.youtube.com/playlist')
  );
}

function resolvePlaybackProvider(opts, value) {
  if (isAppleInput(value)) {
    return 'apple';
  }
  if (isYouTubeInput(value)) {
    return 'youtube';
  }
  return opts.provider;
}

function normalizeAppleMusicUrl(value, market) {
  if (!value) return null;
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }
  if (!value.startsWith('applemusic:')) return null;

  const parts = value.split(':');
  if (parts.length < 3) return null;
  const rawType = parts[1];
  const type = rawType.split('/')[0];
  const id = parts.slice(2).join(':');
  const region = market ? market.toLowerCase() : 'us';
  const pathType = type === 'album' ? 'album' : type === 'playlist' ? 'playlist' : 'song';
  return `https://music.apple.com/${region}/${pathType}/${id}`;
}

function normalizeSpotifyUri(value, typeOverride) {
  if (!value) return null;
  if (value.startsWith('spotify:')) return value;
  if (value.startsWith('http://') || value.startsWith('https://')) {
    try {
      const url = new URL(value);
      if (url.hostname.endsWith('spotify.com')) {
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts.length >= 2) {
          return `spotify:${parts[0]}:${parts[1]}`;
        }
      }
    } catch {
      return null;
    }
  }
  if (typeOverride) {
    return `spotify:${typeOverride}:${value}`;
  }
  return `spotify:track:${value}`;
}

function normalizeYouTubeUri(value) {
  if (!value) return null;
  if (value.startsWith('youtube:video:')) return value;
  if (value.startsWith('youtube:playlist:')) {
    return `https://music.youtube.com/playlist?list=${value.split(':').pop()}`;
  }
  if (value.startsWith('http://') || value.startsWith('https://')) {
    try {
      const url = new URL(value);
      const playlistId = url.searchParams.get('list');
      if (playlistId && !url.searchParams.get('v')) {
        return `https://music.youtube.com/playlist?list=${playlistId}`;
      }
      const id =
        url.hostname === 'youtu.be'
          ? url.pathname.split('/').filter(Boolean)[0]
          : url.searchParams.get('v');
      if (id) {
        return `youtube:video:${id}`;
      }
    } catch {
      return null;
    }
  }
  return /^[a-zA-Z0-9_-]{6,}$/.test(value) ? `youtube:video:${value}` : null;
}

function extractPlaylistId(provider, value) {
  if (!value) return null;

  if (provider === 'spotify') {
    const uri = normalizeSpotifyUri(value, 'playlist');
    return uri?.split(':').pop() || null;
  }

  if (provider === 'apple') {
    if (value.startsWith('applemusic:playlist:')) {
      return value.split(':').slice(2).join(':') || null;
    }
    try {
      const url = new URL(value);
      if (url.hostname.includes('music.apple.com')) {
        return url.pathname.split('/').filter(Boolean).pop() || null;
      }
    } catch {
      return value;
    }
    return value;
  }

  if (value.startsWith('youtube:playlist:')) {
    return value.split(':').pop() || null;
  }
  try {
    const url = new URL(value);
    return url.searchParams.get('list') || value;
  } catch {
    return value;
  }
}

function spotifyUriType(uri) {
  if (!uri || !uri.startsWith('spotify:')) return null;
  const parts = uri.split(':');
  return parts.length >= 2 ? parts[1] : null;
}

function parseSeekValue(value) {
  if (typeof value !== 'string') return null;
  if (/^\d+$/.test(value)) return Number.parseInt(value, 10);
  const parts = value.split(':').map((part) => Number.parseInt(part, 10));
  if (parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 2) {
    const [min, sec] = parts;
    return (min * 60 + sec) * 1000;
  }
  if (parts.length === 3) {
    const [hour, min, sec] = parts;
    return (hour * 3600 + min * 60 + sec) * 1000;
  }
  return null;
}

async function resolveDevice(cli, device) {
  if (!device) return null;
  const devices = await cli.devices();
  if (!Array.isArray(devices)) return device;
  const match = devices.find(
    (entry) =>
      entry.id === device || entry.name?.toLowerCase() === device.toLowerCase()
  );
  return match ? match.id : null;
}

async function applyDeviceIfNeeded(cli, opts) {
  if (!opts.device) return;
  if (opts.provider !== 'spotify') {
    throw new CliUsageError('Device selection is only supported for Spotify Connect.');
  }
  const deviceId = await resolveDevice(cli, opts.device);
  if (!deviceId) {
    throw new CliUsageError(`Unknown device: ${opts.device}`);
  }
  await cli.useDevice(deviceId);
}

program
  .name('harmon')
  .version(packageVersion, '-V, --version')
  .showHelpAfterError()
  .exitOverride()
  .description('Harmon — mood-based music session engine CLI\n\nExamples:\n  harmon status\n  harmon play spotify:track:4cOdK2wGLETKBW3PvgPWqT\n  harmon search track "lofi beats"\n  harmon session start --mode focus\n  harmon auth import --browser chrome')
  .option('--timeout <dur>', 'request timeout (e.g. 5s, 30s, 1m)', '10s')
  .option('--market <cc>', 'market country code (e.g. US, GB)')
  .option('--provider <name>', 'provider: spotify, apple, youtube', 'spotify')
  .option('--device <name|id>', 'target playback device')
  .option('--engine <connect|applescript>', 'playback engine', 'connect')
  .option('--json', 'JSON output (machine-readable)')
  .option('--plain', 'tab-separated output (for piping)')
  .option('--no-color', 'disable color output')
  .option('-q, --quiet', 'suppress output')
  .option('-v, --verbose', 'verbose output')
  .option('-d, --debug', 'debug mode — show request/response details');

program
  .command('init')
  .description('Interactive setup wizard — configure providers and generate .env')
  .option('--output <path>', 'output path for .env file', '.env.harmon')
  .action(async (...args) => {
    const command = args[args.length - 1];
    const outputPath = command.opts().output;

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

    console.log('');
    console.log('  Welcome to Harmon — Policy-driven music session manager');
    console.log('  This wizard will help you configure your music providers.');
    console.log('');

    const env = {};

    // Security (always required for production)
    console.log('── Security ──────────────────────────────────────────');
    const genSecret = await ask('  Generate encryption secret? (Y/n) ');
    if (genSecret.toLowerCase() !== 'n') {
      const { randomBytes } = await import('node:crypto');
      env.HARMON_ENCRYPTION_SECRET = randomBytes(32).toString('base64');
      console.log('  ✓ Encryption secret generated');
    }

    const genToken = await ask('  Generate API token? (Y/n) ');
    if (genToken.toLowerCase() !== 'n') {
      const { randomBytes } = await import('node:crypto');
      env.HARMON_API_TOKEN = randomBytes(32).toString('base64');
      console.log('  ✓ API token generated');
    }

    // Spotify
    console.log('');
    console.log('── Spotify ───────────────────────────────────────────');
    console.log('  Create an app at https://developer.spotify.com/dashboard');
    const spotifyId = await ask('  Client ID (or skip): ');
    if (spotifyId.trim()) {
      env.SPOTIFY_CLIENT_ID = spotifyId.trim();
      const spotifySecret = await ask('  Client Secret: ');
      if (spotifySecret.trim()) env.SPOTIFY_CLIENT_SECRET = spotifySecret.trim();
      env.SPOTIFY_REDIRECT_URI = 'http://127.0.0.1:17373/v1/auth/spotify/callback';
      console.log('  ✓ Spotify configured');
    } else {
      console.log('  ⊘ Skipped');
    }

    // YouTube
    console.log('');
    console.log('── YouTube Music ─────────────────────────────────────');
    console.log('  Option 1: API key (search only) — https://console.cloud.google.com');
    console.log('  Option 2: OAuth (full access) — create OAuth credentials');
    const ytMode = await ask('  Setup mode? (api-key / oauth / skip): ');
    if (ytMode.trim() === 'api-key') {
      const ytKey = await ask('  API Key: ');
      if (ytKey.trim()) {
        env.YT_API_KEY = ytKey.trim();
        console.log('  ✓ YouTube configured (API key mode)');
      }
    } else if (ytMode.trim() === 'oauth') {
      const ytClientId = await ask('  Client ID: ');
      if (ytClientId.trim()) {
        env.YOUTUBE_MUSIC_CLIENT_ID = ytClientId.trim();
        const ytSecret = await ask('  Client Secret (optional): ');
        if (ytSecret.trim()) env.YOUTUBE_MUSIC_CLIENT_SECRET = ytSecret.trim();
        env.YOUTUBE_MUSIC_REDIRECT_URI = 'http://127.0.0.1:17373/v1/auth/youtube/callback';
        console.log('  ✓ YouTube configured (OAuth mode)');
      }
    } else {
      console.log('  ⊘ Skipped');
    }

    // Apple Music
    console.log('');
    console.log('── Apple Music ───────────────────────────────────────');
    console.log('  Option 1: Static token — paste a developer JWT');
    console.log('  Option 2: Auto-JWT — provide signing key material');
    const appleMode = await ask('  Setup mode? (token / auto-jwt / skip): ');
    if (appleMode.trim() === 'token') {
      const appleDev = await ask('  Developer Token: ');
      if (appleDev.trim()) {
        env.APPLE_MUSIC_DEVELOPER_TOKEN = appleDev.trim();
        const appleUser = await ask('  User Token (optional, for library): ');
        if (appleUser.trim()) env.APPLE_MUSIC_USER_TOKEN = appleUser.trim();
        console.log('  ✓ Apple Music configured (static token)');
      }
    } else if (appleMode.trim() === 'auto-jwt') {
      const teamId = await ask('  Team ID: ');
      const keyId = await ask('  Key ID: ');
      const keyPath = await ask('  Private key path (.p8 file): ');
      if (teamId.trim() && keyId.trim() && keyPath.trim()) {
        env.APPLE_MUSIC_TEAM_ID = teamId.trim();
        env.APPLE_MUSIC_KEY_ID = keyId.trim();
        try {
          const { readFileSync: readSync } = await import('node:fs');
          env.APPLE_MUSIC_PRIVATE_KEY = readSync(keyPath.trim(), 'utf8').replace(/\n/g, '\\n');
          console.log('  ✓ Apple Music configured (auto-JWT)');
        } catch {
          console.log('  ✗ Could not read key file: ' + keyPath.trim());
        }
      }
    } else {
      console.log('  ⊘ Skipped');
    }

    // Song recognition
    console.log('');
    console.log('── Song Recognition (optional) ───────────────────────');
    const auddToken = await ask('  AudD API token (or skip): ');
    if (auddToken.trim()) {
      env.AUDD_API_TOKEN = auddToken.trim();
      console.log('  ✓ Song recognition configured');
    } else {
      console.log('  ⊘ Skipped (use Chromaprint for free recognition)');
    }

    // Write .env file
    console.log('');
    const lines = Object.entries(env).map(([k, v]) => `${k}=${v}`);
    const content = '# Generated by harmon init\n' + lines.join('\n') + '\n';
    await fs.writeFile(outputPath, content, { mode: 0o600 });
    console.log(`  ✓ Config written to ${outputPath} (permissions: 600)`);

    // Next steps
    console.log('');
    console.log('── Next Steps ────────────────────────────────────────');
    console.log(`  1. Source the config:  export $(cat ${outputPath} | xargs)`);
    console.log('  2. Start the daemon:  pnpm start:daemon');
    console.log('  3. Check status:      harmon status');
    if (env.SPOTIFY_CLIENT_ID) {
      console.log('  4. Login to Spotify:  harmon auth import --browser chrome');
    }
    if (env.YOUTUBE_MUSIC_CLIENT_ID) {
      console.log('  5. Login to YouTube:  harmon auth youtube login');
    }
    console.log('');

    rl.close();
  });

program
  .command('status')
  .description('Show daemon and playback status')
  .action(async (...args) => {
    const command = args[args.length - 1];
    const { cli, opts } = createContext(command);
    const status = await cli.status();
    const sessionProvider = status.session?.provider;
    const activeProvider = sessionProvider || opts.provider;
    let nowPlaying = null;
    try {
      nowPlaying = await fetchNowPlaying(cli, activeProvider);
    } catch {
      nowPlaying = null;
    }
    outputResult(opts, { status, nowPlaying }, {
      plain: (data) => {
        const sessionId = data.status.session?.id || '';
        const sessionActive = data.status.session?.isActive ? '1' : '0';
        return `${data.status.isRunning ? '1' : '0'}\t${data.status.spotifyConnected ? '1' : '0'}\t${sessionId}\t${sessionActive}`;
      },
      human: (data) => {
        const spotifyProvider = data.status.providers?.spotify;
        const appleProvider = data.status.providers?.apple;
        const youtubeProvider = data.status.providers?.youtube;
        const lines = [
          `daemon: ${data.status.isRunning ? 'running' : 'stopped'}`,
          spotifyProvider
            ? formatProviderStatusLine('spotify', spotifyProvider)
            : `spotify: ${data.status.spotifyConnected ? 'connected' : 'not connected'}`,
        ];
        if (appleProvider) {
          lines.push(formatProviderStatusLine('apple', appleProvider));
        }
        if (youtubeProvider) {
          lines.push(formatProviderStatusLine('youtube', youtubeProvider));
        }
        if (data.status.session) {
          const providerSuffix = data.status.session.provider ? `, provider: ${data.status.session.provider}` : '';
          lines.push(`session: ${data.status.session.id} (${data.status.session.isActive ? 'active' : 'idle'}${providerSuffix})`);
        }
        if (data.nowPlaying && data.nowPlaying.name) {
          lines.push(`now playing: ${data.nowPlaying.artist} - ${data.nowPlaying.name}`);
        }
        return lines.join('\n');
      },
    });
  });

program.action(async (...args) => {
  const command = args[args.length - 1];
  const { cli, opts } = createContext(command);
  const status = await cli.status();
  outputResult(opts, status);
});

const auth = program.command('auth').description('Authentication commands');

auth
  .command('status')
  .description('Show auth status')
  .action(async (...args) => {
    const command = args[args.length - 1];
    const { cli, opts } = createContext(command);
    const status = await cli.status();
    outputResult(opts, status, {
      plain: (data) => `${data.spotifyConnected ? '1' : '0'}`,
      human: (data) => {
        const lines = [
          formatProviderStatusLine('spotify', data.providers?.spotify),
        ];
        if (data.providers?.apple) {
          lines.push(formatProviderStatusLine('apple', data.providers.apple));
        }
        if (data.providers?.youtube) {
          lines.push(formatProviderStatusLine('youtube', data.providers.youtube));
        }
        return lines.join('\n');
      },
    });
  });

auth
  .command('import')
  .description('Import auth from browser cookies (OAuth fallback)')
  .option('--browser <browser>', 'browser to read', 'chrome')
  .option('--browser-profile <name>', 'browser profile name')
  .option('--cookie-path <file>', 'cookie file path')
  .option('--domain <host>', 'cookie domain', 'spotify.com')
  .action(async (...args) => {
    const command = args[args.length - 1];
    const { cli, opts, endpoint } = createContext(command);
    assertSafeAuthImportEndpoint(endpoint);
    let cookies = [];
    if (command.opts().cookiePath) {
      cookies = normalizeCookies(await readCookieFile(command.opts().cookiePath));
    } else {
      await ensureSiloHelperAvailable();
      const exportResult = await runSiloExport({
        browser: command.opts().browser,
        browserProfile: command.opts().browserProfile,
        domain: command.opts().domain,
      });
      cookies = normalizeCookies(exportResult.records || []);
    }

    if (!Array.isArray(cookies) || cookies.length === 0) {
      throw new CliUsageError('No cookies found. Try a different browser/profile or pass --cookie-path.');
    }

    const result = await cli.authImportCookies(cookies);
    outputResult(opts, result, {
      plain: () => 'ok',
      human: () => `Imported ${cookies.length} cookies.`,
    });
  });

auth
  .command('clear')
  .description('Clear auth')
  .action(async (...args) => {
    const command = args[args.length - 1];
    const { cli, opts } = createContext(command);
    const result = await cli.authLogout();
    outputResult(opts, result, {
      plain: () => 'ok',
      human: () => 'Spotify auth cleared.',
    });
  });

const authYoutube = auth.command('youtube').description('YouTube Music authentication');

authYoutube
  .command('login')
  .description('Start YouTube Music OAuth login (opens browser)')
  .action(async (...args) => {
    const command = args[args.length - 1];
    const { cli, opts } = createContext(command);
    const result = await cli.youtubeAuthLogin();
    outputResult(opts, result, {
      plain: (data) => data.url || '',
      human: (data) => data.url
        ? `Open this URL to authenticate:\n${data.url}`
        : 'YouTube OAuth login initiated.',
    });
  });

authYoutube
  .command('refresh')
  .description('Refresh YouTube Music access token')
  .action(async (...args) => {
    const command = args[args.length - 1];
    const { cli, opts } = createContext(command);
    const result = await cli.youtubeAuthRefresh();
    outputResult(opts, result, {
      plain: () => 'ok',
      human: () => 'YouTube Music token refreshed.',
    });
  });

authYoutube
  .command('logout')
  .description('Clear YouTube Music authentication')
  .action(async (...args) => {
    const command = args[args.length - 1];
    const { cli, opts } = createContext(command);
    const result = await cli.youtubeAuthLogout();
    outputResult(opts, result, {
      plain: () => 'ok',
      human: () => 'YouTube Music auth cleared.',
    });
  });

const authApple = auth.command('apple').description('Apple Music authentication');

authApple
  .command('set-token <token>')
  .description('Set Apple Music user token (from MusicKit JS)')
  .action(async (token, ...args) => {
    const command = args[args.length - 1];
    const { cli, opts } = createContext(command);
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      throw new CliUsageError('User token is required.');
    }
    const result = await cli.appleAuthSetUserToken(token.trim());
    outputResult(opts, result, {
      plain: () => 'ok',
      human: () => 'Apple Music user token set.',
    });
  });

authApple
  .command('refresh')
  .description('Refresh Apple Music developer token (requires key material)')
  .action(async (...args) => {
    const command = args[args.length - 1];
    const { cli, opts } = createContext(command);
    const result = await cli.appleAuthRefresh();
    outputResult(opts, result, {
      plain: () => 'ok',
      human: (data) => data.hasToken
        ? 'Apple Music developer token refreshed.'
        : 'Apple Music developer token refresh failed (no key material configured).',
    });
  });

authApple
  .command('logout')
  .description('Clear Apple Music authentication')
  .action(async (...args) => {
    const command = args[args.length - 1];
    const { cli, opts } = createContext(command);
    const result = await cli.appleAuthLogout();
    outputResult(opts, result, {
      plain: () => 'ok',
      human: () => 'Apple Music auth cleared.',
    });
  });

const search = program.command('search').description('Search catalog');

function registerSearch(type) {
  search
    .command(`${type} <query>`)
    .option('--limit <n>', 'limit results', (value) => Number.parseInt(value, 10))
    .option('--offset <n>', 'offset', (value) => Number.parseInt(value, 10))
    .action(async (query, ...args) => {
      const command = args[args.length - 1];
      const { cli, opts } = createContext(command);
      const result = await searchCatalog(cli, opts.provider, type, query, {
        limit: command.opts().limit,
        offset: command.opts().offset,
      });
      outputResult(opts, result, searchOutputFormatters(type));
    });
}

SPOTIFY_SEARCH_TYPES.forEach(registerSearch);

const library = program.command('library').description('Browse provider library');

library
  .command('tracks')
  .description('List library or liked tracks')
  .option('--limit <n>', 'limit results', (value) => Number.parseInt(value, 10))
  .action(async (...args) => {
    const command = args[args.length - 1];
    const { cli, opts } = createContext(command);
    const limit = command.opts().limit;
    const tracks =
      opts.provider === 'apple' ? await cli.appleLibraryTracks({ limit }) :
      opts.provider === 'youtube' ? await cli.youtubeLibraryTracks({ limit }) :
      await cli.spotifyLibraryTracks({ limit });
    const normalized = normalizeTrackCollection(opts.provider, tracks);
    outputResult(opts, normalized, {
      human: (data) => formatTrackLines(data),
      plain: (data) => formatTrackPlain(data),
    });
  });

const playlist = program.command('playlist').description('Browse provider playlists');

playlist
  .command('list')
  .description('List playlists for the selected provider')
  .option('--limit <n>', 'limit results', (value) => Number.parseInt(value, 10))
  .action(async (...args) => {
    const command = args[args.length - 1];
    const { cli, opts } = createContext(command);
    const limit = command.opts().limit;
    const playlists =
      opts.provider === 'apple' ? await cli.applePlaylists({ limit }) :
      opts.provider === 'youtube' ? await cli.youtubePlaylists({ limit }) :
      await cli.spotifyPlaylists({ limit });
    const normalized = normalizePlaylistCollection(opts.provider, playlists);
    outputResult(opts, normalized, {
      human: (data) => formatPlaylistLines(data),
      plain: (data) => formatPlaylistPlain(data),
    });
  });

playlist
  .command('tracks <idOrUrl>')
  .description('List tracks from a playlist')
  .option('--limit <n>', 'limit results', (value) => Number.parseInt(value, 10))
  .action(async (idOrUrl, ...args) => {
    const command = args[args.length - 1];
    const { cli, opts } = createContext(command);
    const limit = command.opts().limit;
    const playlistId = extractPlaylistId(opts.provider, idOrUrl);
    if (!playlistId) {
      throw new CliUsageError('Invalid playlist identifier.');
    }
    const tracks =
      opts.provider === 'apple' ? await cli.applePlaylistTracks(playlistId, { limit }) :
      opts.provider === 'youtube' ? await cli.youtubePlaylistTracks(playlistId, { limit }) :
      await cli.spotifyPlaylistTracks(playlistId, { limit });
    const normalized = normalizeTrackCollection(opts.provider, tracks);
    outputResult(opts, normalized, {
      human: (data) => formatTrackLines(data),
      plain: (data) => formatTrackPlain(data),
    });
  });

program
  .command('recommend [seed]')
  .description('Fetch recommended tracks for the selected provider')
  .option('--limit <n>', 'limit results', (value) => Number.parseInt(value, 10))
  .action(async (seed, ...args) => {
    const command = args[args.length - 1];
    const { cli, opts } = createContext(command);
    const limit = command.opts().limit;
    const tracks =
      opts.provider === 'apple' ? await cli.appleRecommendations({ limit, seed }) :
      opts.provider === 'youtube' ? await cli.youtubeRecommendations({ limit, seed }) :
      await cli.spotifyRecommendations({ limit, seed });
    const normalized = normalizeTrackCollection(opts.provider, tracks);
    outputResult(opts, normalized, {
      human: (data) => formatTrackLines(data),
      plain: (data) => formatTrackPlain(data),
    });
  });

// ============================================================================
// Session Commands
// ============================================================================

const session = program.command('session').description('Session lifecycle commands');

session
  .command('start')
  .description('Start a music session with a policy')
  .option('--mode <mode>', 'session mode: focus, relax, energize, meditate, workout, custom', 'focus')
  .option('--duration <dur>', 'session duration (e.g. 30m, 1h)', '1h')
  .option('--energy <n>', 'target energy 0-1', parseFloat)
  .option('--instrumental', 'no vocals / instrumental only')
  .action(async (...args) => {
    const command = args[args.length - 1];
    const { cli, opts } = createContext(command);
    const cmdOpts = command.opts();

    const mode = validateChoice(cmdOpts.mode, 'mode', SESSION_MODES);
    const durationMs = parseSessionDurationOption(cmdOpts.duration);
    const energy = validateFraction(cmdOpts.energy, 'energy');
    const policy = {
      version: 1,
      provider: opts.provider,
      mode,
      durationMs,
      hard: {},
      soft: { weights: {} },
    };
    if (energy !== undefined) {
      policy.soft.weights.energy = energy;
    }
    if (cmdOpts.instrumental) {
      policy.hard.noVocals = true;
    }

    const result = await cli.command({
      id: `c_${Date.now().toString(36)}`,
      ts: Date.now(),
      source: { kind: 'cli', device: detectDeviceOS() },
      type: 'session.start',
      payload: { policy },
    });
    outputResult(opts, result, {
      plain: (data) => data.sessionId || 'ok',
      human: (data) => `Session started: ${data.sessionId || 'ok'} (mode: ${mode}, provider: ${opts.provider})`,
    });
  });

session
  .command('stop')
  .description('Stop the active session')
  .action(async (...args) => {
    const command = args[args.length - 1];
    const { cli, opts } = createContext(command);
    const result = await cli.command({
      id: `c_${Date.now().toString(36)}`,
      ts: Date.now(),
      source: { kind: 'cli', device: detectDeviceOS() },
      type: 'session.stop',
      payload: {},
    });
    outputResult(opts, result, { plain: () => 'ok', human: () => 'Session stopped.' });
  });

session
  .command('nudge <direction>')
  .description('Nudge session calmer or sharper')
  .option('--amount <n>', 'adjustment amount 0-1', parseFloat)
  .action(async (direction, ...args) => {
    const command = args[args.length - 1];
    const { cli, opts } = createContext(command);
    if (direction !== 'calmer' && direction !== 'sharper') {
      throw new CliUsageError('Direction must be "calmer" or "sharper".');
    }
    const amount = validateFraction(command.opts().amount, 'amount');
    const result = await cli.command({
      id: `c_${Date.now().toString(36)}`,
      ts: Date.now(),
      source: { kind: 'cli', device: detectDeviceOS() },
      type: 'session.nudge',
      payload: { direction, amount },
    });
    outputResult(opts, result, { plain: () => 'ok', human: () => `Session nudged ${direction}.` });
  });

program
  .command('play [idOrUrl]')
  .description('Play a track/album/playlist')
  .option('--type <type>', 'type for raw Spotify IDs (track|album|playlist|artist|show|episode)')
  .action(async (idOrUrl, ...args) => {
    const command = args[args.length - 1];
    const { cli, opts } = createContext(command);
    const provider = resolvePlaybackProvider(opts, idOrUrl);
    if (provider === 'spotify') {
      await applyDeviceIfNeeded(cli, opts);
    }

    const typeOverride = command.opts().type;
    if (
      typeOverride &&
      !['track', 'album', 'playlist', 'artist', 'show', 'episode'].includes(typeOverride)
    ) {
      throw new CliUsageError('Invalid type. Use track, album, playlist, artist, show, or episode.');
    }

    if (typeOverride && provider !== 'spotify') {
      throw new CliUsageError('--type is only supported for raw Spotify IDs in this build.');
    }

    if (!idOrUrl) {
      if (provider === 'apple') {
        const result = await cli.applePlay();
        outputResult(opts, result, {
          plain: () => 'ok',
          human: () => 'Resumed Apple Music playback.',
        });
        return;
      }
      if (provider === 'youtube') {
        const result = await cli.youtubePlay();
        outputResult(opts, result, {
          plain: () => 'ok',
          human: () => 'Opened queued YouTube Music track.',
        });
        return;
      }
      const result = await cli.spotifyPlay();
      outputResult(opts, result, {
        plain: () => 'ok',
        human: () => 'Resumed playback.',
      });
      return;
    }

    if (provider === 'apple') {
      const url = normalizeAppleMusicUrl(idOrUrl, opts.market);
      if (!url) {
        throw new CliUsageError('Invalid Apple Music URL or URI.');
      }
      const result = await cli.applePlay({ url });
      outputResult(opts, result, {
        plain: () => url,
        human: () => `Playing Apple Music ${url}`,
      });
      return;
    }

    if (provider === 'youtube') {
      const youtubeUri = normalizeYouTubeUri(idOrUrl);
      if (!youtubeUri) {
        throw new CliUsageError('Invalid YouTube Music URL or URI.');
      }
      const result = await cli.youtubePlay({ uri: youtubeUri });
      outputResult(opts, result, {
        plain: () => youtubeUri,
        human: () => `Opening ${youtubeUri}`,
      });
      return;
    }

    const spotifyUri = normalizeSpotifyUri(idOrUrl, typeOverride);
    if (!spotifyUri) {
      throw new CliUsageError('Invalid Spotify URI or URL.');
    }

    const type = spotifyUriType(spotifyUri);
    const isContext = ['album', 'playlist', 'artist', 'show'].includes(type);
    const result = await cli.spotifyPlay(isContext ? { contextUri: spotifyUri } : { uri: spotifyUri });
    outputResult(opts, result, {
      plain: () => spotifyUri,
      human: () => `Playing ${spotifyUri}`,
    });
  });

program
  .command('pause')
  .description('Pause playback')
  .action(async (...args) => {
    const command = args[args.length - 1];
    const { cli, opts } = createContext(command);
    if (opts.provider === 'youtube') {
      throw new CliUsageError('YouTube Music pause is not supported in browser-handoff mode.');
    }
    if (opts.provider === 'spotify') {
      await applyDeviceIfNeeded(cli, opts);
    }
    const result =
      opts.provider === 'apple' ? await cli.applePause() :
      await cli.spotifyPause();
    outputResult(opts, result, {
      plain: () => 'ok',
      human: () =>
        opts.provider === 'apple'
          ? 'Apple Music paused.'
          : 'Paused.',
    });
  });

program
  .command('next')
  .description('Skip to next track')
  .action(async (...args) => {
    const command = args[args.length - 1];
    const { cli, opts } = createContext(command);
    if (opts.provider === 'spotify') {
      await applyDeviceIfNeeded(cli, opts);
    }
    const result =
      opts.provider === 'apple' ? await cli.appleNext() :
      opts.provider === 'youtube' ? await cli.youtubeNext() :
      await cli.spotifyNext();
    outputResult(opts, result, {
      plain: () => 'ok',
      human: () =>
        opts.provider === 'apple'
          ? 'Apple Music next.'
          : opts.provider === 'youtube'
            ? 'YouTube Music next.'
            : 'Skipped.',
    });
  });

program
  .command('prev')
  .description('Skip to previous track')
  .action(async (...args) => {
    const command = args[args.length - 1];
    const { cli, opts } = createContext(command);
    if (opts.provider === 'spotify') {
      await applyDeviceIfNeeded(cli, opts);
    }
    const result =
      opts.provider === 'apple' ? await cli.applePrev() :
      opts.provider === 'youtube' ? await cli.youtubePrev() :
      await cli.spotifyPrev();
    outputResult(opts, result, {
      plain: () => 'ok',
      human: () =>
        opts.provider === 'apple'
          ? 'Apple Music previous.'
          : opts.provider === 'youtube'
            ? 'YouTube Music previous.'
            : 'Previous track.',
    });
  });

program
  .command('seek <position>')
  .description('Seek to a position (ms or mm:ss)')
  .action(async (position, ...args) => {
    const command = args[args.length - 1];
    const { cli, opts } = createContext(command);
    if (opts.provider !== 'spotify') {
      throw new CliUsageError('Seek is supported only for Spotify.');
    }
    await applyDeviceIfNeeded(cli, opts);
    const positionMs = parseSeekValue(position);
    if (positionMs === null) {
      throw new CliUsageError('Invalid seek position.');
    }
    const result = await cli.spotifySeek(positionMs);
    outputResult(opts, result, { plain: () => String(positionMs), human: () => `Seeked to ${positionMs}ms.` });
  });

program
  .command('volume <percent>')
  .description('Set volume 0-100')
  .action(async (percent, ...args) => {
    const command = args[args.length - 1];
    const { cli, opts } = createContext(command);
    if (opts.provider !== 'spotify') {
      throw new CliUsageError('Volume control is supported only for Spotify.');
    }
    await applyDeviceIfNeeded(cli, opts);
    const volumePercent = Number.parseInt(percent, 10);
    if (!Number.isFinite(volumePercent) || volumePercent < 0 || volumePercent > 100) {
      throw new CliUsageError('Volume must be 0-100.');
    }
    const result = await cli.spotifyVolume(volumePercent);
    outputResult(opts, result, { plain: () => String(volumePercent), human: () => `Volume ${volumePercent}%.` });
  });

program
  .command('shuffle <state>')
  .description('Shuffle on/off')
  .action(async (state, ...args) => {
    const command = args[args.length - 1];
    const { cli, opts } = createContext(command);
    if (opts.provider !== 'spotify') {
      throw new CliUsageError('Shuffle is supported only for Spotify.');
    }
    await applyDeviceIfNeeded(cli, opts);
    const normalized = state === 'on' ? true : state === 'off' ? false : null;
    if (normalized === null) {
      throw new CliUsageError('Shuffle state must be on or off.');
    }
    const result = await cli.spotifyShuffle(normalized);
    outputResult(opts, result, { plain: () => (normalized ? 'on' : 'off'), human: () => `Shuffle ${state}.` });
  });

program
  .command('repeat <state>')
  .description('Repeat off/track/context')
  .action(async (state, ...args) => {
    const command = args[args.length - 1];
    const { cli, opts } = createContext(command);
    if (opts.provider !== 'spotify') {
      throw new CliUsageError('Repeat is supported only for Spotify.');
    }
    await applyDeviceIfNeeded(cli, opts);
    if (!['off', 'track', 'context'].includes(state)) {
      throw new CliUsageError('Repeat state must be off, track, or context.');
    }
    const result = await cli.spotifyRepeat(state);
    outputResult(opts, result, { plain: () => state, human: () => `Repeat ${state}.` });
  });

const device = program.command('device').description('Device commands');

device
  .command('list')
  .description('List devices')
  .action(async (...args) => {
    const command = args[args.length - 1];
    const { cli, opts } = createContext(command);
    if (opts.provider !== 'spotify') {
      throw new CliUsageError('Device listing is only supported for Spotify Connect.');
    }
    const devices = await cli.devices();
    outputResult(opts, devices, {
      plain: (data) =>
        Array.isArray(data)
          ? data.map((entry) => `${entry.id}\t${entry.name}\t${entry.type}\t${entry.isActive ? '1' : '0'}`).join('\n')
          : '',
      human: (data) =>
        Array.isArray(data)
          ? data
              .map((entry) => `${entry.isActive ? '*' : ' '} ${entry.name} (${entry.type}) ${entry.id}`)
              .join('\n')
          : 'No devices.',
    });
  });

device
  .command('set <nameOrId>')
  .description('Select device')
  .action(async (nameOrId, ...args) => {
    const command = args[args.length - 1];
    const { cli, opts } = createContext(command);
    if (opts.provider !== 'spotify') {
      throw new CliUsageError('Device selection is only supported for Spotify Connect.');
    }
    const deviceId = await resolveDevice(cli, nameOrId);
    if (!deviceId) {
      throw new CliUsageError(`Unknown device: ${nameOrId}`);
    }
    const result = await cli.useDevice(deviceId);
    outputResult(opts, result, { plain: () => deviceId, human: () => 'Device switched.' });
  });

const queue = program.command('queue').description('Queue commands');

queue
  .command('add <idOrUrl>')
  .description('Add track to queue')
  .action(async (idOrUrl, ...args) => {
    const command = args[args.length - 1];
    const { cli, opts } = createContext(command);
    if (opts.provider === 'apple') {
      throw new CliUsageError('Queue management is not supported for Apple Music in this build.');
    }

    if (opts.provider === 'spotify') {
      await applyDeviceIfNeeded(cli, opts);
    }

    if (opts.provider === 'youtube') {
      const youtubeUri = normalizeYouTubeUri(idOrUrl);
      if (!youtubeUri) {
        throw new CliUsageError('Invalid YouTube Music URL or URI.');
      }
      const result = await cli.youtubeQueueAdd(youtubeUri);
      outputResult(opts, result, { plain: () => youtubeUri, human: () => `Queued ${youtubeUri}` });
      return;
    }

    const spotifyUri = normalizeSpotifyUri(idOrUrl, 'track');
    if (!spotifyUri) {
      throw new CliUsageError('Invalid Spotify URI or URL.');
    }

    const result = await cli.spotifyQueueAdd(spotifyUri);
    outputResult(opts, result, { plain: () => spotifyUri, human: () => `Queued ${spotifyUri}` });
  });

program
  .command('devices')
  .description('List devices (legacy)')
  .action(async (...args) => {
    const command = args[args.length - 1];
    const { cli, opts } = createContext(command);
    if (opts.provider !== 'spotify') {
      throw new CliUsageError('Device listing is only supported for Spotify Connect.');
    }
    const devices = await cli.devices();
    outputResult(opts, devices);
  });

program
  .command('use <device-id>')
  .description('Select device (legacy)')
  .action(async (deviceId, ...args) => {
    const command = args[args.length - 1];
    const { cli, opts } = createContext(command);
    if (opts.provider !== 'spotify') {
      throw new CliUsageError('Device selection is only supported for Spotify Connect.');
    }
    const result = await cli.useDevice(deviceId);
    outputResult(opts, result, { plain: () => deviceId, human: () => 'Device switched.' });
  });

// ── Smart cross-provider commands ─────────────────────────────────────────────
program
  .command('smart-play <query>')
  .description('Search all connected providers and play the best match')
  .action(async (query, ...args) => {
    const command = args[args.length - 1];
    const { cli, opts } = createContext(command);
    const result = await cli.smartPlay({ query });
    outputResult(opts, result, {
      plain: (data) => data.track ? `${data.provider}\t${data.track.name}\t${data.track.artist}` : 'not found',
      human: (data) => {
        if (!data.success && data.needsAuth) {
          return `${data.provider} needs authentication.\n${data.authUrl ? `Open: ${data.authUrl}` : `Use: harmon auth ${data.provider} login`}`;
        }
        if (!data.success) {
          return data.error || 'Playback failed.';
        }
        const track = data.track;
        return track
          ? `Now playing on ${data.provider}: ${track.artist} - ${track.name} (${track.album})`
          : `Playing on ${data.provider}.`;
      },
    });
  });

program
  .command('smart-search <query>')
  .description('Search all connected providers for a track')
  .action(async (query, ...args) => {
    const command = args[args.length - 1];
    const { cli, opts } = createContext(command);
    const result = await cli.smartSearch(query);
    outputResult(opts, result, {
      plain: (data) => {
        if (!data.results || data.results.length === 0) return 'no results';
        return data.results
          .flatMap((r) => r.tracks.map((t) => `${r.provider}\t${t.name}\t${t.artist}`))
          .join('\n');
      },
      human: (data) => {
        if (!data.results || data.results.length === 0) return 'No results found.';
        const lines = [];
        for (const r of data.results) {
          lines.push(`── ${r.provider} ──`);
          for (const t of r.tracks) {
            lines.push(`  ${t.artist} - ${t.name} (${t.album})`);
          }
        }
        if (data.unavailable && data.unavailable.length > 0) {
          lines.push('');
          for (const u of data.unavailable) {
            lines.push(`${u.provider}: ${u.reason}${u.authUrl ? ` (${u.authUrl})` : ''}`);
          }
        }
        return lines.join('\n');
      },
    });
  });

// ── Song recognition ─────────────────────────────────────────────────────────
program
  .command('listen')
  .description('Listen to ambient audio, recognize the song, and optionally play it')
  .option('--duration <seconds>', 'recording duration in seconds', '5')
  .option('--play', 'play the recognized song via smart-play')
  .option('--provider <name>', 'preferred provider for playback')
  .option('--backend <name>', 'recognition backend: audd, chromaprint, or auto (default: auto)')
  .action(async (...args) => {
    const command = args[args.length - 1];
    const { cli, opts } = createContext(command);
    const cmdOpts = command.opts();
    const duration = Number.parseInt(cmdOpts.duration, 10) || 5;
    const backend = cmdOpts.backend || 'auto';

    if (duration < 3 || duration > 30) {
      throw new CliUsageError('Duration must be between 3 and 30 seconds.');
    }
    if (!['auto', 'audd', 'chromaprint'].includes(backend)) {
      throw new CliUsageError('Backend must be one of: auto, audd, chromaprint.');
    }

    if (!opts.quiet) {
      const backendLabel = backend === 'auto' ? '' : ` (${backend})`;
      process.stderr.write(`Listening for ${duration} seconds${backendLabel}...\n`);
    }

    const result = await listen({ duration, backend });

    if (!result.recognized) {
      outputResult(opts, { recognized: false }, {
        plain: () => '',
        human: () => 'Could not recognize the song. Try again with less background noise or a longer duration (--duration 10).',
      });
      return;
    }

    if (!opts.quiet) {
      const via = result.backend === 'chromaprint' ? ' (via Chromaprint)' : '';
      process.stderr.write(`Recognized${via}: ${result.artist} - ${result.title}\n`);
    }

    // If --play flag, play it
    if (cmdOpts.play) {
      const playUri = result.spotify?.uri;
      const playQuery = `${result.artist} ${result.title}`;
      const playResult = await cli.smartPlay({
        uri: playUri,
        query: playUri ? undefined : playQuery,
        provider: cmdOpts.provider || opts.provider,
      });

      outputResult(opts, { ...result, playback: playResult }, {
        plain: (data) => `${data.artist}\t${data.title}\t${data.album}\t${data.playback?.provider || ''}`,
        human: (data) => {
          const lines = [
            `${data.artist} — ${data.title}`,
            data.album ? `Album: ${data.album}` : null,
            data.releaseDate ? `Released: ${data.releaseDate}` : null,
            data.playback?.success ? `Now playing on ${data.playback.provider}` : null,
          ].filter(Boolean);
          return lines.join('\n');
        },
      });
      return;
    }

    // Just output recognition result
    outputResult(opts, result, {
      plain: (data) => `${data.artist}\t${data.title}\t${data.album}`,
      human: (data) => {
        const lines = [
          `${data.artist} — ${data.title}`,
          data.album ? `Album: ${data.album}` : null,
          data.releaseDate ? `Released: ${data.releaseDate}` : null,
          data.spotify ? `Spotify: ${data.spotify.uri}` : null,
          data.apple ? `Apple Music: ${data.apple.url}` : null,
        ].filter(Boolean);
        return lines.join('\n');
      },
    });
  });

async function main() {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    const details = classifyCliError(error, process.argv);
    if (details.exitCode === 0) {
      process.exitCode = 0;
      return;
    }
    if (details.json) {
      console.error(JSON.stringify({ error: details.message, exitCode: details.exitCode }));
    } else {
      console.error(`Error: ${details.message}`);
      if (details.exitCode === 4 && details.message.includes('fetch failed')) {
        console.error('  Start it with: harmond');
      }
    }
    process.exitCode = details.exitCode;
  }
}

// Handle signals
process.on('SIGINT', () => { process.exit(130); });

const isMain = import.meta.url === pathToFileURL(process.argv[1] || '').href;
if (isMain) {
  main();
}
