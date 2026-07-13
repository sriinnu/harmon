/**
 * listen.js — Song recognition via microphone recording
 *
 * Two recognition backends, chosen automatically:
 *
 * 1. **AudD** (commercial, best accuracy):
 *    Requires AUDD_API_TOKEN. Sends audio to https://api.audd.io/
 *
 * 2. **Chromaprint + AcoustID + MusicBrainz** (open-source, free):
 *    Requires `fpcalc` (ships with Chromaprint, needs FFmpeg).
 *    Fingerprints audio locally, looks up via AcoustID → MusicBrainz.
 *    Set ACOUSTID_API_KEY for higher rate limits (optional — works without).
 *
 * Fallback order:
 *   AUDD_API_TOKEN set? → AudD
 *   fpcalc installed?   → Chromaprint + AcoustID
 *   Neither?            → error with install instructions
 *
 * Requires: sox installed (brew install sox / apt install sox)
 *
 * @module listen
 */

import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

// ============================================================================
// Audio recording (shared by both backends)
// ============================================================================

/**
 * Record audio from microphone using sox's `rec` command.
 * @param {number} durationSeconds - How long to record (default: 5)
 * @returns {Promise<{ audioBuffer: Buffer, wavPath: string }>}
 */
export async function recordAudio(durationSeconds = 5) {
  const tempDir = await mkdtemp(join(tmpdir(), 'harmon-listen-'));
  const outputPath = join(tempDir, 'recording.wav');

  return new Promise((resolve, reject) => {
    const child = spawn('rec', [
      outputPath,
      'rate', '16000',
      'channels', '1',
      'trim', '0', String(durationSeconds),
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    child.on('error', (error) => {
      if (error.code === 'ENOENT') {
        reject(new Error(
          'sox is not installed. Install it:\n' +
          '  macOS:  brew install sox\n' +
          '  Ubuntu: sudo apt install sox\n' +
          '  Fedora: sudo dnf install sox'
        ));
      } else {
        reject(error);
      }
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Recording failed (exit ${code}): ${stderr.trim()}`));
        return;
      }
      try {
        const audioBuffer = readFileSync(outputPath);
        resolve({ audioBuffer, wavPath: outputPath });
      } catch (err) {
        reject(err);
      }
    });
  });
}

// ============================================================================
// Backend 1: AudD (commercial)
// ============================================================================

/**
 * Recognize a song using the AudD API.
 * @param {Buffer} audioData - WAV audio data
 * @param {string} apiToken - AudD API token
 * @returns {Promise<RecognitionResult>}
 */
export async function recognizeWithAudD(audioData, apiToken) {
  const formData = new FormData();
  formData.append('api_token', apiToken);
  formData.append('file', new Blob([audioData], { type: 'audio/wav' }), 'recording.wav');
  formData.append('return', 'apple_music,spotify');

  const response = await fetch('https://api.audd.io/', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`AudD API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (data.status === 'error') {
    throw new Error(`AudD error: ${data.error?.error_message || 'Unknown error'}`);
  }

  if (!data.result) {
    return { recognized: false, backend: 'audd' };
  }

  const result = data.result;
  return {
    recognized: true,
    backend: 'audd',
    title: result.title || '',
    artist: result.artist || '',
    album: result.album || '',
    releaseDate: result.release_date || '',
    isrc: result.isrc || undefined,
    spotify: result.spotify ? {
      uri: result.spotify.uri,
      id: result.spotify.id,
      name: result.spotify.name,
      artist: result.spotify.artists?.[0]?.name,
      album: result.spotify.album?.name,
      imageUrl: result.spotify.album?.images?.[0]?.url,
    } : undefined,
    apple: result.apple_music ? {
      url: result.apple_music.url,
      name: result.apple_music.name,
      artist: result.apple_music.artistName,
      album: result.apple_music.albumName,
      imageUrl: result.apple_music.artwork?.url,
    } : undefined,
  };
}

// ============================================================================
// Backend 2: Chromaprint + AcoustID + MusicBrainz (open-source)
// ============================================================================

/**
 * Check if fpcalc (Chromaprint CLI) is available on the system.
 * @returns {Promise<boolean>}
 */
export async function isFpcalcAvailable() {
  return new Promise((resolve) => {
    const child = spawn('fpcalc', ['-version'], { stdio: ['ignore', 'pipe', 'pipe'] });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}

/**
 * Generate an audio fingerprint using Chromaprint's fpcalc.
 * Runs locally — no network needed for this step.
 *
 * @param {string} wavPath - Path to the WAV file
 * @returns {Promise<{ duration: number, fingerprint: string }>}
 */
async function generateFingerprint(wavPath) {
  return new Promise((resolve, reject) => {
    const child = spawn('fpcalc', ['-json', wavPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    child.on('error', (error) => {
      if (error.code === 'ENOENT') {
        reject(new Error(
          'fpcalc is not installed. Install Chromaprint:\n' +
          '  macOS:  brew install chromaprint\n' +
          '  Ubuntu: sudo apt install libchromaprint-tools\n' +
          '  Fedora: sudo dnf install chromaprint-tools\n' +
          '(FFmpeg is also required: brew install ffmpeg)'
        ));
      } else {
        reject(error);
      }
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`fpcalc failed (exit ${code}): ${stderr.trim()}`));
        return;
      }
      try {
        const result = JSON.parse(stdout);
        resolve({
          duration: Math.round(result.duration),
          fingerprint: result.fingerprint,
        });
      } catch {
        reject(new Error('Failed to parse fpcalc output'));
      }
    });
  });
}

/**
 * Look up a Chromaprint fingerprint against the AcoustID database.
 * Returns MusicBrainz recording IDs that match.
 *
 * @param {string} fingerprint - Chromaprint fingerprint string
 * @param {number} duration - Audio duration in seconds
 * @param {string} [apiKey] - AcoustID API key (optional for basic lookups)
 * @returns {Promise<Array<{ id: string, score: number, recordings: Array }>>}
 */
async function lookupAcoustID(fingerprint, duration, apiKey) {
  const clientId = apiKey || process.env.ACOUSTID_API_KEY || 'harmon-open';
  const params = new URLSearchParams({
    client: clientId,
    duration: String(duration),
    fingerprint,
    meta: 'recordings+releasegroups+compress',
  });

  const response = await fetch(`https://api.acoustid.org/v2/lookup?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`AcoustID API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (data.status === 'error') {
    throw new Error(`AcoustID error: ${data.error?.message || 'Unknown error'}`);
  }

  return data.results || [];
}

/**
 * Extract the best recognition result from AcoustID lookup results.
 * Parses MusicBrainz recording metadata into our standard format.
 *
 * @param {Array} acoustIdResults - Results from AcoustID lookup
 * @returns {RecognitionResult}
 */
function parseAcoustIDResults(acoustIdResults) {
  if (!acoustIdResults || acoustIdResults.length === 0) {
    return { recognized: false, backend: 'chromaprint' };
  }

  // Find the best match (highest score with recording metadata)
  for (const result of acoustIdResults) {
    const recordings = result.recordings;
    if (!recordings || recordings.length === 0) continue;

    const recording = recordings[0];
    const artists = recording.artists || [];
    const releaseGroups = recording.releasegroups || [];
    const album = releaseGroups.length > 0 ? releaseGroups[0] : null;

    return {
      recognized: true,
      backend: 'chromaprint',
      confidence: result.score,
      title: recording.title || '',
      artist: artists.map((a) => a.name).join(', ') || '',
      album: album?.title || '',
      releaseDate: album?.firstreleasedate || '',
      musicBrainzId: recording.id,
      // Chromaprint doesn't provide direct Spotify/Apple links,
      // but the ISRC or MusicBrainz ID can be used for cross-lookup
      isrc: undefined,
      spotify: undefined,
      apple: undefined,
    };
  }

  return { recognized: false, backend: 'chromaprint' };
}

/**
 * Recognize a song using Chromaprint fingerprint + AcoustID + MusicBrainz.
 * Fully open-source pipeline — no commercial API keys needed.
 *
 * @param {string} wavPath - Path to the recorded WAV file
 * @param {{ apiKey?: string }} [options]
 * @returns {Promise<RecognitionResult>}
 */
export async function recognizeWithChromaprint(wavPath, options = {}) {
  const { duration, fingerprint } = await generateFingerprint(wavPath);
  const acoustIdResults = await lookupAcoustID(fingerprint, duration, options.apiKey);
  return parseAcoustIDResults(acoustIdResults);
}

// ============================================================================
// Unified listen flow
// ============================================================================

/**
 * Full listen flow with automatic backend selection:
 *   1. AUDD_API_TOKEN set? → Use AudD
 *   2. fpcalc available?   → Use Chromaprint + AcoustID
 *   3. Neither?            → Error with install instructions
 *
 * @param {{ duration?: number, apiToken?: string, backend?: 'audd' | 'chromaprint' | 'auto' }} options
 * @returns {Promise<RecognitionResult>}
 */
export async function listen(options = {}) {
  const duration = options.duration || 5;
  const auddToken = options.apiToken || process.env.AUDD_API_TOKEN;
  const forceBackend = options.backend || 'auto';

  // Record audio
  const { audioBuffer, wavPath } = await recordAudio(duration);

  try {
    // Backend selection
    if (forceBackend === 'audd') {
      if (!auddToken) throw new Error('AudD backend requested but AUDD_API_TOKEN is not set.');
      return await recognizeWithAudD(audioBuffer, auddToken);
    }

    if (forceBackend === 'chromaprint') {
      return await recognizeWithChromaprint(wavPath);
    }

    // Auto mode: prefer AudD if available, fall back to Chromaprint
    if (auddToken) {
      return await recognizeWithAudD(audioBuffer, auddToken);
    }

    if (await isFpcalcAvailable()) {
      return await recognizeWithChromaprint(wavPath);
    }

    // Neither available
    throw new Error(
      'No recognition backend available.\n\n' +
      'Option 1 — AudD (commercial, best accuracy):\n' +
      '  Get a free token at https://audd.io/ and set AUDD_API_TOKEN\n\n' +
      'Option 2 — Chromaprint (open-source, free):\n' +
      '  macOS:  brew install chromaprint ffmpeg\n' +
      '  Ubuntu: sudo apt install libchromaprint-tools ffmpeg\n' +
      '  Fedora: sudo dnf install chromaprint-tools ffmpeg'
    );
  } finally {
    // Remove the whole mkdtemp directory, not just the WAV inside it —
    // otherwise every `harmon listen` leaks an empty temp dir.
    rm(dirname(wavPath), { recursive: true, force: true }).catch(() => {});
  }
}
