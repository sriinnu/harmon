/**
 * Integration tests for Harmond HTTP API
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { Harmond } from './index.js';
import type { SessionPolicy } from '@athena/harmon-protocol';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

// ============================================================================
// Test Setup & Fixtures
// ============================================================================

const TEST_API_TOKEN = 'test-token-' + randomBytes(16).toString('hex');
const INVALID_TOKEN = 'invalid-token';

function createTestDaemon(options: { apiToken?: string; corsOrigins?: string[] } = {}) {
  const dbPath = join(tmpdir(), `harmon-test-${Date.now()}-${Math.random()}.db`);

  return new Harmond({
    port: 0, // Random port
    host: '127.0.0.1',
    dbPath,
    apiToken: options.apiToken,
    corsOrigins: options.corsOrigins,
  });
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
    app = (daemon as any).app;
  });

  afterAll(async () => {
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

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
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

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('No active session');
    });
  });

  describe('skip command', () => {
    it('skips current track with reason', async () => {
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

describe('Error Handling', () => {
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

    expect(response.status).toBe(400);
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
    app = (daemon as any).app;
  });

  afterAll(async () => {
    await daemon.stop();
  });

  it('applies rate limiting to command endpoint', async () => {
    const requests: Promise<any>[] = [];

    // Send 25 requests rapidly (limit is 20 per minute for commands)
    for (let i = 0; i < 25; i++) {
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
});

// ============================================================================
// CORS Tests
// ============================================================================

describe('CORS', () => {
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

  it('POST /v1/auth/spotify/login returns auth URL', async () => {
    const response = await request(app)
      .post('/v1/auth/spotify/login')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('url');
    expect(response.body.url).toContain('accounts.spotify.com');
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
    const response = await request(app)
      .get('/v1/events')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .set('Accept', 'text/event-stream');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.headers['cache-control']).toBe('no-cache');
  });

  it('sends initial connected event', (done) => {
    const req = request(app)
      .get('/v1/events')
      .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
      .set('Accept', 'text/event-stream')
      .buffer(false)
      .parse((res, callback) => {
        res.on('data', (chunk) => {
          const data = chunk.toString();
          if (data.includes('connected')) {
            expect(data).toContain('data:');
            done();
          }
        });
        callback(null, res);
      });

    req.end();
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
    app = (daemon as any).app;
  });

  afterAll(async () => {
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
