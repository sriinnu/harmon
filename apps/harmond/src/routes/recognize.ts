/**
 * routes/recognize.ts — Song recognition endpoint
 *
 * Accepts audio data (base64-encoded WAV) and returns recognition results
 * from the configured recognition service. This allows non-CLI clients
 * (web app, companion, MCP) to submit audio for identification.
 *
 * @module routes/recognize
 */

import type { Application, Request, Response } from 'express';
import type { DaemonContext } from '../daemon-context.js';
import { ValidationError } from '../errors.js';

/** Maximum audio payload size: 2MB (base64-encoded ~30s of 16kHz mono WAV) */
const MAX_AUDIO_SIZE = 2 * 1024 * 1024;

/**
 * Rate limiting: this route inherits the global 120 req/min rate limit
 * applied in the middleware stack — no dedicated limiter needed.
 */
export function registerRecognizeRoutes(app: Application, ctx: DaemonContext): void {
  app.post('/v1/recognize', async (req: Request, res: Response) => {
    try {
      const audioBase64 = req.body?.audio;
      if (typeof audioBase64 !== 'string' || audioBase64.length === 0) {
        throw new ValidationError('Missing audio field (base64-encoded WAV)');
      }
      if (audioBase64.length > MAX_AUDIO_SIZE) {
        throw new ValidationError(`Audio data exceeds ${MAX_AUDIO_SIZE} bytes`);
      }

      const apiToken = process.env.AUDD_API_TOKEN;
      if (!apiToken) {
        res.status(503).json({
          success: false,
          error: 'Song recognition not configured. Set AUDD_API_TOKEN.',
        });
        return;
      }

      // Decode and send to AudD
      const audioBuffer = Buffer.from(audioBase64, 'base64');
      const formData = new FormData();
      formData.append('api_token', apiToken);
      formData.append('file', new Blob([audioBuffer], { type: 'audio/wav' }), 'recording.wav');
      formData.append('return', 'apple_music,spotify');

      // 15-second timeout for the upstream recognition service
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      let response: globalThis.Response;
      try {
        response = await fetch('https://api.audd.io/', {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        throw new Error(`Recognition service error: ${response.status}`);
      }

      const data = await response.json() as Record<string, any>;

      if (data.status === 'error') {
        throw new Error(data.error?.error_message || 'Recognition failed');
      }

      if (!data.result) {
        res.json({ success: true, recognized: false });
        return;
      }

      const result = data.result as Record<string, any>;
      res.json({
        success: true,
        recognized: true,
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
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        res.status(504).json({ success: false, error: 'Recognition service timed out (15s). Try again.' });
        return;
      }
      ctx.handleRouteError(res, error);
    }
  });
}
