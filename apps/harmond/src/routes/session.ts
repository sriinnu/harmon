/**
 * routes/session.ts — Session lifecycle, status, journal, device, and SSE routes
 *
 * Registers the core daemon endpoints: health check, status, command dispatch,
 * device management, journal entries, stats, and server-sent events.
 * These routes form the session control plane of the daemon.
 *
 * @module routes/session
 */

import type { Application, Request, Response } from 'express';
import type { DaemonContext } from '../daemon-context.js';
import {
  parseCommandSafe,
  SessionStartCommand,
  SessionNudgeCommand,
  type Command,
} from '@sriinnu/harmon-protocol';
import { ValidationError, ApiError } from '../errors.js';
import { v4 as uuidv4 } from 'uuid';
import { clampNumber, parseBodyString, parseJournalEntry, serializeJournalField } from '../helpers.js';

/** Hard cap on concurrent SSE connections to prevent resource exhaustion. */
const MAX_SSE_CLIENTS = 50;

export function registerSessionRoutes(app: Application, ctx: DaemonContext): void {
  // ── Status ────────────────────────────────────────────────────────────
  app.get('/v1/status', async (_req: Request, res: Response) => {
    try {
      res.json(await ctx.getStatus());
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  // ── Devices ───────────────────────────────────────────────────────────
  app.get('/v1/devices', async (_req: Request, res: Response) => {
    try {
      res.json(await ctx.spotifyClient.getDevices());
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  // ── Command endpoint — with per-type payload validation ───────────────
  app.post('/v1/command', async (req: Request, res: Response) => {
    try {
      const parsed = parseCommandSafe(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: 'Invalid command', issues: parsed.error.issues });
        return;
      }
      const result = await handleCommand(ctx, parsed.data);
      res.json(result);
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  // ── Device use ────────────────────────────────────────────────────────
  app.post('/v1/device/use', async (req: Request, res: Response) => {
    try {
      const { deviceId } = req.body;
      if (typeof deviceId !== 'string' || deviceId.trim().length === 0) {
        res.status(400).json({ success: false, error: 'Invalid deviceId' });
        return;
      }
      await ctx.spotifyClient.transferTo(deviceId);
      ctx.broadcastEvent('device.changed', { deviceId });
      res.json({ success: true });
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  // ── Daemon lifecycle ──────────────────────────────────────────────────
  app.post('/v1/daemon/stop', (_req: Request, res: Response) => {
    // Respond first so the caller (menubar, CLI) gets an ack, then shut
    // down gracefully. Auth-gated like every /v1 route.
    res.json({ success: true, stopping: true });
    ctx.requestShutdown();
  });

  // ── Journal — with bounds ─────────────────────────────────────────────
  app.get('/v1/journal', async (req: Request, res: Response) => {
    try {
      const limit = Math.min(Math.max(Number.parseInt(req.query.limit as string, 10) || 50, 1), 500);
      res.json(await ctx.store.getJournalEntries(limit));
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  app.post('/v1/journal', async (req: Request, res: Response) => {
    try {
      const entry = parseJournalEntry(req.body);
      const id = await ctx.store.addJournalEntry({
        filename: `api-${uuidv4()}.md`,
        timestamp: new Date().toISOString(),
        source: entry.source,
        device: entry.device,
        sessionId: entry.sessionId,
        moodTags: entry.moodTags.join(', '),
        energyLevel: entry.energyLevel,
        context: serializeJournalField(entry.context, 'context', 2000),
        content: entry.content,
        policy: serializeJournalField(entry.policy, 'policy', 5000),
      });
      res.json({ id, success: true });
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  // ── SSE events ────────────────────────────────────────────────────────
  app.get('/v1/events', (req: Request, res: Response) => {
    try {
      if (!ctx.enableSSE) {
        throw new ApiError(404, 'SSE is disabled for this daemon instance.', 'SSE_DISABLED');
      }

      if (ctx.sseClients.size >= MAX_SSE_CLIENTS) {
        res.status(503).json({ success: false, error: 'Too many SSE connections' });
        return;
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
      res.write(`data: ${JSON.stringify(ctx.createEvent('connected', {}))}\n\n`);
      ctx.sseClients.add(res);
      req.on('close', () => { ctx.sseClients.delete(res); });
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });

  // ── Stats ─────────────────────────────────────────────────────────────
  app.get('/v1/stats', async (_req: Request, res: Response) => {
    try {
      res.json(await ctx.store.getStats());
    } catch (error) {
      ctx.handleRouteError(res, error);
    }
  });
}

// ── Command dispatcher ──────────────────────────────────────────────────

/**
 * Dispatch a validated command envelope to the appropriate session handler.
 *
 * Each command type gets its own payload validation via the protocol's
 * Zod schemas before reaching the session lifecycle methods.
 */
async function handleCommand(
  ctx: DaemonContext,
  command: Command,
): Promise<{ success: boolean; sessionId?: string; newWeights?: Record<string, number | undefined> }> {
  await ctx.store.logEvent('command', { type: command.type, commandId: command.id });

  switch (command.type) {
    case 'session.start': {
      const payloadResult = SessionStartCommand.safeParse(command.payload || {});
      if (!payloadResult.success) {
        throw new ValidationError(
          `Invalid session.start payload: ${payloadResult.error.issues.map((issue) => issue.message).join(', ')}`,
          payloadResult.error.issues,
        );
      }
      return ctx.startSession(payloadResult.data.policy);
    }

    case 'session.stop':
      return ctx.stopSession();

    case 'session.nudge': {
      const nudgeResult = SessionNudgeCommand.safeParse(command.payload || {});
      if (!nudgeResult.success) {
        throw new ValidationError(
          `Invalid session.nudge payload: ${nudgeResult.error.issues.map((issue) => issue.message).join(', ')}`,
          nudgeResult.error.issues,
        );
      }
      return ctx.nudgeSession(nudgeResult.data.direction, nudgeResult.data.amount);
    }

    case 'skip':
      return ctx.skipTrack((command.payload as Record<string, unknown>)?.reason as string | undefined);

    default:
      throw new ValidationError(`Unknown command type: ${command.type}`);
  }
}
