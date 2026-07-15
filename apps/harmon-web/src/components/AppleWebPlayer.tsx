import { useCallback, useEffect, useRef, useState } from 'react';
import { useDaemon } from '../lib/DaemonContext';
import { appleSongIdFromUrl } from '../lib/apple';

/**
 * Plays Apple Music inside this tab via MusicKit JS — no Music.app needed.
 * The tab registers with the daemon's remote-playback bridge (the same
 * protocol the iOS companion speaks): it polls for queued commands,
 * executes them through MusicKit, acks them, and reports playback state
 * back so every surface sees the truth.
 *
 * Popup discipline: browsers only allow the Apple ID popup when authorize()
 * runs inside a user gesture. The SDK is therefore preloaded and configured
 * as soon as the card renders, so the Enable click has nothing left to do
 * but authorize.
 */

const SDK_URL = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js';
const DEVICE_KEY = 'harmon-apple-web-device-id';
const ENABLED_KEY = 'harmon-apple-web-player-enabled';
const POLL_MS = 2000;

type PlayerState = 'off' | 'loading' | 'authorizing' | 'ready' | 'active' | 'error';

interface MusicKitInstance {
  authorize(): Promise<string>;
  isAuthorized?: boolean;
  volume?: number;
  /** Seconds into the current track. */
  currentPlaybackTime?: number;
  setQueue(options: Record<string, unknown>): Promise<unknown>;
  seekToTime(seconds: number): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  skipToNextItem(): Promise<void>;
  skipToPreviousItem(): Promise<void>;
  addEventListener(event: string, cb: () => void): void;
  removeEventListener(event: string, cb: () => void): void;
  playbackState: number;
  nowPlayingItem?: {
    title?: string;
    artistName?: string;
    albumName?: string;
    playbackDuration?: number;
    container?: { id?: string };
    id?: string;
    /** v1-style property — often undefined in MusicKit v3. */
    artworkURL?: string;
    /** v3 keeps the API resource attributes here. */
    attributes?: { artwork?: { url?: string }; durationInMillis?: number };
  } | null;
}

declare global {
  interface Window {
    MusicKit?: {
      configure(options: Record<string, unknown>): Promise<MusicKitInstance>;
      getInstance(): MusicKitInstance;
    };
  }
}

/** MusicKit artwork URLs are templates ("…/{w}x{h}bb.jpg") — resolve them
 * to a real size or every surface shows a broken image. */
function resolveArtwork(url?: string): string | undefined {
  if (!url) return undefined;
  return url.replace('{w}', '600').replace('{h}', '600');
}

function deviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = `web-${crypto.randomUUID()}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

function loadSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.MusicKit) {
      resolve();
      return;
    }
    document.addEventListener('musickitloaded', () => resolve(), { once: true });
    if (!document.querySelector(`script[src="${SDK_URL}"]`)) {
      const script = document.createElement('script');
      script.src = SDK_URL;
      script.async = true;
      script.onerror = () => reject(new Error('Could not load MusicKit JS.'));
      document.body.appendChild(script);
    }
  });
}

export function AppleWebPlayer() {
  const { client, status } = useDaemon();
  const [enabled, setEnabled] = useState(localStorage.getItem(ENABLED_KEY) === 'true');
  const [authorized, setAuthorized] = useState(false);
  const [state, setState] = useState<PlayerState>('off');
  const [message, setMessage] = useState('');
  /** Chrome blocked audio because the tab had no user gesture — needs one click. */
  const [needsGesture, setNeedsGesture] = useState(false);
  const musicPromise = useRef<Promise<MusicKitInstance> | null>(null);

  const appleConnected = Boolean(status?.providers?.apple?.connected);

  /// SDK + developer token + configure — everything except authorize().
  const prepare = useCallback((): Promise<MusicKitInstance> => {
    if (!musicPromise.current) {
      musicPromise.current = (async () => {
        await loadSdk();
        const { developerToken } = await client.getAppleDeveloperToken();
        const music = await window.MusicKit!.configure({
          developerToken,
          app: { name: 'Harmon', build: '1.0' },
        });
        music.volume = 1;
        return music;
      })();
      musicPromise.current.catch(() => {
        // Allow a retry on the next attempt instead of caching the failure.
        musicPromise.current = null;
      });
    }
    return musicPromise.current;
  }, [client]);

  // Preload as soon as Apple is connected so Enable only has to authorize.
  useEffect(() => {
    if (!appleConnected) return;
    prepare().catch(() => {});
  }, [appleConnected, prepare]);

  // Returning visitor: MusicKit caches the user token per origin, so a
  // silent (popup-free) authorize succeeds and the player self-starts.
  useEffect(() => {
    if (!enabled || !appleConnected || authorized) return;
    let cancelled = false;
    (async () => {
      try {
        const music = await prepare();
        if (cancelled) return;
        if (music.isAuthorized) {
          setAuthorized(true);
          return;
        }
        setMessage('Click Enable to finish the Apple ID sign-in.');
        setEnabled(false);
        localStorage.setItem(ENABLED_KEY, 'false');
      } catch (e) {
        if (!cancelled) {
          setState('error');
          setMessage(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, appleConnected]);

  // The bridge loop: register with the daemon, execute queued commands,
  // report state. Runs only once authorized.
  useEffect(() => {
    if (!enabled || !appleConnected || !authorized) return;
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let music: MusicKitInstance | null = null;
    const id = deviceId();

    const reportState = async (instance: MusicKitInstance) => {
      const item = instance.nowPlayingItem;
      // MusicKit playbackState: 2 = playing, 3 = paused.
      const playbackState = instance.playbackState === 2 ? 'playing' : item ? 'paused' : 'stopped';
      // MusicKit v3's playbackDuration is already in ms (v1 used seconds) —
      // trust attributes.durationInMillis first, then sniff the unit: no
      // real song is 30000+ seconds long.
      const rawDuration = item?.playbackDuration || 0;
      const durationMs = Math.round(
        item?.attributes?.durationInMillis ?? (rawDuration > 30000 ? rawDuration : rawDuration * 1000),
      );
      const currentTrack = item
        ? {
            id: item.id || item.container?.id || 'apple-web-unknown',
            name: item.title || 'Unknown',
            artist: item.artistName || 'Unknown',
            album: item.albumName || '',
            durationMs,
            positionMs: Math.max(0, Math.round((instance.currentPlaybackTime || 0) * 1000)),
            imageUrl: resolveArtwork(item.artworkURL ?? item.attributes?.artwork?.url),
            provider: 'apple' as const,
          }
        : null;
      try {
        await client.appleRemoteState({ deviceId: id, playbackState, currentTrack });
        if (!cancelled) setState(playbackState === 'playing' ? 'active' : 'ready');
      } catch {
        // State reports are best-effort; the next event retries.
      }
    };

    const onPlaybackChange = () => {
      if (music) void reportState(music);
    };

    const executeCommand = async (instance: MusicKitInstance, command: { id: string; type: string; uri?: string; positionMs?: number }) => {
      console.log('[harmon] executing', command.type, command.uri ?? '');
      try {
        switch (command.type) {
          case 'play': {
            if (command.uri) {
              const songId = appleSongIdFromUrl(command.uri);
              if (songId) {
                await instance.setQueue({ song: songId });
              } else {
                setMessage(`Could not extract a song id from ${command.uri}`);
              }
            }
            try {
              await instance.play();
              setNeedsGesture(false);
            } catch (e) {
              // Chrome blocks audio started without a user gesture in the
              // tab (autoplay policy) — MusicKit may even report "playing"
              // while silent. One click unlocks the tab.
              if (e instanceof Error && (e.name === 'NotAllowedError' || /gesture|interact/i.test(e.message))) {
                setNeedsGesture(true);
                setMessage('Your browser muted playback because this tab has not been clicked yet — press "Start audio" once.');
              } else {
                throw e;
              }
            }
            break;
          }
          case 'pause':
            await instance.pause();
            break;
          case 'seek':
            await instance.seekToTime(Math.max(0, (command.positionMs ?? 0) / 1000));
            break;
          case 'next':
            await instance.skipToNextItem();
            break;
          case 'previous':
            await instance.skipToPreviousItem();
            break;
        }
      } catch (e) {
        console.error('[harmon] command failed', command.type, e);
        setMessage(e instanceof Error ? e.message : String(e));
      } finally {
        await client.appleRemoteAck(id, command.id).catch((e) => {
          console.error('[harmon] ack failed', e);
          setMessage(`Ack failed: ${e instanceof Error ? e.message : String(e)}`);
        });
        void reportState(instance);
      }
    };

    (async () => {
      try {
        const instance = await prepare();
        if (cancelled) return;
        music = instance;
        await client.appleRemoteConnect(id, 'Harmon Web Player');
        if (cancelled) return;
        setState('ready');
        setMessage('');

        instance.addEventListener('playbackStateDidChange', onPlaybackChange);
        instance.addEventListener('nowPlayingItemDidChange', onPlaybackChange);

        pollTimer = setInterval(async () => {
          try {
            const { commands } = await client.appleRemoteCommands(id);
            if ((commands ?? []).length > 0) {
              console.log('[harmon] bridge commands', commands);
            }
            for (const command of commands ?? []) {
              await executeCommand(instance, command);
            }
            // Keep the position fresh while playing — event listeners only
            // fire on state changes, not as the song advances.
            if (instance.playbackState === 2) {
              void reportState(instance);
            }
          } catch (e) {
            // Not just "briefly unreachable" — surface it, or a permanently
            // failing poll looks like a healthy player that ignores commands.
            console.error('[harmon] bridge poll failed', e);
            setMessage(`Bridge poll failed: ${e instanceof Error ? e.message : String(e)}`);
          }
        }, POLL_MS);
      } catch (e) {
        if (!cancelled) {
          setState('error');
          setMessage(e instanceof Error ? e.message : String(e));
        }
      }
    })();

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      if (music) {
        music.removeEventListener('playbackStateDidChange', onPlaybackChange);
        music.removeEventListener('nowPlayingItemDidChange', onPlaybackChange);
        music.stop().catch(() => {});
      }
      setState('off');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, appleConnected, authorized, client]);

  /// Enable click: authorize() must run inside this gesture or the browser
  /// silently blocks the Apple ID popup.
  const toggle = () => {
    if (enabled) {
      setEnabled(false);
      setAuthorized(false);
      localStorage.setItem(ENABLED_KEY, 'false');
      return;
    }
    setEnabled(true);
    localStorage.setItem(ENABLED_KEY, 'true');
    setMessage('');
    setState('authorizing');
    void (async () => {
      try {
        const music = await prepare();
        await music.authorize();
        setAuthorized(true);
      } catch (e) {
        setState('error');
        setMessage(
          e instanceof Error
            ? `${e.message} — if no Apple ID window appeared, allow popups for this site and click Enable again.`
            : String(e),
        );
        setEnabled(false);
        localStorage.setItem(ENABLED_KEY, 'false');
      }
    })();
  };

  if (!appleConnected) return null;

  return (
    <section className="panel">
      <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5em' }}>
        Apple Music browser player
        <span style={{ fontSize: '0.7em', fontWeight: 'normal', color: 'var(--muted)' }}>
          {state === 'off' && 'off'}
          {state === 'loading' && 'starting…'}
          {state === 'authorizing' && 'sign in with your Apple ID…'}
          {state === 'ready' && '● ready as "Harmon Web Player"'}
          {state === 'active' && '▶ playing here'}
          {state === 'error' && 'error'}
        </span>
      </h2>
      <p style={{ fontSize: '0.85em', color: 'var(--muted)', margin: '0.3em 0 0.8em' }}>
        Plays Apple Music in this tab — no Music.app needed. Requires an Apple Music subscription; one-time Apple ID sign-in.
      </p>
      <button onClick={toggle}>{enabled ? 'Disable' : 'Enable'}</button>
      {needsGesture && (
        <button
          style={{ marginLeft: '0.6em' }}
          onClick={() => {
            // This click IS the user gesture Chrome wants — play directly in it.
            void musicPromise.current?.then(async (music) => {
              await music.play();
              setNeedsGesture(false);
              setMessage('');
            }).catch((e) => setMessage(e instanceof Error ? e.message : String(e)));
          }}
        >
          ▶ Start audio
        </button>
      )}
      {message && (
        <p className="status-err" style={{ marginTop: '0.6em' }}>{message}</p>
      )}
    </section>
  );
}
