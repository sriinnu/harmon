/**
 * Integration tests for Harmond HTTP API
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { Harmond } from './index.js';
import type { SessionPolicy } from '@sriinnu/harmon-protocol';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { request as httpRequest } from 'node:http';

// ============================================================================
// Test Setup & Fixtures
// ============================================================================

const TEST_API_TOKEN = 'test-token-' + randomBytes(16).toString('hex');
const INVALID_TOKEN = 'invalid-token';

function createTestDaemon(
  options: {
    apiToken?: string;
    corsOrigins?: string[];
    enableSSE?: boolean;
    onShutdownRequest?: () => void;
  } = {},
) {
  const dbPath = join(tmpdir(), `harmon-test-${Date.now()}-${Math.random()}.db`);

  return new Harmond({
    port: 0, // Random port
    host: '127.0.0.1',
    dbPath,
    apiToken: options.apiToken,
    corsOrigins: options.corsOrigins,
    enableSSE: options.enableSSE,
    onShutdownRequest: options.onShutdownRequest,
  });
}

async function withProductionDaemon(
  run: (daemon: Harmond, app: any) => Promise<void>,
): Promise<void> {
  const previousEnv = {
    HARMON_CORS_ORIGINS: process.env.HARMON_CORS_ORIGINS,
    HARMON_ENCRYPTION_SECRET: process.env.HARMON_ENCRYPTION_SECRET,
    NODE_ENV: process.env.NODE_ENV,
    SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID,
    SPOTIFY_REDIRECT_URI: process.env.SPOTIFY_REDIRECT_URI,
  };

  process.env.NODE_ENV = 'production';
  process.env.HARMON_ENCRYPTION_SECRET = 'x'.repeat(32);
  process.env.HARMON_CORS_ORIGINS = 'http://localhost:3000';
  delete process.env.SPOTIFY_CLIENT_ID;
  delete process.env.SPOTIFY_REDIRECT_URI;

  const daemon = createTestDaemon({
    apiToken: TEST_API_TOKEN,
    corsOrigins: ['http://localhost:3000'],
  });

  try {
    await daemon.start();
    await run(daemon, (daemon as any).app);
  } finally {
    await daemon.stop().catch(() => undefined);

    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

const mockSessionPolicy: SessionPolicy = {
  version: 1,
  mode: 'focus',
  durationMs: 3600000,
  hard: {
    noVocals: true,
    energy: { min: 0.5, max: 0.9 },
  },
  soft: {
    weights: {
      energy: 0.8,
      instrumentalness: 0.7,
      valence: 0.5,
    },
  },
  sources: {
    likedTracks: true,
    topTracks: true,
  },
};

function getDaemonBaseUrl(daemon: Harmond): string {
  const address = (daemon as any).server?.address();
  if (!address || typeof address === 'string') {
    throw new Error('Test daemon address unavailable');
  }
  return `http://127.0.0.1:${address.port}`;
}

const mockProviderTracks = [
  {
    id: 'track-1',
    name: 'Focus One',
    artist: 'Artist One',
    artistIds: ['artist-1'],
    album: 'Album One',
    durationMs: 180000,
    uri: 'spotify:track:track-1',
    provider: 'spotify' as const,
  },
  {
    id: 'track-2',
    name: 'Focus Two',
    artist: 'Artist Two',
    artistIds: ['artist-2'],
    album: 'Album Two',
    durationMs: 200000,
    uri: 'spotify:track:track-2',
    provider: 'spotify' as const,
  },
];

const mockAudioFeatures = mockProviderTracks.map((_, index) => ({
  energy: 0.55 + index * 0.05,
  instrumentalness: 0.75,
  speechiness: 0.05,
  valence: 0.45,
  acousticness: 0.3,
  tempo: 118 + index,
  danceability: 0.6,
  liveness: 0.12,
  loudness: -7,
  key: 5,
  mode: 1,
  timeSignature: 4,
}));

function stubConnectedSpotify(daemon: Harmond): void {
  const spotifyAuth = (daemon as any).spotifyAuth;
  const spotifyClient = (daemon as any).spotifyClient;
  vi.spyOn(spotifyAuth, 'getAuthMode').mockReturnValue('oauth');
  vi.spyOn(spotifyAuth, 'getAccessToken').mockResolvedValue('access-token');
  vi.spyOn(spotifyClient, 'isConnected').mockReturnValue(true);
  vi.spyOn(spotifyClient, 'getSavedTracks').mockResolvedValue({
    items: mockProviderTracks.map((track) => ({ track })),
  });
  vi.spyOn(spotifyClient, 'getTopTracks').mockResolvedValue({
    items: mockProviderTracks,
  });
  vi.spyOn(spotifyClient, 'getAudioFeatures').mockResolvedValue(mockAudioFeatures);
  vi.spyOn(spotifyClient, 'addToQueue').mockResolvedValue(undefined);
  vi.spyOn(spotifyClient, 'play').mockResolvedValue(undefined);
  vi.spyOn(spotifyClient, 'next').mockResolvedValue(undefined);
}

// ============================================================================
// Health Endpoint Tests
// ============================================================================

describe('Health Endpoint', () => {
  let daemon: Harmond;
  let app: any;

  beforeAll(async () => {
    daemon = createTestDaemon();
    await daemon.start();
    app = (daemon as any).app;
  });

  afterAll(async () => {
    await daemon.stop();
  });

  it('GET /health returns 200 with status ok', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      version: expect.any(String),
      timestamp: expect.any(String),
    });
  });

  it('GET /health does not require authentication', async () => {
    const daemonWithAuth = createTestDaemon({ apiToken: TEST_API_TOKEN });
    await daemonWithAuth.start();
    const appWithAuth = (daemonWithAuth as any).app;

    const response = await request(appWithAuth).get('/health');

    expect(response.status).toBe(200);

    await daemonWithAuth.stop();
  });
});

// ============================================================================
// Authentication Tests
// ============================================================================

describe('Authentication', () => {
  describe('with API token configured', () => {
    let daemon: Harmond;
    let app: any;

    beforeAll(async () => {
      daemon = createTestDaemon({ apiToken: TEST_API_TOKEN });
      await daemon.start();
      app = (daemon as any).app;
    });

    afterAll(async () => {
      await daemon.stop();
    });

    it('accepts valid Bearer token', async () => {
      const response = await request(app)
        .get('/v1/status')
        .set('Authorization', `Bearer ${TEST_API_TOKEN}`);

      expect(response.status).toBe(200);
    });

    it('accepts valid token without Bearer prefix', async () => {
      const response = await request(app)
        .get('/v1/status')
        .set('Authorization', TEST_API_TOKEN);

      expect(response.status).toBe(200);
    });

    it('rejects invalid token', async () => {
      const response = await request(app)
        .get('/v1/status')
        .set('Authorization', `Bearer ${INVALID_TOKEN}`);

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        success: false,
        error: 'Unauthorized',
      });
    });

    it('rejects request with missing auth header', async () => {
      const response = await request(app).get('/v1/status');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        success: false,
        error: 'Unauthorized',
      });
    });

    it('rejects token with wrong length (timing-safe check)', async () => {
      const response = await request(app)
        .get('/v1/status')
        .set('Authorization', 'Bearer short');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Unauthorized');
    });

    it('uses timing-safe comparison for token validation', async () => {
      // Test that similar tokens are rejected
      const almostCorrectToken = TEST_API_TOKEN.slice(0, -1) + 'X';

      const response = await request(app)
        .get('/v1/status')
        .set('Authorization', `Bearer ${almostCorrectToken}`);

      expect(response.status).toBe(401);
    });
  });

  describe('without API token configured', () => {
    let daemon: Harmond;
    let app: any;

    beforeAll(async () => {
      daemon = createTestDaemon(); // No token
      await daemon.start();
      app = (daemon as any).app;
    });

    afterAll(async () => {
      await daemon.stop();
    });

    it('allows requests without authentication in development', async () => {
      const response = await request(app).get('/v1/status');

      expect(response.status).toBe(200);
    });
  });

  describe('spotify cookie import', () => {
    let daemon: Harmond;
    let app: any;

    beforeAll(async () => {
      daemon = createTestDaemon({ apiToken: TEST_API_TOKEN });
      await daemon.start();
      app = (daemon as any).app;
    });

    afterAll(async () => {
      await daemon.stop();
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    it('rejects cookie payloads without supported Spotify auth cookies', async () => {
      const response = await request(app)
        .post('/v1/auth/spotify/import')
        .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
        .send({
          cookies: [
            {
              domain: '.spotify.com',
              name: 'other',
              path: '/',
              value: 'ignore-me',
            },
          ],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('sp_dc');
    });

    it('imports only supported Spotify auth cookies without clearing existing auth state', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          accessToken: 'cookie-token',
          accessTokenExpirationTimestampMs: Date.now() + 5 * 60_000,
          tokenType: 'Bearer',
        }),
      }));
      const logoutSpy = vi.spyOn((daemon as any).spotifyAuth, 'logout');
      const setCookiesSpy = vi.spyOn((daemon as any).spotifyAuth, 'setCookies');

      const response = await request(app)
        .post('/v1/auth/spotify/import')
        .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
        .send({
          cookies: [
            {
              domain: '.spotify.com',
              name: 'sp_dc',
              path: '/',
              value: 'keep-me',
            },
            {
              domain: '.spotify.com',
              name: 'other',
              path: '/',
              value: 'drop-me',
            },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        cookiesImported: 1,
      });
      expect(logoutSpy).not.toHaveBeenCalled();
      expect(setCookiesSpy).toHaveBeenCalledWith([
        expect.objectContaining({
          domain: 'spotify.com',
          name: 'sp_dc',
          value: 'keep-me',
        }),
      ]);
    });

    it('rejects imported cookies that cannot produce a Spotify access token', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'expired',
      }));

      const response = await request(app)
        .post('/v1/auth/spotify/import')
        .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
        .send({
          cookies: [
            {
              domain: '.spotify.com',
              name: 'sp_dc',
              path: '/',
              value: 'stale-cookie',
            },
          ],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('rejected by Spotify');
    });
  });
});

// ============================================================================
// Status Endpoint Tests
// ============================================================================

describe('Status Endpoint', () => {
  let daemon: Harmond;
  let app: any;

  beforeAll(async () => {
    daemon = createTestDaemon({ apiToken: TEST_API_TOKEN });
    await daemon.start();
    app = (daemon as any).app;
  });

  beforeEach(() => {
    stubConnectedSpotify(daemon);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await daemon.stop();
  });

  it('GET /v1/status returns daemon status', async () => {
    const response = await request(app)
      .get('/v1/status')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      isRunning: true,
      version: expect.any(String),
      spotifyConnected: expect.any(Boolean),
      features: {
        sse: true,
      },
    });
    expect(response.body.providers.spotify).toMatchObject({
      auth: expect.any(String),
      capabilities: expect.objectContaining({
        playback: true,
        search: true,
      }),
      status: expect.any(String),
    });
    expect(response.body.providers.apple).toMatchObject({
      capabilities: expect.objectContaining({
        playback: expect.any(Boolean),
        search: expect.any(Boolean),
      }),
      status: expect.any(String),
    });
  });

  it('marks Spotify as degraded when auth material cannot produce an access token', async () => {
    const spotifyAuth = (daemon as any).spotifyAuth;
    vi.spyOn(spotifyAuth, 'getAuthMode').mockReturnValue('cookies');
    vi.spyOn(spotifyAuth, 'getAccessToken').mockRejectedValue(new Error('Spotify cookie token failed: 401 expired'));

    const response = await request(app)
      .get('/v1/status')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`);

    expect(response.status).toBe(200);
    expect(response.body.spotifyConnected).toBe(false);
    expect(response.body.providers.spotify).toMatchObject({
      auth: 'cookies',
      connected: false,
      status: 'degraded',
    });
  });

  it('does not report Apple playback as ready without a configured runtime', async () => {
    (daemon as any).appleCatalogEnabled = false;
    (daemon as any).appleLibraryEnabled = false;
    (daemon as any).applePlaybackEnabled = true;
    (daemon as any).appleRuntime = undefined;

    const response = await request(app)
      .get('/v1/status')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`);

    expect(response.status).toBe(200);
    expect(response.body.providers.apple).toMatchObject({
      connected: false,
      status: 'missing',
      capabilities: expect.objectContaining({
        playback: false,
      }),
    });
  });

  it('includes session info when session is active', async () => {
    // Start a session first
    const commandResponse = await request(app)
      .post('/v1/command')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .send({
        id: 'c_test123',
        ts: Date.now(),
        source: { kind: 'cli', device: 'linux' },
        type: 'session.start',
        payload: { policy: mockSessionPolicy },
      });

    expect(commandResponse.status).toBe(200);

    // Check status includes session
    const statusResponse = await request(app)
      .get('/v1/status')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`);

    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body.session).toBeDefined();
    expect(statusResponse.body.session).toMatchObject({
      id: expect.stringMatching(/^sess_/),
      isActive: true,
      queueDepth: expect.any(Number),
    });
  });
});

// ============================================================================
// Command Endpoint Tests
// ============================================================================

describe('Command Endpoint', () => {
  let daemon: Harmond;
  let app: any;

  beforeEach(async () => {
    daemon = createTestDaemon({ apiToken: TEST_API_TOKEN });
    await daemon.start();
    stubConnectedSpotify(daemon);
    app = (daemon as any).app;
  });

  afterEach(async () => {
    if (daemon) {
      await daemon.stop();
    }
  });

  describe('session.start command', () => {
    it('starts a new session with valid policy', async () => {
      const response = await request(app)
        .post('/v1/command')
        .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
        .send({
          id: 'c_start1',
          ts: Date.now(),
          source: { kind: 'cli', device: 'linux' },
          type: 'session.start',
          payload: { policy: mockSessionPolicy },
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        sessionId: expect.stringMatching(/^sess_/),
      });
    });

    it('starts Spotify playback when a session is created', async () => {
      const spotifyPlayback = (daemon as any).spotifyRuntime.playback;
      const playSpy = vi.spyOn(spotifyPlayback, 'play').mockResolvedValue(undefined);

      const response = await request(app)
        .post('/v1/command')
        .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
        .send({
          id: 'c_start_autoplay',
          ts: Date.now(),
          source: { kind: 'cli', device: 'linux' },
          type: 'session.start',
          payload: { policy: mockSessionPolicy },
        });

      expect(response.status).toBe(200);
      expect(playSpy).toHaveBeenCalledTimes(1);
    });

    it('requires a connected Spotify backend', async () => {
      const spotifyAuth = (daemon as any).spotifyAuth;
      vi.spyOn(spotifyAuth, 'getAuthMode').mockReturnValue('none');
      vi.spyOn(spotifyAuth, 'getAccessToken').mockResolvedValue(null);

      const response = await request(app)
        .post('/v1/command')
        .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
        .send({
          id: 'c_start_disconnected',
          ts: Date.now(),
          source: { kind: 'cli', device: 'linux' },
          type: 'session.start',
          payload: { policy: mockSessionPolicy },
        });

      expect(response.status).toBe(503);
      expect(response.body.code).toBe('PROVIDER_UNAVAILABLE');
      expect(response.body.error).toContain('Spotify is not connected');
    });

    it('rejects session start when Spotify auth exists but cannot produce a live access token', async () => {
      const spotifyAuth = (daemon as any).spotifyAuth;
      vi.spyOn(spotifyAuth, 'getAuthMode').mockReturnValue('cookies');
      vi.spyOn(spotifyAuth, 'getAccessToken').mockRejectedValue(
        new Error('Spotify cookie token failed: 401 expired'),
      );

      const response = await request(app)
        .post('/v1/command')
        .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
        .send({
          id: 'c_start_stale_auth',
          ts: Date.now(),
          source: { kind: 'cli', device: 'linux' },
          type: 'session.start',
          payload: { policy: mockSessionPolicy },
        });

      expect(response.status).toBe(503);
      expect(response.body.code).toBe('PROVIDER_UNAVAILABLE');
      expect(response.body.error).toContain('Spotify is not ready');
    });

    it('validates policy schema', async () => {
      const response = await request(app)
        .post('/v1/command')
        .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
        .send({
          id: 'c_invalid',
          ts: Date.now(),
          source: { kind: 'cli', device: 'linux' },
          type: 'session.start',
          payload: {
            policy: {
              version: 999, // Invalid version
              mode: 'invalid-mode',
            },
          },
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('session.stop command', () => {
    it('stops an active session', async () => {
      // Start session
      await request(app)
        .post('/v1/command')
        .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
        .send({
          id: 'c_start2',
          ts: Date.now(),
          source: { kind: 'cli', device: 'linux' },
          type: 'session.start',
          payload: { policy: mockSessionPolicy },
        });

      // Stop session
      const response = await request(app)
        .post('/v1/command')
        .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
        .send({
          id: 'c_stop1',
          ts: Date.now(),
          source: { kind: 'cli', device: 'linux' },
          type: 'session.stop',
          payload: {},
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('returns error when no session is active', async () => {
      const response = await request(app)
        .post('/v1/command')
        .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
        .send({
          id: 'c_stop2',
          ts: Date.now(),
          source: { kind: 'cli', device: 'linux' },
          type: 'session.stop',
          payload: {},
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('SESSION_NOT_FOUND');
      expect(response.body.error).toContain('No active session');
    });
  });

  describe('session.nudge command', () => {
    it('nudges session in calmer direction', async () => {
      // Start session
      await request(app)
        .post('/v1/command')
        .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
        .send({
          id: 'c_start3',
          ts: Date.now(),
          source: { kind: 'cli', device: 'linux' },
          type: 'session.start',
          payload: { policy: mockSessionPolicy },
        });

      // Nudge calmer
      const response = await request(app)
        .post('/v1/command')
        .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
        .send({
          id: 'c_nudge1',
          ts: Date.now(),
          source: { kind: 'cli', device: 'linux' },
          type: 'session.nudge',
          payload: {
            direction: 'calmer',
            amount: 0.2,
          },
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        newWeights: expect.any(Object),
      });
    });

    it('nudges session in sharper direction', async () => {
      // Start session
      await request(app)
        .post('/v1/command')
        .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
        .send({
          id: 'c_start4',
          ts: Date.now(),
          source: { kind: 'cli', device: 'linux' },
          type: 'session.start',
          payload: { policy: mockSessionPolicy },
        });

      // Nudge sharper
      const response = await request(app)
        .post('/v1/command')
        .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
        .send({
          id: 'c_nudge2',
          ts: Date.now(),
          source: { kind: 'cli', device: 'linux' },
          type: 'session.nudge',
          payload: {
            direction: 'sharper',
            amount: 0.15,
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('returns error when no session is active', async () => {
      const response = await request(app)
        .post('/v1/command')
        .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
        .send({
          id: 'c_nudge3',
          ts: Date.now(),
          source: { kind: 'cli', device: 'linux' },
          type: 'session.nudge',
          payload: {
            direction: 'calmer',
          },
        });

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('SESSION_NOT_FOUND');
      expect(response.body.error).toContain('No active session');
    });
  });

  describe('skip command', () => {
    it('skips current track with reason', async () => {
      vi.spyOn((daemon as any).spotifyClient, 'next').mockResolvedValue(undefined);

      // Start session
      await request(app)
        .post('/v1/command')
        .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
        .send({
          id: 'c_start5',
          ts: Date.now(),
          source: { kind: 'cli', device: 'linux' },
          type: 'session.start',
          payload: { policy: mockSessionPolicy },
        });

      // Skip
      const response = await request(app)
        .post('/v1/command')
        .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
        .send({
          id: 'c_skip1',
          ts: Date.now(),
          source: { kind: 'cli', device: 'linux' },
          type: 'skip',
          payload: {
            reason: 'too loud',
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('command validation', () => {
    it('rejects command with missing required fields', async () => {
      const response = await request(app)
        .post('/v1/command')
        .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
        .send({
          // Missing id, ts, source
          type: 'session.start',
        });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        error: 'Invalid command',
        issues: expect.any(Array),
      });
    });

    it('rejects command with invalid type', async () => {
      const response = await request(app)
        .post('/v1/command')
        .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
        .send({
          id: 'c_invalid',
          ts: Date.now(),
          source: { kind: 'cli', device: 'linux' },
          type: 'invalid.command',
          payload: {},
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('rejects malformed JSON', async () => {
      const response = await request(app)
        .post('/v1/command')
        .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      expect(response.status).toBe(400);
    });
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('Daemon lifecycle endpoint', () => {
  it('acks and requests shutdown via POST /v1/daemon/stop', async () => {
    let shutdownRequested = false;
    const daemon = createTestDaemon({
      apiToken: TEST_API_TOKEN,
      onShutdownRequest: () => { shutdownRequested = true; },
    });
    await daemon.start();
    const app = (daemon as any).app;

    const unauthorized = await request(app).post('/v1/daemon/stop');
    expect(unauthorized.status).toBe(401);
    expect(shutdownRequested).toBe(false);

    const response = await request(app)
      .post('/v1/daemon/stop')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, stopping: true });
    expect(shutdownRequested).toBe(true);

    await daemon.stop();
  });
});

describe('Error Handling', () => {
  let daemon: Harmond;
  let app: any;

  beforeAll(async () => {
    daemon = createTestDaemon({ apiToken: TEST_API_TOKEN });
    await daemon.start();
    stubConnectedSpotify(daemon);
    app = (daemon as any).app;
  });

  afterAll(async () => {
    await daemon.stop();
  });

  it('returns 404 for unknown routes', async () => {
    const response = await request(app)
      .get('/v1/unknown/route')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`);

    expect(response.status).toBe(404);
  });

  it('returns 404 for unknown HTTP methods', async () => {
    const response = await request(app)
      .patch('/v1/status')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`);

    expect(response.status).toBe(404);
  });

  it('returns 400 for validation errors', async () => {
    const response = await request(app)
      .post('/v1/command')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .send({
        // Invalid command structure
        invalid: 'data',
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it('includes error details in development mode', async () => {
    const response = await request(app)
      .post('/v1/command')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .send({
        id: 'c_error',
        ts: Date.now(),
        source: { kind: 'cli', device: 'linux' },
        type: 'session.stop',
        payload: {},
      });

    expect(response.status).toBe(404);
    expect(response.body.error).toBeDefined();
  });
});

// ============================================================================
// Rate Limiting Tests
// ============================================================================

describe('Rate Limiting', () => {
  let daemon: Harmond;
  let app: any;

  beforeAll(async () => {
    daemon = createTestDaemon({ apiToken: TEST_API_TOKEN });
    await daemon.start();
    stubConnectedSpotify(daemon);
    app = (daemon as any).app;
  });

  afterAll(async () => {
    await daemon.stop();
  });

  it('applies rate limiting to command endpoint', async () => {
    const requests: Promise<any>[] = [];

    // Send more than the configured 30 requests/minute command budget.
    for (let i = 0; i < 35; i++) {
      requests.push(
        request(app)
          .post('/v1/command')
          .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
          .send({
            id: `c_rate${i}`,
            ts: Date.now(),
            source: { kind: 'cli', device: 'linux' },
            type: 'session.stop',
            payload: {},
          })
      );
    }

    const responses = await Promise.all(requests);

    // Check that some requests were rate limited
    const rateLimited = responses.filter(r => r.status === 429);
    expect(rateLimited.length).toBeGreaterThan(0);

    // Check rate limit message
    if (rateLimited.length > 0) {
      expect(rateLimited[0].body.error).toContain('rate limit');
    }
  }, 30000);

  it('does not rate limit health endpoint', async () => {
    const requests: Promise<any>[] = [];

    // Send many health check requests
    for (let i = 0; i < 150; i++) {
      requests.push(request(app).get('/health'));
    }

    const responses = await Promise.all(requests);

    // All should succeed
    const allSucceeded = responses.every(r => r.status === 200);
    expect(allSucceeded).toBe(true);
  }, 30000);

  it('includes rate limit headers', async () => {
    const response = await request(app)
      .get('/v1/status')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`);

    expect(response.headers).toHaveProperty('ratelimit-limit');
    expect(response.headers).toHaveProperty('ratelimit-remaining');
    expect(response.headers).toHaveProperty('ratelimit-reset');
  });

  it('does not rate limit the Spotify OAuth callback after earlier auth retries', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/v1/auth/spotify/login')
        .set('Authorization', `Bearer ${TEST_API_TOKEN}`);
    }

    const response = await request(app)
      .get('/v1/auth/spotify/callback')
      .query({ state: 'state-only' });

    expect(response.status).toBe(400);
    expect(response.text).toContain('Missing code');
  });
});

// ============================================================================
// CORS Tests
// ============================================================================

describe('CORS', () => {
  describe('with default local web origins', () => {
    let daemon: Harmond;
    let app: any;

    beforeAll(async () => {
      daemon = createTestDaemon({
        apiToken: TEST_API_TOKEN,
      });
      await daemon.start();
      app = (daemon as any).app;
    });

    afterAll(async () => {
      await daemon.stop();
    });

    it('allows the default local harmon-web origin in non-production mode', async () => {
      const response = await request(app)
        .get('/v1/status')
        .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
        .set('Origin', 'http://127.0.0.1:4173');

      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe('http://127.0.0.1:4173');
    });
  });

  describe('with allowed origins', () => {
    let daemon: Harmond;
    let app: any;
    const allowedOrigin = 'http://localhost:3000';

    beforeAll(async () => {
      daemon = createTestDaemon({
        apiToken: TEST_API_TOKEN,
        corsOrigins: [allowedOrigin],
      });
      await daemon.start();
      app = (daemon as any).app;
    });

    afterAll(async () => {
      await daemon.stop();
    });

    it('allows requests from whitelisted origin', async () => {
      const response = await request(app)
        .get('/v1/status')
        .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
        .set('Origin', allowedOrigin);

      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe(allowedOrigin);
    });

    it('blocks requests from non-whitelisted origin', async () => {
      const response = await request(app)
        .get('/v1/status')
        .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
        .set('Origin', 'http://evil.com');

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Origin not allowed');
    });

    it('handles preflight OPTIONS requests', async () => {
      const response = await request(app)
        .options('/v1/status')
        .set('Origin', allowedOrigin);

      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe(allowedOrigin);
      expect(response.headers['access-control-allow-methods']).toContain('GET');
      expect(response.headers['access-control-allow-methods']).toContain('POST');
    });
  });

  describe('without origin header', () => {
    let daemon: Harmond;
    let app: any;

    beforeAll(async () => {
      daemon = createTestDaemon({
        apiToken: TEST_API_TOKEN,
        corsOrigins: ['http://localhost:3000'],
      });
      await daemon.start();
      app = (daemon as any).app;
    });

    afterAll(async () => {
      await daemon.stop();
    });

    it('allows same-origin requests without Origin header', async () => {
      const response = await request(app)
        .get('/v1/status')
        .set('Authorization', `Bearer ${TEST_API_TOKEN}`);

      expect(response.status).toBe(200);
    });
  });
});

// ============================================================================
// Journal Endpoint Tests
// ============================================================================

describe('Journal Endpoints', () => {
  let daemon: Harmond;
  let app: any;

  beforeAll(async () => {
    daemon = createTestDaemon({ apiToken: TEST_API_TOKEN });
    await daemon.start();
    app = (daemon as any).app;
  });

  afterAll(async () => {
    await daemon.stop();
  });

  it('POST /v1/journal creates journal entry', async () => {
    const response = await request(app)
      .post('/v1/journal')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .send({
        source: 'test',
        device: 'linux',
        moodTags: ['calm', 'focused'],
        energyLevel: 'medium',
        content: 'Test journal entry',
        context: { location: 'home' },
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      id: expect.any(String),
    });
  });

  it('GET /v1/journal retrieves journal entries', async () => {
    // Create an entry first
    await request(app)
      .post('/v1/journal')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .send({
        source: 'test',
        device: 'linux',
        content: 'Retrieve test',
      });

    const response = await request(app)
      .get('/v1/journal')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  it('validates journal entry structure', async () => {
    const response = await request(app)
      .post('/v1/journal')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .send({
        // Missing required fields
        moodTags: 'not-an-array', // Should be array
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it('rejects non-object context and invalid policy payloads', async () => {
    const contextResponse = await request(app)
      .post('/v1/journal')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .send({
        content: 'Context should be an object',
        context: ['not', 'an', 'object'],
      });

    expect(contextResponse.status).toBe(400);
    expect(contextResponse.body.error).toContain('context must be an object');

    const policyResponse = await request(app)
      .post('/v1/journal')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .send({
        content: 'Policy should match SessionPolicy',
        policy: { mode: 'focus' },
      });

    expect(policyResponse.status).toBe(400);
    expect(policyResponse.body.error).toContain('policy');
  });

  it('rejects oversize serialized journal metadata instead of truncating JSON', async () => {
    const response = await request(app)
      .post('/v1/journal')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .send({
        content: 'Large metadata should fail cleanly',
        context: { notes: 'x'.repeat(2500) },
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('context exceeds 2000 bytes');
  });

  it('redacts unexpected journal read failures in production', async () => {
    await withProductionDaemon(async (daemon, app) => {
      vi.spyOn((daemon as any).store, 'getJournalEntries').mockRejectedValue(new Error('sqlite exploded'));

      const response = await request(app)
        .get('/v1/journal')
        .set('Authorization', `Bearer ${TEST_API_TOKEN}`);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Internal server error');
    });
  });

  it('redacts unexpected stats failures in production', async () => {
    await withProductionDaemon(async (daemon, app) => {
      vi.spyOn((daemon as any).store, 'getStats').mockRejectedValue(new Error('stats exploded'));

      const response = await request(app)
        .get('/v1/stats')
        .set('Authorization', `Bearer ${TEST_API_TOKEN}`);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Internal server error');
    });
  });
});

// ============================================================================
// Spotify Endpoints Tests
// ============================================================================

describe('Spotify Endpoints', () => {
  let daemon: Harmond;
  let app: any;

  beforeAll(async () => {
    daemon = createTestDaemon({ apiToken: TEST_API_TOKEN });
    await daemon.start();
    app = (daemon as any).app;
  });

  afterAll(async () => {
    await daemon.stop();
  });

  it('POST /v1/auth/spotify/login rejects requests when Spotify auth is not configured', async () => {
    const response = await request(app)
      .post('/v1/auth/spotify/login')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`);

    expect(response.status).toBe(503);
    expect(response.body.error).toContain('Spotify configuration missing');
  });

  it('GET /v1/devices requires authentication', async () => {
    const response = await request(app).get('/v1/devices');

    expect(response.status).toBe(401);
  });

  it('POST /v1/device/use validates deviceId', async () => {
    const response = await request(app)
      .post('/v1/device/use')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .send({
        deviceId: '', // Empty deviceId should fail
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Invalid deviceId');
  });

  it('GET /v1/spotify/search validates query parameter', async () => {
    const response = await request(app)
      .get('/v1/spotify/search')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .query({ q: '' }); // Empty query

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Missing query');
  });

  it('GET /v1/spotify/search rejects unsupported search types', async () => {
    const response = await request(app)
      .get('/v1/spotify/search')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .query({ q: 'focus', type: 'audiobook' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Search type must be one of');
  });

  it('GET /v1/spotify/search forwards show and episode types', async () => {
    const searchSpy = vi.spyOn((daemon as any).spotifyClient, 'search').mockResolvedValue({
      tracks: [],
      albums: [],
      artists: [],
      playlists: [],
      episodes: [{ id: 'ep1', name: 'Episode 1', uri: 'spotify:episode:ep1', showName: 'Show 1' }],
      shows: [{ id: 'show1', name: 'Show 1', uri: 'spotify:show:show1', publisher: 'Publisher 1' }],
    });

    const response = await request(app)
      .get('/v1/spotify/search')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .query({ q: 'podcast', type: 'episode,show' });

    expect(response.status).toBe(200);
    expect(searchSpy).toHaveBeenCalledWith('podcast', ['episode', 'show'], { limit: undefined, offset: undefined });
    expect(response.body.episodes).toHaveLength(1);
    expect(response.body.shows).toHaveLength(1);
  });

  it('POST /v1/spotify/volume validates range', async () => {
    const response = await request(app)
      .post('/v1/spotify/volume')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .send({ volumePercent: 150 }); // Out of range

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Invalid volumePercent');
  });

  it('POST /v1/spotify/seek validates position', async () => {
    const response = await request(app)
      .post('/v1/spotify/seek')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .send({ positionMs: -100 }); // Negative position

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Invalid positionMs');
  });

  it('POST /v1/spotify/repeat validates state', async () => {
    const response = await request(app)
      .post('/v1/spotify/repeat')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .send({ state: 'invalid' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Invalid state');
  });

  it('GET /v1/spotify/recommendations falls back to personal listening history when no explicit seed is provided', async () => {
    stubConnectedSpotify(daemon);
    const provider = (daemon as any).spotifyRuntime.provider;
    const getTopTracks = vi.spyOn(provider, 'getTopTracks').mockResolvedValue([
      { ...mockProviderTracks[0] },
    ]);
    vi.spyOn(provider, 'getRecentlyPlayed').mockResolvedValue([]);
    vi.spyOn(provider, 'getLibraryTracks').mockResolvedValue([]);
    const getRecommendations = vi.spyOn(provider, 'getRecommendations').mockResolvedValue([
      { ...mockProviderTracks[1] },
    ]);

    const response = await request(app)
      .get('/v1/spotify/recommendations')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .query({ limit: 3 });

    expect(response.status).toBe(200);
    expect(getTopTracks).toHaveBeenCalledWith({ limit: 1 });
    expect(getRecommendations).toHaveBeenCalledWith({
      seedTrackIds: ['track-1'],
      limit: 3,
    });
    expect(response.body).toHaveLength(1);
  });
});

// ============================================================================
// Apple Endpoints Tests
// ============================================================================

describe('Apple Endpoints', () => {
  let daemon: Harmond;
  let app: any;

  beforeEach(async () => {
    daemon = createTestDaemon({ apiToken: TEST_API_TOKEN });
    await daemon.start();
    app = (daemon as any).app;
  });

  afterEach(async () => {
    await daemon.stop().catch(() => undefined);
    vi.restoreAllMocks();
  });

  it('GET /v1/apple/search forwards catalog results from the configured Apple client', async () => {
    const search = vi.fn().mockResolvedValue({
      songs: [{ id: 'song-1', name: 'Song One', artistName: 'Artist One' }],
      albums: [],
      artists: [],
      playlists: [],
    });
    (daemon as any).appleMusicClient = {
      search,
    };
    (daemon as any).appleCatalogEnabled = true;

    const response = await request(app)
      .get('/v1/apple/search')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .query({ q: 'focus', type: 'songs', offset: 10 });

    expect(response.status).toBe(200);
    expect(response.body.songs).toHaveLength(1);
    expect(search).toHaveBeenCalledWith('focus', ['songs'], expect.objectContaining({ offset: 10 }));
  });

  it('GET /v1/apple/library/songs returns 503 when the Apple user token surface is unavailable', async () => {
    (daemon as any).appleMusicClient = {
      getLibrarySongs: vi.fn().mockRejectedValue(new Error('Apple Music user token required for library endpoints')),
    };
    (daemon as any).appleCatalogEnabled = true;
    (daemon as any).appleLibraryEnabled = false;

    const response = await request(app)
      .get('/v1/apple/library/songs')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`);

    expect(response.status).toBe(503);
    expect(response.body.code).toBe('PROVIDER_UNAVAILABLE');
  });

  it('GET /v1/apple/playlists/:id/tracks forwards playlist tracks from the configured Apple client', async () => {
    const getPlaylistTracks = vi.fn().mockResolvedValue([
      { id: 'apple-track-1', name: 'Apple Track', artistName: 'Apple Artist' },
    ]);
    (daemon as any).appleMusicClient = {
      getPlaylistTracks,
    };
    (daemon as any).appleCatalogEnabled = true;

    const response = await request(app)
      .get('/v1/apple/playlists/pl.apple.test/tracks')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .query({ limit: 20 });

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(getPlaylistTracks).toHaveBeenCalledWith('pl.apple.test', { limit: 20 });
  });

  it('GET /v1/apple/history forwards recent tracks from the configured Apple provider surface', async () => {
    const getRecentlyPlayed = vi.fn().mockResolvedValue([
      { id: 'apple-track-1', name: 'Recent Apple Track', artistName: 'Apple Artist' },
    ]);
    (daemon as any).appleRuntime = {
      provider: {
        getRecentlyPlayed,
      },
    };
    (daemon as any).appleCatalogEnabled = true;
    (daemon as any).appleLibraryEnabled = true;

    const response = await request(app)
      .get('/v1/apple/history')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .query({ limit: 10 });

    expect(response.status).toBe(200);
    expect(getRecentlyPlayed).toHaveBeenCalledWith({ limit: 10 });
    expect(response.body).toHaveLength(1);
  });

  it('rejects Apple topTracks sessions because Apple Music does not support top tracks', async () => {
    (daemon as any).appleCatalogEnabled = true;
    (daemon as any).appleLibraryEnabled = false;
    (daemon as any).appleMusicClient = {};
    (daemon as any).appleRuntime = {
      name: 'apple',
      provider: {},
      playback: {
        play: vi.fn().mockResolvedValue(undefined),
        resetSessionState: vi.fn().mockResolvedValue(undefined),
      },
      playbackMode: 'applescript',
      autoStartSession: true,
    };
    (daemon as any).engines.set('apple', {
      getState: vi.fn().mockReturnValue(null),
      start: vi.fn(),
      stop: vi.fn(),
    });

    const response = await request(app)
      .post('/v1/command')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .send({
        id: 'c_apple_top_tracks',
        ts: Date.now(),
        source: { kind: 'cli', device: 'linux' },
        type: 'session.start',
        payload: {
          policy: {
            version: 1,
            provider: 'apple',
            mode: 'focus',
            sources: { topTracks: true },
          },
        },
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('does not support top tracks');
  });

  it('GET /v1/apple/recommendations supports catalog-only seeded recommendations without a playback runtime', async () => {
    const getSong = vi.fn().mockResolvedValue({
      id: 'song-1',
      name: 'Seed Song',
      artistName: 'Seed Artist',
      albumName: 'Seed Album',
      url: 'https://music.apple.com/us/song/song-1',
    });
    const search = vi.fn().mockResolvedValue({
      songs: [{
        id: 'apple-track-1',
        name: 'Recommended Apple Track',
        artistName: 'Apple Artist',
        albumName: 'Apple Album',
        url: 'https://music.apple.com/us/song/apple-track-1',
      }],
      albums: [],
      artists: [],
      playlists: [],
    });
    (daemon as any).appleCatalogEnabled = true;
    (daemon as any).appleLibraryEnabled = false;
    (daemon as any).appleRuntime = undefined;
    (daemon as any).appleMusicClient = {
      getSong,
      getRecentlyPlayedTracks: vi.fn(),
      search,
    };

    const response = await request(app)
      .get('/v1/apple/recommendations')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .query({ limit: 5, seed: 'song-1' });

    expect(response.status).toBe(200);
    expect(getSong).toHaveBeenCalledWith('song-1');
    expect(search).toHaveBeenCalled();
    expect(response.body).toHaveLength(1);
  });
});

describe('Apple Remote Endpoints', () => {
  let daemon: Harmond;
  let app: any;
  const previousDeveloperToken = process.env.APPLE_MUSIC_DEVELOPER_TOKEN;
  const previousRemoteToken = process.env.APPLE_MUSIC_REMOTE_TOKEN;
  const remoteToken = 'apple-remote-token';

  beforeEach(async () => {
    delete process.env.APPLE_MUSIC_DEVELOPER_TOKEN;
    process.env.APPLE_MUSIC_REMOTE_TOKEN = remoteToken;
    daemon = createTestDaemon({ apiToken: TEST_API_TOKEN });
    await daemon.start();
    app = (daemon as any).app;
  });

  afterEach(async () => {
    await daemon.stop().catch(() => undefined);
    if (previousDeveloperToken === undefined) {
      delete process.env.APPLE_MUSIC_DEVELOPER_TOKEN;
    } else {
      process.env.APPLE_MUSIC_DEVELOPER_TOKEN = previousDeveloperToken;
    }
    if (previousRemoteToken === undefined) {
      delete process.env.APPLE_MUSIC_REMOTE_TOKEN;
    } else {
      process.env.APPLE_MUSIC_REMOTE_TOKEN = previousRemoteToken;
    }
    vi.restoreAllMocks();
  });

  it('GET /v1/status reports Apple remote playback only after a companion connects', async () => {
    const beforeConnect = await request(app)
      .get('/v1/status')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`);

    expect(beforeConnect.status).toBe(200);
    expect(beforeConnect.body.providers.apple).toMatchObject({
      playbackMode: 'remote',
      status: 'configured',
      capabilities: expect.objectContaining({
        companion: false,
        playback: false,
        sessionControl: false,
      }),
    });

    const connectResponse = await request(app)
      .post('/v1/apple/remote/connect')
      .set('Authorization', `Bearer ${remoteToken}`)
      .send({ deviceId: 'iphone-1', name: 'Srinu iPhone', platform: 'ios' });

    expect(connectResponse.status).toBe(200);

    const afterConnect = await request(app)
      .get('/v1/status')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`);

    expect(afterConnect.status).toBe(200);
    expect(afterConnect.body.providers.apple).toMatchObject({
      playbackMode: 'remote',
      status: 'ready',
      capabilities: expect.objectContaining({
        companion: true,
        playback: true,
      }),
    });
  });

  it('queues Apple remote playback commands for the iOS companion and reports verified now-playing state', async () => {
    const connectResponse = await request(app)
      .post('/v1/apple/remote/connect')
      .set('Authorization', `Bearer ${remoteToken}`)
      .send({ deviceId: 'iphone-1', name: 'Srinu iPhone', platform: 'ios' });

    expect(connectResponse.status).toBe(200);

    const playResponse = await request(app)
      .post('/v1/apple/play')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .send({ url: 'https://music.apple.com/us/song/apple-track-1' });

    expect(playResponse.status).toBe(200);

    const commandsResponse = await request(app)
      .get('/v1/apple/remote/commands')
      .set('Authorization', `Bearer ${remoteToken}`)
      .query({ deviceId: 'iphone-1' });

    expect(commandsResponse.status).toBe(200);
    expect(commandsResponse.body.commands).toEqual([
      expect.objectContaining({
        type: 'play',
        uri: 'https://music.apple.com/us/song/apple-track-1',
      }),
    ]);

    const [command] = commandsResponse.body.commands;
    const stateResponse = await request(app)
      .post('/v1/apple/remote/state')
      .set('Authorization', `Bearer ${remoteToken}`)
      .send({
        ackCommandId: command.id,
        currentTrack: {
          album: '',
          artist: 'Apple Music',
          durationMs: 0,
          id: 'apple-track-1',
          name: 'apple-track-1',
          provider: 'apple',
          uri: 'https://music.apple.com/us/song/apple-track-1',
        },
        deviceId: 'iphone-1',
        playbackState: 'playing',
      });

    expect(stateResponse.status).toBe(200);

    const nowPlayingResponse = await request(app)
      .get('/v1/apple/now-playing')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`);

    expect(nowPlayingResponse.status).toBe(200);
    expect(nowPlayingResponse.body).toMatchObject({
      id: 'apple-track-1',
      playbackTruth: 'verified',
      provider: 'apple',
    });
  });

  it('accepts the main daemon API token on Apple remote endpoints alongside the remote token', async () => {
    const response = await request(app)
      .post('/v1/apple/remote/connect')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .send({ deviceId: 'iphone-1', name: 'Srinu iPhone', platform: 'ios' });

    expect(response.status).toBe(200);
  });

  it('rejects unrelated tokens on Apple remote endpoints', async () => {
    const response = await request(app)
      .post('/v1/apple/remote/connect')
      .set('Authorization', 'Bearer not-a-valid-token')
      .send({ deviceId: 'iphone-1', name: 'Srinu iPhone', platform: 'ios' });

    expect(response.status).toBe(401);
  });

  it('rejects non-Apple provider payloads on Apple remote state updates', async () => {
    const connectResponse = await request(app)
      .post('/v1/apple/remote/connect')
      .set('Authorization', `Bearer ${remoteToken}`)
      .send({ deviceId: 'iphone-1', name: 'Srinu iPhone', platform: 'ios' });

    expect(connectResponse.status).toBe(200);

    const stateResponse = await request(app)
      .post('/v1/apple/remote/state')
      .set('Authorization', `Bearer ${remoteToken}`)
      .send({
        currentTrack: {
          album: '',
          artist: 'Spotify Artist',
          durationMs: 0,
          id: 'spotify-track-1',
          name: 'Spotify Track',
          provider: 'spotify',
        },
        deviceId: 'iphone-1',
        playbackState: 'playing',
      });

    expect(stateResponse.status).toBe(400);
    expect(stateResponse.body.error).toContain('provider apple');
  });
});

// ============================================================================
// YouTube Endpoints Tests
// ============================================================================

describe('YouTube Endpoints', () => {
  let daemon: Harmond;
  let app: any;
  const previousApiKey = process.env.YOUTUBE_MUSIC_API_KEY;

  beforeEach(async () => {
    process.env.YOUTUBE_MUSIC_API_KEY = 'yt-test-key';
    daemon = createTestDaemon({ apiToken: TEST_API_TOKEN });
    await daemon.start();
    app = (daemon as any).app;
  });

  afterEach(async () => {
    await daemon.stop().catch(() => undefined);
    if (previousApiKey === undefined) {
      delete process.env.YOUTUBE_MUSIC_API_KEY;
    } else {
      process.env.YOUTUBE_MUSIC_API_KEY = previousApiKey;
    }
    vi.restoreAllMocks();
  });

  it('GET /v1/status reports the configured YouTube runtime', async () => {
    const response = await request(app)
      .get('/v1/status')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`);

    const youtubeRuntime = (daemon as any).youtubeRuntime;
    expect(response.status).toBe(200);
    expect(response.body.providers.youtube).toMatchObject({
      auth: 'api-key',
      connected: true,
      playbackMode: youtubeRuntime ? 'browser-handoff' : undefined,
      status: youtubeRuntime ? 'ready' : 'configured',
      capabilities: expect.objectContaining({
        playback: Boolean(youtubeRuntime),
        recentPlays: true,
        search: true,
        sessionControl: Boolean(youtubeRuntime),
        topTracks: true,
      }),
    });
  });

  it('GET /v1/status keeps YouTube read surfaces available when browser handoff is unavailable', async () => {
    (daemon as any).youtubeRuntime = undefined;
    (daemon as any).youtubeBrowserSupport = {
      available: false,
      reason: 'Browser handoff requires xdg-open on PATH.',
    };

    const response = await request(app)
      .get('/v1/status')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`);

    expect(response.status).toBe(200);
    expect(response.body.providers.youtube).toMatchObject({
      connected: true,
      status: 'configured',
      capabilities: expect.objectContaining({
        playback: false,
        queue: false,
        recentPlays: true,
        search: true,
        sessionControl: false,
        topTracks: true,
      }),
    });
    expect(response.body.providers.youtube.playbackMode).toBeUndefined();
  });

  it('GET /v1/youtube/now-playing returns daemon-managed playback truth for browser handoff', async () => {
    const youtubeRuntime = (daemon as any).youtubeRuntime;
    (youtubeRuntime.playback as any).currentTrack = {
      id: 'yt-track-1',
      name: 'Focus Stream',
      artist: 'Focus Channel',
      album: '',
      durationMs: 0,
      provider: 'youtube',
      uri: 'https://music.youtube.com/watch?v=yt-track-1',
    };

    const response = await request(app)
      .get('/v1/youtube/now-playing')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: 'yt-track-1',
      playbackTruth: 'daemon-managed',
    });
  });

  it('GET /v1/youtube/search forwards the configured YouTube client', async () => {
    (daemon as any).youtubeMusicClient = {
      search: vi.fn().mockResolvedValue({
        songs: [{ id: 'yt-song-1', name: 'Focus Song', artistName: 'Focus Artist' }],
        albums: [],
        artists: [],
        playlists: [],
      }),
      getSong: vi.fn(),
    };

    const response = await request(app)
      .get('/v1/youtube/search')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .query({ q: 'focus', type: 'songs' });

    expect(response.status).toBe(200);
    expect(response.body.songs).toHaveLength(1);
  });

  it('GET /v1/youtube/playlists/:id/tracks forwards playlist tracks from the configured YouTube client', async () => {
    const getPlaylistTracks = vi.fn().mockResolvedValue([
      { id: 'yt-song-1', name: 'Playlist Song', artistName: 'Playlist Artist' },
    ]);
    (daemon as any).youtubeMusicClient = {
      getPlaylistTracks,
      getSong: vi.fn(),
      search: vi.fn(),
    };

    const response = await request(app)
      .get('/v1/youtube/playlists/PL123/tracks')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .query({ limit: 15 });

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(getPlaylistTracks).toHaveBeenCalledWith('PL123', { limit: 15 });
  });

  it('GET /v1/youtube/playlists forwards the configured YouTube client', async () => {
    const getPlaylists = vi.fn().mockResolvedValue([
      { id: 'playlist-1', name: 'Focus Playlist', author: 'Owner' },
    ]);
    (daemon as any).youtubeMusicClient = {
      getPlaylists,
      getPlaylistTracks: vi.fn(),
      getSong: vi.fn(),
      search: vi.fn(),
    };

    const response = await request(app)
      .get('/v1/youtube/playlists')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .query({ limit: 12 });

    expect(response.status).toBe(200);
    expect(getPlaylists).toHaveBeenCalledWith({ limit: 12 });
    expect(response.body).toHaveLength(1);
  });

  it('GET /v1/youtube/library/tracks forwards the configured YouTube client', async () => {
    const getLibrarySongs = vi.fn().mockResolvedValue([
      { id: 'yt-song-1', name: 'Liked Song', artistName: 'Liked Artist' },
    ]);
    (daemon as any).youtubeMusicClient = {
      getLibrarySongs,
      getPlaylists: vi.fn(),
      getPlaylistTracks: vi.fn(),
      getSong: vi.fn(),
      search: vi.fn(),
    };

    const response = await request(app)
      .get('/v1/youtube/library/tracks')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .query({ limit: 8 });

    expect(response.status).toBe(200);
    expect(getLibrarySongs).toHaveBeenCalledWith({ limit: 8 });
    expect(response.body).toHaveLength(1);
  });

  it('GET /v1/youtube/recommendations uses the YouTube runtime provider surface', async () => {
    const getRecommendations = vi.fn().mockResolvedValue([
      {
        id: 'yt-track-1',
        name: 'Recommended Track',
        artist: 'Recommendation Engine',
        album: '',
        durationMs: 0,
        provider: 'youtube',
      },
    ]);
    (daemon as any).youtubeRuntime = {
      provider: { getRecommendations },
    };

    const response = await request(app)
      .get('/v1/youtube/recommendations')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .query({ limit: 6, seed: 'video-1' });

    expect(response.status).toBe(200);
    expect(getRecommendations).toHaveBeenCalledWith({
      seedTrackIds: ['video-1'],
      limit: 6,
    });
    expect(response.body).toHaveLength(1);
  });

  it('GET /v1/youtube/recommendations still works without a YouTube playback runtime', async () => {
    const getRecommendations = vi.fn().mockResolvedValue([
      {
        id: 'yt-track-read-only',
        name: 'Read Only Recommendation',
        artist: 'Recommendation Engine',
        album: '',
        durationMs: 0,
        provider: 'youtube',
      },
    ]);
    (daemon as any).youtubeRuntime = undefined;
    (daemon as any).youtubeMusicClient = {
      getRecommendations,
      getWatchPlaylist: vi.fn().mockResolvedValue([]),
      isConnected: vi.fn().mockReturnValue(true),
    };

    const response = await request(app)
      .get('/v1/youtube/recommendations')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .query({ limit: 4 });

    expect(response.status).toBe(200);
    expect(getRecommendations).toHaveBeenCalledWith({ limit: 4 });
    expect(response.body).toHaveLength(1);
  });

  it('starts a YouTube-backed session and records the active provider', async () => {
    const youtubeRuntime = (daemon as any).youtubeRuntime;
    vi.spyOn((daemon as any).youtubeMusicClient, 'search').mockResolvedValue({
      songs: [{ id: 'yt-song-1', name: 'Focus Song', artistName: 'Focus Artist' }],
      albums: [],
      artists: [],
      playlists: [],
    });
    vi.spyOn(youtubeRuntime.provider, 'search').mockResolvedValue([
      {
        id: 'yt-track-1',
        name: 'Focus Stream',
        artist: 'Calm Channel',
        album: '',
        durationMs: 0,
        uri: 'youtube:video:yt-track-1',
        provider: 'youtube',
      },
    ]);
    vi.spyOn(youtubeRuntime.playback, 'play').mockResolvedValue(undefined);

    const commandResponse = await request(app)
      .post('/v1/command')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .send({
        id: 'c_youtube_start',
        ts: Date.now(),
        source: { kind: 'cli', device: 'linux' },
        type: 'session.start',
        payload: {
          policy: {
            version: 1,
            provider: 'youtube',
            mode: 'focus',
            sources: { searchQueries: ['focus music'] },
          },
        },
      });

    expect(commandResponse.status).toBe(200);
    expect(youtubeRuntime.playback.play).toHaveBeenCalledTimes(1);

    const statusResponse = await request(app)
      .get('/v1/status')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`);

    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body.session).toMatchObject({
      isActive: true,
      provider: 'youtube',
    });
  });

  it('rejects feature-dependent YouTube policies up front', async () => {
    const response = await request(app)
      .post('/v1/command')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .send({
        id: 'c_youtube_invalid_policy',
        ts: Date.now(),
        source: { kind: 'cli', device: 'linux' },
        type: 'session.start',
        payload: {
          policy: {
            version: 1,
            provider: 'youtube',
            mode: 'focus',
            hard: { noVocals: true },
            sources: { searchQueries: ['focus music'] },
          },
        },
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('do not support audio-feature constraints');
  });

  it('rejects YouTube topTracks sessions because YouTube Music does not support top tracks', async () => {
    (daemon as any).youtubeAccessToken = undefined;
    (daemon as any).youtubeMusicClient = {};

    const response = await request(app)
      .post('/v1/command')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .send({
        id: 'c_youtube_top_tracks',
        ts: Date.now(),
        source: { kind: 'cli', device: 'linux' },
        type: 'session.start',
        payload: {
          policy: {
            version: 1,
            provider: 'youtube',
            mode: 'focus',
            sources: { topTracks: true },
          },
        },
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('does not support top tracks');
  });

  it('starts a YouTube-backed session from playlist seeds', async () => {
    const youtubeRuntime = (daemon as any).youtubeRuntime;
    vi.spyOn((daemon as any).youtubeMusicClient, 'getPlaylistTracks').mockResolvedValue([
      {
        id: 'yt-playlist-song-1',
        name: 'Playlist Song',
        artistName: 'Playlist Artist',
      },
    ]);
    vi.spyOn(youtubeRuntime.provider, 'getPlaylistTracks').mockResolvedValue([
      {
        id: 'yt-track-playlist-1',
        name: 'Playlist Stream',
        artist: 'Playlist Channel',
        album: '',
        durationMs: 0,
        uri: 'youtube:video:yt-track-playlist-1',
        provider: 'youtube',
      },
    ]);
    vi.spyOn(youtubeRuntime.playback, 'play').mockResolvedValue(undefined);

    const response = await request(app)
      .post('/v1/command')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .send({
        id: 'c_youtube_playlist_start',
        ts: Date.now(),
        source: { kind: 'cli', device: 'linux' },
        type: 'session.start',
        payload: {
          policy: {
            version: 1,
            provider: 'youtube',
            mode: 'focus',
            sources: { seedPlaylists: ['https://music.youtube.com/playlist?list=PL123'] },
          },
        },
      });

    expect(response.status).toBe(200);
    expect(youtubeRuntime.provider.getPlaylistTracks).toHaveBeenCalledWith('PL123', { limit: 36 });
  });

  it('rolls back a YouTube session when browser handoff startup fails', async () => {
    const youtubeRuntime = (daemon as any).youtubeRuntime;
    vi.spyOn((daemon as any).youtubeMusicClient, 'search').mockResolvedValue({
      songs: [{ id: 'yt-song-rollback', name: 'Rollback Song', artistName: 'Focus Artist' }],
      albums: [],
      artists: [],
      playlists: [],
    });
    vi.spyOn(youtubeRuntime.provider, 'search').mockResolvedValue([
      {
        id: 'yt-track-rollback',
        name: 'Rollback Stream',
        artist: 'Focus Channel',
        album: '',
        durationMs: 0,
        uri: 'youtube:video:yt-track-rollback',
        provider: 'youtube',
      },
    ]);
    vi.spyOn(youtubeRuntime.playback, 'play').mockRejectedValue(new Error('xdg-open failed'));

    const commandResponse = await request(app)
      .post('/v1/command')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .send({
        id: 'c_youtube_rollback',
        ts: Date.now(),
        source: { kind: 'cli', device: 'linux' },
        type: 'session.start',
        payload: {
          policy: {
            version: 1,
            provider: 'youtube',
            mode: 'focus',
            sources: { searchQueries: ['focus music'] },
          },
        },
      });

    expect(commandResponse.status).toBe(500);

    const statusResponse = await request(app)
      .get('/v1/status')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`);

    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body.session).toBeUndefined();
  });

  it('surfaces rollback failures when session autoplay teardown cannot persist cleanly', async () => {
    const youtubeRuntime = (daemon as any).youtubeRuntime;
    vi.spyOn((daemon as any).youtubeMusicClient, 'search').mockResolvedValue({
      songs: [{ id: 'yt-song-rollback-stop', name: 'Rollback Song', artistName: 'Focus Artist' }],
      albums: [],
      artists: [],
      playlists: [],
    });
    vi.spyOn(youtubeRuntime.provider, 'search').mockResolvedValue([
      {
        id: 'yt-track-rollback-stop',
        name: 'Rollback Stream',
        artist: 'Focus Channel',
        album: '',
        durationMs: 0,
        uri: 'youtube:video:yt-track-rollback-stop',
        provider: 'youtube',
      },
    ]);
    vi.spyOn(youtubeRuntime.playback, 'play').mockRejectedValue(new Error('xdg-open failed'));
    vi
      .spyOn((daemon as any).store, 'endSession')
      .mockRejectedValueOnce(new Error('session persistence failed'));

    const commandResponse = await request(app)
      .post('/v1/command')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .send({
        id: 'c_youtube_rollback_stop_failure',
        ts: Date.now(),
        source: { kind: 'cli', device: 'linux' },
        type: 'session.start',
        payload: {
          policy: {
            version: 1,
            provider: 'youtube',
            mode: 'focus',
            sources: { searchQueries: ['focus music'] },
          },
        },
      });

    expect(commandResponse.status).toBe(500);
    expect(commandResponse.body.error).toContain('session persistence failed');

    const statusResponse = await request(app)
      .get('/v1/status')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`);

    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body.session).toBeUndefined();
  });

  it('clears YouTube runtime queue state before a nudge refill', async () => {
    const youtubeRuntime = (daemon as any).youtubeRuntime;
    vi.spyOn((daemon as any).youtubeMusicClient, 'search').mockResolvedValue({
      songs: [{ id: 'yt-song-reset', name: 'Reset Song', artistName: 'Focus Artist' }],
      albums: [],
      artists: [],
      playlists: [],
    });
    vi.spyOn(youtubeRuntime.provider, 'search').mockResolvedValue([
      {
        id: 'yt-track-reset',
        name: 'Reset Stream',
        artist: 'Focus Channel',
        album: '',
        durationMs: 0,
        uri: 'youtube:video:yt-track-reset',
        provider: 'youtube',
      },
    ]);
    vi.spyOn(youtubeRuntime.playback, 'play').mockResolvedValue(undefined);
    const resetSpy = vi.spyOn(youtubeRuntime.playback, 'resetSessionState');

    const startResponse = await request(app)
      .post('/v1/command')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .send({
        id: 'c_youtube_reset',
        ts: Date.now(),
        source: { kind: 'cli', device: 'linux' },
        type: 'session.start',
        payload: {
          policy: {
            version: 1,
            provider: 'youtube',
            mode: 'focus',
            sources: { searchQueries: ['focus music'] },
          },
        },
      });

    expect(startResponse.status).toBe(200);

    const nudgeResponse = await request(app)
      .post('/v1/command')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .send({
        id: 'c_youtube_nudge',
        ts: Date.now(),
        source: { kind: 'cli', device: 'linux' },
        type: 'session.nudge',
        payload: { direction: 'calmer', amount: 0.1 },
      });

    expect(nudgeResponse.status).toBe(200);
    expect(resetSpy).toHaveBeenCalledWith({
      preserveCurrentTrack: true,
      preserveHistory: true,
    });
  });

  it('restores the previous YouTube queue when nudge refill fails', async () => {
    const youtubeRuntime = (daemon as any).youtubeRuntime;
    const searchSpy = vi.spyOn(youtubeRuntime.provider, 'search').mockResolvedValue([
      {
        id: 'yt-track-rollback-nudge',
        name: 'Rollback Nudge Track',
        artist: 'Focus Channel',
        album: '',
        durationMs: 0,
        uri: 'youtube:video:yt-track-rollback-nudge',
        provider: 'youtube',
      },
    ]);
    vi.spyOn(youtubeRuntime.playback, 'play').mockResolvedValue(undefined);

    const startResponse = await request(app)
      .post('/v1/command')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .send({
        id: 'c_youtube_nudge_rollback_start',
        ts: Date.now(),
        source: { kind: 'cli', device: 'linux' },
        type: 'session.start',
        payload: {
          policy: {
            version: 1,
            provider: 'youtube',
            mode: 'focus',
            sources: { searchQueries: ['focus music'] },
          },
        },
      });

    expect(startResponse.status).toBe(200);

    searchSpy
      .mockResolvedValueOnce([
        {
          id: 'yt-track-rollback-nudge',
          name: 'Rollback Nudge Track',
          artist: 'Focus Channel',
          album: '',
          durationMs: 0,
          uri: 'youtube:video:yt-track-rollback-nudge',
          provider: 'youtube',
        },
      ])
      .mockRejectedValueOnce(new Error('provider unavailable'));
    const addToQueueSpy = vi.spyOn(youtubeRuntime.playback, 'addToQueue');

    const nudgeResponse = await request(app)
      .post('/v1/command')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .send({
        id: 'c_youtube_nudge_rollback',
        ts: Date.now(),
        source: { kind: 'cli', device: 'linux' },
        type: 'session.nudge',
        payload: { direction: 'calmer', amount: 0.1 },
      });

    expect(nudgeResponse.status).toBe(500);
    expect(addToQueueSpy).toHaveBeenCalledWith(
      'youtube:video:yt-track-rollback-nudge',
      expect.objectContaining({ id: 'yt-track-rollback-nudge' }),
    );
  });
});

// ============================================================================
// Shutdown Tests
// ============================================================================

describe('Shutdown', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('surfaces engine stop failures instead of swallowing them', async () => {
    const daemon = createTestDaemon();
    await daemon.start();

    vi
      .spyOn((daemon as any).engines.get('spotify'), 'stop')
      .mockRejectedValue(new Error('session persistence failed'));

    await expect(daemon.stop()).rejects.toThrow('session persistence failed');
  });

  it('destroys lingering sockets when server close misses the shutdown deadline', async () => {
    vi.useFakeTimers();

    const daemon = createTestDaemon();
    await daemon.start();

    let closeCallback: (() => void) | undefined;
    const destroy = vi.fn(() => {
      closeCallback?.();
    });
    (daemon as any).openSockets.add({ destroy });
    (daemon as any).server.close = vi.fn((callback) => {
      closeCallback = callback;
    });

    const stopPromise = daemon.stop();
    await vi.advanceTimersByTimeAsync(5000);
    await stopPromise;

    expect(destroy).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// SSE (Server-Sent Events) Tests
// ============================================================================

describe('SSE Events', () => {
  let daemon: Harmond;
  let app: any;

  beforeAll(async () => {
    daemon = createTestDaemon({ apiToken: TEST_API_TOKEN });
    await daemon.start();
    app = (daemon as any).app;
  });

  afterAll(async () => {
    await daemon.stop();
  });

  it('GET /v1/events establishes SSE connection', async () => {
    const baseUrl = getDaemonBaseUrl(daemon);

    await new Promise<void>((resolve, reject) => {
      const req = httpRequest(
        `${baseUrl}/v1/events`,
        {
          headers: {
            Accept: 'text/event-stream',
            Authorization: `Bearer ${TEST_API_TOKEN}`,
          },
        },
        (res) => {
          try {
            expect(res.statusCode).toBe(200);
            expect(res.headers['content-type']).toContain('text/event-stream');
            expect(res.headers['cache-control']).toBe('no-cache');
            res.destroy();
            resolve();
          } catch (error) {
            reject(error);
          }
        }
      );

      req.on('error', reject);
      req.end();
    });
  });

  it('sends initial connected event', async () => {
    const baseUrl = getDaemonBaseUrl(daemon);

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(error);
      };

      const req = httpRequest(
        `${baseUrl}/v1/events`,
        {
          headers: {
            Accept: 'text/event-stream',
            Authorization: `Bearer ${TEST_API_TOKEN}`,
          },
        },
        (res) => {
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            if (!chunk.includes('"type":"connected"')) {
              return;
            }
            try {
              expect(chunk).toContain('data:');
              res.destroy();
              finish();
            } catch (error) {
              fail(error);
            }
          });
          res.on('error', (error) => {
            if ((error as NodeJS.ErrnoException).code !== 'ECONNRESET') {
              fail(error);
            }
          });
        }
      );

      req.on('error', fail);
      req.end();
    });
  }, 10000);

  it('GET /v1/events returns 404 when SSE is disabled', async () => {
    const disabledDaemon = createTestDaemon({
      apiToken: TEST_API_TOKEN,
      enableSSE: false,
    });
    await disabledDaemon.start();
    const disabledApp = (disabledDaemon as any).app;

    const response = await request(disabledApp)
      .get('/v1/events')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`);

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      success: false,
      code: 'SSE_DISABLED',
    });

    await disabledDaemon.stop();
  });

  it('emits session.stopped payloads with elapsedMs and legacy duration compatibility', async () => {
    const baseUrl = getDaemonBaseUrl(daemon);
    const expectedPayload = {
      sessionId: 'sess_test',
      elapsedMs: 42,
      duration: 42,
      durationMs: 42,
    };

    await new Promise<void>((resolve, reject) => {
      let settled = false;

      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(error);
      };

      const req = httpRequest(
        `${baseUrl}/v1/events`,
        {
          headers: {
            Accept: 'text/event-stream',
            Authorization: `Bearer ${TEST_API_TOKEN}`,
          },
        },
        (res) => {
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            for (const line of chunk.split('\n')) {
              if (!line.startsWith('data: ')) {
                continue;
              }

              try {
                const event = JSON.parse(line.slice(6));
                if (event.type === 'connected') {
                  (daemon as any).handleEngineEvent({
                    type: 'session.stopped',
                    payload: expectedPayload,
                  });
                  continue;
                }

                if (event.type === 'session.stopped') {
                  expect(event.payload).toMatchObject(expectedPayload);
                  res.destroy();
                  finish();
                }
              } catch (error) {
                fail(error);
              }
            }
          });
          res.on('error', (error) => {
            if ((error as NodeJS.ErrnoException).code !== 'ECONNRESET') {
              fail(error);
            }
          });
        }
      );

      req.on('error', fail);
      req.end();
    });
  }, 10000);
});

// ============================================================================
// Stats Endpoint Tests
// ============================================================================

describe('Stats Endpoint', () => {
  let daemon: Harmond;
  let app: any;

  beforeAll(async () => {
    daemon = createTestDaemon({ apiToken: TEST_API_TOKEN });
    await daemon.start();
    app = (daemon as any).app;
  });

  afterAll(async () => {
    await daemon.stop();
  });

  it('GET /v1/stats returns statistics', async () => {
    const response = await request(app)
      .get('/v1/stats')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`);

    expect(response.status).toBe(200);
    expect(response.body).toBeDefined();
  });
});

// ============================================================================
// Integration Flow Tests
// ============================================================================

describe('Integration Flows', () => {
  let daemon: Harmond;
  let app: any;

  beforeEach(async () => {
    daemon = createTestDaemon({ apiToken: TEST_API_TOKEN });
    await daemon.start();
    stubConnectedSpotify(daemon);
    app = (daemon as any).app;
  });

  afterEach(async () => {
    if (daemon) {
      await daemon.stop();
    }
  });

  it('complete session lifecycle', async () => {
    // 1. Check initial status
    let response = await request(app)
      .get('/v1/status')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`);
    expect(response.body.session).toBeUndefined();

    // 2. Start session
    response = await request(app)
      .post('/v1/command')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .send({
        id: 'c_flow1',
        ts: Date.now(),
        source: { kind: 'cli', device: 'linux' },
        type: 'session.start',
        payload: { policy: mockSessionPolicy },
      });
    expect(response.status).toBe(200);
    const sessionId = response.body.sessionId;

    // 3. Verify session is active
    response = await request(app)
      .get('/v1/status')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`);
    expect(response.body.session.id).toBe(sessionId);
    expect(response.body.session.isActive).toBe(true);

    // 4. Nudge session
    response = await request(app)
      .post('/v1/command')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .send({
        id: 'c_flow2',
        ts: Date.now(),
        source: { kind: 'cli', device: 'linux' },
        type: 'session.nudge',
        payload: { direction: 'calmer', amount: 0.1 },
      });
    expect(response.status).toBe(200);

    // 5. Stop session
    response = await request(app)
      .post('/v1/command')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .send({
        id: 'c_flow3',
        ts: Date.now(),
        source: { kind: 'cli', device: 'linux' },
        type: 'session.stop',
        payload: {},
      });
    expect(response.status).toBe(200);

    // 6. Verify session is stopped
    response = await request(app)
      .get('/v1/status')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`);
    expect(response.body.session).toBeUndefined();
  });
});
