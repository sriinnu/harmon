/**
 * Session engine - Core orchestrator for session lifecycle and queue management
 *
 * Provider-agnostic: works with any MusicProvider + PlaybackController.
 */

import type { SessionPolicy, TrackInfo } from '@sriinnu/harmon-protocol';
import type {
  MusicProvider,
  PlaybackController,
  SessionState,
  EventCallback,
  EngineEvent,
  EngineLogger,
  PlayRecord,
  SessionStore,
} from './types.js';
import { fetchCandidates } from './sources.js';
import { rankTracks } from './ranking.js';

export interface SessionEngine {
  start(policy: SessionPolicy): Promise<void>;
  stop(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  nudge(direction: 'calmer' | 'sharper', amount?: number): Promise<void>;
  getQueue(): TrackInfo[];
  getState(): SessionState | null;
  refillQueue(): Promise<void>;
  recordPlay(track: TrackInfo): Promise<void>;
}

export interface EngineConfig {
  provider: MusicProvider;
  playback: PlaybackController;
  store: SessionStore;
  onEvent?: EventCallback;
  /** Optional logger for engine internals. Falls back to no-op if omitted. */
  logger?: EngineLogger;
}

class SessionEngineImpl implements SessionEngine {
  private provider: MusicProvider;
  private playback: PlaybackController;
  private store: SessionStore;
  private onEvent: EventCallback;
  private logger: EngineLogger;
  private state: SessionState | null = null;
  private refillInterval: ReturnType<typeof setInterval> | null = null;
  private refillPromise: Promise<void> | null = null;

  // Constants
  private readonly REFILL_CHECK_INTERVAL_MS = 10000;  // Check every 10s

  constructor(config: EngineConfig) {
    this.provider = config.provider;
    this.playback = config.playback;
    this.store = config.store;
    this.onEvent = config.onEvent || (() => {});
    this.logger = config.logger || { warn: () => {}, error: () => {} };
  }

  async start(policy: SessionPolicy): Promise<void> {
    if (this.state !== null) {
      throw new Error('Session already active. Stop current session first.');
    }

    // Create session in store
    const sessionId = await this.store.createSession(JSON.stringify(policy));

    // Initialize state
    this.state = {
      id: sessionId,
      policy,
      startedAt: Date.now(),
      status: 'running',
      history: [],
      currentTrack: null,
      queuedTracks: [],
    };

    try {
      // Initial queue fill
      await this.refillQueue();

      // Start auto-refill monitoring
      this.startRefillMonitoring();

      // Emit event
      this.emit({
        type: 'session.started',
        payload: {
          sessionId,
          policy,
          startedAt: this.state.startedAt,
        },
      });

      await this.store.logEvent('session.started', { sessionId, policy }, sessionId);
    } catch (error) {
      // Unwind so a failed start cannot leave a ghost session: a live refill
      // timer, in-memory state, and a sessions row stuck 'active'.
      this.stopRefillMonitoring();
      this.state = null;
      try {
        await this.store.endSession(sessionId);
      } catch {
        // Best effort — the original failure matters more.
      }
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.state) {
      throw new Error('No active session');
    }

    const stoppedState = this.state;
    const elapsedMs = Date.now() - stoppedState.startedAt;

    // Stop monitoring
    this.stopRefillMonitoring();

    // Clear the live session before store finalization so a persistence error
    // cannot strand a ghost in-memory session.
    this.state = null;

    // End session in store
    await this.store.endSession(stoppedState.id);
    await this.store.logEvent('session.stopped', { sessionId: stoppedState.id }, stoppedState.id);

    // Emit event
    this.emit({
      type: 'session.stopped',
      payload: {
        sessionId: stoppedState.id,
        elapsedMs,
        duration: elapsedMs,
        durationMs: elapsedMs,
      },
    });
  }

  async pause(): Promise<void> {
    if (!this.state) {
      throw new Error('No active session');
    }

    this.state.status = 'paused';
    this.stopRefillMonitoring();
  }

