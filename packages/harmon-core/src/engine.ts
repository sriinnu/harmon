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
}

class SessionEngineImpl implements SessionEngine {
  private provider: MusicProvider;
  private playback: PlaybackController;
  private store: SessionStore;
  private onEvent: EventCallback;
  private state: SessionState | null = null;
  private refillInterval: ReturnType<typeof setInterval> | null = null;
  private refilling = false;

  // Constants
  private readonly REFILL_CHECK_INTERVAL_MS = 10000;  // Check every 10s

  constructor(config: EngineConfig) {
    this.provider = config.provider;
    this.playback = config.playback;
    this.store = config.store;
    this.onEvent = config.onEvent || (() => {});
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

    const sign = direction === 'calmer' ? -1 : 1;
    const policy = this.state.policy;
    const previousPolicy = policy;
    const previousQueue = [...this.state.queuedTracks];

    // Update soft weights
    const currentWeights = policy.soft?.weights || {};
    const newWeights = { ...currentWeights };

    // Adjust energy and valence — always clamp to [0,1]
    if (typeof newWeights.energy === 'number') {
      newWeights.energy = clamp(newWeights.energy + sign * amount, 0, 1);
    } else {
      newWeights.energy = clamp(0.5 + sign * amount, 0, 1);
    }

    if (typeof newWeights.valence === 'number') {
      newWeights.valence = clamp(newWeights.valence + sign * amount * 0.5, 0, 1);
    } else {
      newWeights.valence = clamp(0.5 + sign * amount * 0.5, 0, 1);
    }

    // Update policy
    this.state.policy = {
      ...policy,
      soft: {
        ...policy.soft,
        weights: newWeights,
      },
    };

    // Clear queue and refill with new weights
    this.state.queuedTracks = [];
    await this.refillQueue();

    if (this.state.queuedTracks.length === 0) {
      this.state.policy = previousPolicy;
      this.state.queuedTracks = previousQueue;
      throw new Error('Nudge could not refill the queue with the updated session policy.');
    }

    await this.store.logEvent(
      'session.nudged',
      { direction, amount, newWeights },
      this.state.id
    );
  }

  getQueue(): TrackInfo[] {
    return this.state?.queuedTracks || [];
  }

  getState(): SessionState | null {
    return this.state;
  }

  async refillQueue(): Promise<void> {
    if (!this.state || this.refilling) {
      return;
    }

    this.refilling = true;
    try {
      const policy = this.state.policy;
      const queuePrefs = policy.queue || {};
      const targetDepth = queuePrefs.target || 12;
      const refillThreshold = queuePrefs.refillWhenBelow || 5;

      const currentDepth = this.state.queuedTracks.length;

      if (currentDepth >= refillThreshold) {
        return;  // Queue still healthy
      }

      const needed = targetDepth - currentDepth;

      // Fetch candidates via provider
      const candidates = await fetchCandidates(
        this.provider,
        policy.sources || {},
        needed * 3  // Fetch 3x needed for filtering
      );

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
        this.state.history,
        this.getElapsedMs()
      );

      // Take top N
      const topTracks = ranked.slice(0, needed);

      // Add to playback queue
      for (const { track } of topTracks) {
        if (track.uri) {
          await this.playback.addToQueue(track.uri, track);
        }
      }

      // Update local queue state
      this.state.queuedTracks.push(...topTracks.map(r => r.track));

      // Emit event
      this.emit({
        type: 'queue.refilled',
        payload: {
          sessionId: this.state.id,
          added: topTracks.length,
          queueDepth: this.state.queuedTracks.length,
        },
      });

      await this.store.logEvent(
        'queue.refilled',
        { added: topTracks.length, queueDepth: this.state.queuedTracks.length },
        this.state.id
      );
    } catch (error) {
      this.emit({
        type: 'error',
        payload: {
          message: error instanceof Error ? error.message : 'Queue refill failed',
        },
      });
    } finally {
      this.refilling = false;
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
      playedAt: Date.now(),
    };

    this.state.history.push(record);
    this.state.currentTrack = track;

    // Remove from queue
    this.state.queuedTracks = this.state.queuedTracks.filter(t => t.id !== track.id);

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
        console.error('Auto-refill failed:', err);
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
      console.error('Event callback error:', error);
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
