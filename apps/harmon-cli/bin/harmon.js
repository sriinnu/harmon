#!/usr/bin/env node
/**
 * Harmon CLI entry point
 */

import { Command } from 'commander';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCLI, getDefaultEndpoint } from '../dist/index.js';

const program = new Command();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const siloPackagePath = path.join(repoRoot, 'tools', 'harmon-silo');

function parseDuration(value) {
  if (typeof value !== 'string') return 10000;
  const match = value.trim().match(/^(\d+)(ms|s|m|h)?$/);
  if (!match) return 10000;
  const amount = Number.parseInt(match[1], 10);
  const unit = match[2] || 's';
  if (!Number.isFinite(amount)) return 10000;
  switch (unit) {
    case 'ms':
      return amount;
    case 's':
      return amount * 1000;
    case 'm':
      return amount * 60 * 1000;
    case 'h':
      return amount * 60 * 60 * 1000;
    default:
      return 10000;
  }
}

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
  const timeoutMs = parseDuration(opts.timeout);
  return {
    opts,
    cli: createCLI({ endpoint, token, timeoutMs }),
  };
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

async function readCookieFile(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (parsed && Array.isArray(parsed.records)) {
    return parsed.records;
  }
  throw new Error('Unsupported cookie file format.');
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

function isAppleInput(value) {
  if (!value) return false;
  return value.startsWith('applemusic:') || value.includes('music.apple.com');
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
  const deviceId = await resolveDevice(cli, opts.device);
  if (!deviceId) {
    throw new Error(`Unknown device: ${opts.device}`);
  }
  await cli.useDevice(deviceId);
}

program
  .name('harmon')
  .description('Harmon CLI')
  .option('--config <path>', 'config file path')
  .option('--profile <name>', 'profile name', 'default')
  .option('--timeout <dur>', 'request timeout', '10s')
  .option('--market <cc>', 'market country code')
  .option('--language <tag>', 'language/locale', 'en')
  .option('--device <name|id>', 'target device')
  .option('--engine <auto|web|connect|applescript>', 'API engine', 'connect')
  .option('--json', 'json output')
  .option('--plain', 'plain output')
  .option('--no-color', 'disable color output')
  .option('-q, --quiet', 'suppress output')
  .option('-v, --verbose', 'verbose output')
  .option('-d, --debug', 'debug output');

program
  .command('status')
  .description('Show daemon and playback status')
  .action(async (...args) => {
    const command = args[args.length - 1];
    const { cli, opts } = createContext(command);
    const status = await cli.status();
    let nowPlaying = null;
    try {
      nowPlaying = await cli.spotifyNowPlaying();
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
        const lines = [
          `daemon: ${data.status.isRunning ? 'running' : 'stopped'}`,
          `spotify: ${data.status.spotifyConnected ? 'connected' : 'not connected'}`,
        ];
        if (data.status.session) {
          lines.push(`session: ${data.status.session.id} (${data.status.session.isActive ? 'active' : 'idle'})`);
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
      human: (data) => (data.spotifyConnected ? 'spotify: connected' : 'spotify: not connected'),
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
    const { cli, opts } = createContext(command);
    let cookies = [];
    if (command.opts().cookiePath) {
      cookies = normalizeCookies(await readCookieFile(command.opts().cookiePath));
    } else {
      const exportResult = await runSiloExport({
        browser: command.opts().browser,
        browserProfile: command.opts().browserProfile,
        domain: command.opts().domain,
      });
      cookies = normalizeCookies(exportResult.records || []);
    }

    if (!Array.isArray(cookies) || cookies.length === 0) {
      throw new Error('No cookies found. Try a different browser/profile or pass --cookie-path.');
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

const search = program.command('search').description('Search catalog');

function registerSearch(type) {
  search
    .command(`${type} <query>`)
    .option('--limit <n>', 'limit results', (value) => Number.parseInt(value, 10))
    .option('--offset <n>', 'offset', (value) => Number.parseInt(value, 10))
    .action(async (query, ...args) => {
      const command = args[args.length - 1];
      const { cli, opts } = createContext(command);
      const result = await cli.spotifySearch(query, type, {
        limit: command.opts().limit,
        offset: command.opts().offset,
      });
      const formatters = {
        track: { human: (data) => formatTrackLines(data.tracks), plain: (data) => formatTrackPlain(data.tracks) },
        album: { human: (data) => formatAlbumLines(data.albums), plain: (data) => formatAlbumPlain(data.albums) },
        artist: { human: (data) => formatArtistLines(data.artists), plain: (data) => formatArtistPlain(data.artists) },
        playlist: {
          human: (data) => formatPlaylistLines(data.playlists),
          plain: (data) => formatPlaylistPlain(data.playlists),
        },
      };
      const output = formatters[type] || {};
      outputResult(opts, result, output);
    });
}

['track', 'album', 'artist', 'playlist'].forEach(registerSearch);

program
  .command('play [idOrUrl]')
  .description('Play a track/album/playlist')
  .option('--type <type>', 'type for raw IDs (track|album|playlist|artist|show|episode)')
  .action(async (idOrUrl, ...args) => {
    const command = args[args.length - 1];
    const { cli, opts } = createContext(command);
    const useAppleScript = opts.engine === 'applescript' || isAppleInput(idOrUrl);
    if (!useAppleScript) {
      await applyDeviceIfNeeded(cli, opts);
    }

    const typeOverride = command.opts().type;
    if (
      typeOverride &&
      !['track', 'album', 'playlist', 'artist', 'show', 'episode'].includes(typeOverride)
    ) {
      throw new Error('Invalid type. Use track, album, playlist, artist, show, or episode.');
    }

    if (!idOrUrl) {
      if (opts.engine === 'applescript') {
        const result = await cli.applePlay();
        outputResult(opts, result, {
          plain: () => 'ok',
          human: () => 'Resumed Apple Music playback.',
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

    if (useAppleScript) {
      const url = normalizeAppleMusicUrl(idOrUrl, opts.market);
      if (!url) {
        throw new Error('Invalid Apple Music URL or URI.');
      }
      const result = await cli.applePlay({ url });
      outputResult(opts, result, {
        plain: () => url,
        human: () => `Playing Apple Music ${url}`,
      });
      return;
    }

    const spotifyUri = normalizeSpotifyUri(idOrUrl, typeOverride);
    if (!spotifyUri) {
      throw new Error('Invalid Spotify URI or URL.');
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
    if (opts.engine !== 'applescript') {
      await applyDeviceIfNeeded(cli, opts);
    }
    const result = opts.engine === 'applescript' ? await cli.applePause() : await cli.spotifyPause();
    outputResult(opts, result, {
      plain: () => 'ok',
      human: () => (opts.engine === 'applescript' ? 'Apple Music paused.' : 'Paused.'),
    });
  });

program
  .command('next')
  .description('Skip to next track')
  .action(async (...args) => {
    const command = args[args.length - 1];
    const { cli, opts } = createContext(command);
    if (opts.engine !== 'applescript') {
      await applyDeviceIfNeeded(cli, opts);
    }
    const result = opts.engine === 'applescript' ? await cli.appleNext() : await cli.spotifyNext();
    outputResult(opts, result, {
      plain: () => 'ok',
      human: () => (opts.engine === 'applescript' ? 'Apple Music next.' : 'Skipped.'),
    });
  });

program
  .command('prev')
  .description('Skip to previous track')
  .action(async (...args) => {
    const command = args[args.length - 1];
    const { cli, opts } = createContext(command);
    if (opts.engine !== 'applescript') {
      await applyDeviceIfNeeded(cli, opts);
    }
    const result = opts.engine === 'applescript' ? await cli.applePrev() : await cli.spotifyPrev();
    outputResult(opts, result, {
      plain: () => 'ok',
      human: () => (opts.engine === 'applescript' ? 'Apple Music previous.' : 'Previous track.'),
    });
  });

program
  .command('seek <position>')
  .description('Seek to a position (ms or mm:ss)')
  .action(async (position, ...args) => {
    const command = args[args.length - 1];
    const { cli, opts } = createContext(command);
    if (opts.engine === 'applescript') {
      throw new Error('Seek is not supported for Apple Music via AppleScript.');
    }
    await applyDeviceIfNeeded(cli, opts);
    const positionMs = parseSeekValue(position);
    if (positionMs === null) {
      throw new Error('Invalid seek position.');
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
    if (opts.engine === 'applescript') {
      throw new Error('Volume control is not supported for Apple Music via AppleScript.');
    }
    await applyDeviceIfNeeded(cli, opts);
    const volumePercent = Number.parseInt(percent, 10);
    if (!Number.isFinite(volumePercent) || volumePercent < 0 || volumePercent > 100) {
      throw new Error('Volume must be 0-100.');
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
    if (opts.engine === 'applescript') {
      throw new Error('Shuffle is not supported for Apple Music via AppleScript.');
    }
    await applyDeviceIfNeeded(cli, opts);
    const normalized = state === 'on' ? true : state === 'off' ? false : null;
    if (normalized === null) {
      throw new Error('Shuffle state must be on or off.');
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
    if (opts.engine === 'applescript') {
      throw new Error('Repeat is not supported for Apple Music via AppleScript.');
    }
    await applyDeviceIfNeeded(cli, opts);
    if (!['off', 'track', 'context'].includes(state)) {
      throw new Error('Repeat state must be off, track, or context.');
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
    const deviceId = await resolveDevice(cli, nameOrId);
    if (!deviceId) {
      throw new Error(`Unknown device: ${nameOrId}`);
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
    if (opts.engine === 'applescript') {
      throw new Error('Queue management is not supported for Apple Music via AppleScript.');
    }
    await applyDeviceIfNeeded(cli, opts);

    if (isAppleInput(idOrUrl)) {
      throw new Error('Apple Music queue is not supported in this build.');
    }

    const spotifyUri = normalizeSpotifyUri(idOrUrl, 'track');
    if (!spotifyUri) {
      throw new Error('Invalid Spotify URI or URL.');
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
    const devices = await cli.devices();
    outputResult(opts, devices);
  });

program
  .command('use <device-id>')
  .description('Select device (legacy)')
  .action(async (deviceId, ...args) => {
    const command = args[args.length - 1];
    const { cli, opts } = createContext(command);
    const result = await cli.useDevice(deviceId);
    outputResult(opts, result, { plain: () => deviceId, human: () => 'Device switched.' });
  });

async function main() {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