  async resume(): Promise<void> {
    if (!this.state) {
      throw new Error('No active session');
    }

    this.state.status = 'running';
    this.startRefillMonitoring();
  }

  async nudge(direction: 'calmer' | 'sharper', amount = 0.1): Promise<void> {
    if (!this.state) {
      throw new Error('No active session');
    }

    // Let any in-flight auto-refill finish first so its old-policy tracks
    // cannot land on top of the freshly nudged queue.
    if (this.refillPromise) {
      await this.refillPromise.catch(() => {});
    }
    if (!this.state) {
      throw new Error('No active session');
    }

    const sign = direction === 'calmer' ? -1 : 1;
    const policy = this.state.policy;
    const previousPolicy = policy;
    const previousQueue = [...this.state.queuedTracks];

    // A nudge moves the energy TARGET, not the energy weight: "calmer" means
    // rank tracks near a lower energy level, so the weight stays a positive
    // magnitude and only the target shifts.
    const currentTarget = policy.soft?.targetEnergy ?? 0.5;
    const newTarget = clamp(currentTarget + sign * amount, 0, 1);

    const currentWeights = policy.soft?.weights || {};
    const newWeights = { ...currentWeights };
    if (typeof newWeights.energy !== 'number' || newWeights.energy === 0) {
      newWeights.energy = 0.5;
    } else {
      newWeights.energy = Math.abs(newWeights.energy);
    }

    // Valence follows the nudge direction softly: negative weight = prefer
    // low-valence tracks, consistent with monotone weight semantics.
    if (typeof newWeights.valence === 'number') {
      newWeights.valence = clamp(newWeights.valence + sign * amount * 0.5, -1, 1);
    } else {
      newWeights.valence = clamp(sign * amount * 0.5, -1, 1);
    }

    // Update policy
    this.state.policy = {
      ...policy,
      soft: {
        ...policy.soft,
        targetEnergy: newTarget,
        weights: newWeights,
      },
    };

    // Clear queue and refill with new weights
    this.state.queuedTracks = [];
    await this.refillQueue();

    if (this.state && this.state.queuedTracks.length === 0) {
      this.state.policy = previousPolicy;
      this.state.queuedTracks = previousQueue;
      throw new Error('Nudge could not refill the queue with the updated session policy.');
    }
    if (!this.state) {
      return;
    }

    await this.store.logEvent(
      'session.nudged',
      { direction, amount, newWeights, targetEnergy: newTarget },
      this.state.id
    );

    this.emit({
      type: 'session.nudged',
      payload: {
        sessionId: this.state.id,
        direction,
        amount,
        newWeights,
        targetEnergy: newTarget,
      },
    });
  }

  getQueue(): TrackInfo[] {
    return this.state?.queuedTracks || [];
  }

  getState(): SessionState | null {
    return this.state;
  }

  async refillQueue(): Promise<void> {
    if (!this.state) {
      return;
    }
    // Single-flight: concurrent callers (nudge vs. the auto-refill timer)
    // share the in-flight run instead of silently returning on an empty queue.
    if (this.refillPromise) {
      return this.refillPromise;
    }

    this.refillPromise = this.doRefill().finally(() => {
      this.refillPromise = null;
    });
    return this.refillPromise;
  }

  private async doRefill(): Promise<void> {
    // Capture the state generation: stop() nulls this.state and nudge swaps
    // the policy while we're awaiting, so re-check after every await before
    // touching the real playback queue.
    const state = this.state;
    if (!state) {
      return;
    }

    try {
      const policy = state.policy;
      const queuePrefs = policy.queue || {};
      const targetDepth = queuePrefs.target || 12;
      const refillThreshold = queuePrefs.refillWhenBelow || 5;

      const currentDepth = state.queuedTracks.length;

      if (currentDepth >= refillThreshold) {
        return;  // Queue still healthy
      }

      const needed = targetDepth - currentDepth;

      // Fetch candidates via provider
      const candidates = await fetchCandidates(
        this.provider,
        policy.sources || {},
        needed * 3,  // Fetch 3x needed for filtering
        this.logger,
      );

      if (this.state !== state) {
        return;  // Session stopped while fetching
      }

      if (candidates.length === 0) {
        this.emit({
          type: 'error',
          payload: { message: 'No candidates found for queue refill' },
        });
        return;
      }

      // Rank tracks
      const ranked = await rankTracks(
        candidates,
        policy,
        state.history,
        this.getElapsedMs()
      );

      // Take top N
      const topTracks = ranked.slice(0, needed);

      // Add to playback queue
      for (const { track } of topTracks) {
        if (this.state !== state) {
          return;  // Session stopped mid-refill; stop feeding the player
        }
        if (track.uri) {
          await this.playback.addToQueue(track.uri, track);
        }
      }

      if (this.state !== state) {
        return;
      }

      // Update local queue state
      state.queuedTracks.push(...topTracks.map(r => r.track));

      // Emit event
      this.emit({
        type: 'queue.refilled',
        payload: {
          sessionId: state.id,
          added: topTracks.length,
          queueDepth: state.queuedTracks.length,
        },
      });

      await this.store.logEvent(
        'queue.refilled',
        { added: topTracks.length, queueDepth: state.queuedTracks.length },
        state.id
      );
    } catch (error) {
      this.emit({
        type: 'error',
        payload: {
          message: error instanceof Error ? error.message : 'Queue refill failed',
        },
      });
    }
  }

  // Track when a track finishes (called by daemon monitoring)
  async recordPlay(track: TrackInfo): Promise<void> {
    if (!this.state) {
      return;
    }

    const record: PlayRecord = {
      trackId: track.id,
      artistIds: track.artistIds && track.artistIds.length > 0
        ? track.artistIds
        : [track.artist],
      artistNames: [track.artist],
      playedAt: Date.now(),
    };

    this.state.history.push(record);

    // Trim history to last 48 hours to prevent unbounded memory growth.
    // 48h covers the widest repetition limit (repeatTrackWithinDays: 1 = 24h)
    // plus a generous safety margin.
    const HISTORY_RETENTION_MS = 48 * 60 * 60 * 1000;
    const cutoff = Date.now() - HISTORY_RETENTION_MS;
    if (this.state.history.length > 100) {
      this.state.history = this.state.history.filter(r => r.playedAt >= cutoff);
    }

    this.state.currentTrack = track;

    // Remove from queue
    this.state.queuedTracks = this.state.queuedTracks.filter(t => t.id !== track.id);

    // Emit engine event so the daemon can broadcast to SSE clients
    this.emit({
      type: 'track.started',
      payload: {
        sessionId: this.state.id,
        playedAt: record.playedAt,
        track,
      },
    });

    await this.store.logEvent(
      'track.started',
      {
        playedAt: record.playedAt,
        track,
      },
      this.state.id,
    );
  }

  private startRefillMonitoring(): void {
    if (this.refillInterval !== null) {
      return;
    }

    this.refillInterval = setInterval(() => {
      this.refillQueue().catch(err => {
        this.logger.error({ error: err instanceof Error ? err.message : String(err) }, 'Auto-refill failed');
      });
    }, this.REFILL_CHECK_INTERVAL_MS);
  }

  private stopRefillMonitoring(): void {
    if (this.refillInterval !== null) {
      clearInterval(this.refillInterval);
      this.refillInterval = null;
    }
  }

  private emit(event: EngineEvent): void {
    try {
      this.onEvent(event);
    } catch (error) {
      this.logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Event callback error');
    }
  }

  private getElapsedMs(): number {
    return this.state ? Date.now() - this.state.startedAt : 0;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function createEngine(config: EngineConfig): SessionEngine {
  return new SessionEngineImpl(config);
}
