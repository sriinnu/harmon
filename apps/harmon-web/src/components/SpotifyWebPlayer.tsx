import { useEffect, useRef, useState } from 'react';
import { useDaemon } from '../lib/DaemonContext';

/**
 * Turns this browser tab into a Spotify Connect device ("Harmon Player")
 * via Spotify's Web Playback SDK — so playback needs no Spotify app open
 * anywhere. Requires Spotify Premium and the `streaming` scope (reconnect
 * Spotify once if the account was authorized before that scope was added).
 */

const SDK_URL = 'https://sdk.scdn.co/spotify-player.js';
const DEVICE_NAME = 'Harmon Player';
const ENABLED_KEY = 'harmon-browser-player-enabled';

type PlayerState = 'off' | 'loading' | 'ready' | 'active' | 'error';

// Minimal typings for the pieces of the SDK we touch.
interface SpotifySdkPlayer {
  addListener(event: string, cb: (payload: any) => void): void;
  connect(): Promise<boolean>;
  disconnect(): void;
}

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify?: { Player: new (options: Record<string, unknown>) => SpotifySdkPlayer };
  }
}

export function SpotifyWebPlayer() {
  const { client, status, refreshStatus } = useDaemon();
  const [enabled, setEnabled] = useState(localStorage.getItem(ENABLED_KEY) === 'true');
  const [state, setState] = useState<PlayerState>('off');
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const playerRef = useRef<SpotifySdkPlayer | null>(null);

  const spotifyConnected = Boolean(status?.providers?.spotify?.connected);

  useEffect(() => {
    if (!enabled || !spotifyConnected) return;
    let cancelled = false;
    setState('loading');
    setMessage('');

    const boot = () => {
      if (cancelled || !window.Spotify) return;
      const player = new window.Spotify.Player({
        name: DEVICE_NAME,
        getOAuthToken: (cb: (token: string) => void) => {
          client.getSpotifyPlaybackToken()
            .then((r) => cb(r.accessToken))
            .catch((e) => setMessage(e instanceof Error ? e.message : String(e)));
        },
        volume: 0.8,
      });

      player.addListener('ready', ({ device_id }: { device_id: string }) => {
        if (cancelled) return;
        setDeviceId(device_id);
        setState('ready');
      });
      player.addListener('not_ready', () => { if (!cancelled) setState('loading'); });
      player.addListener('player_state_changed', (s: any) => {
        if (!cancelled && s) setState(s.paused === false ? 'active' : 'ready');
      });
      player.addListener('authentication_error', ({ message: m }: { message: string }) => {
        if (cancelled) return;
        setState('error');
        setMessage(`Spotify rejected the token (${m}). Disconnect and reconnect Spotify to grant the streaming permission, then try again.`);
      });
      player.addListener('account_error', () => {
        if (cancelled) return;
        setState('error');
        setMessage('Spotify Premium is required for in-browser playback.');
      });
      player.addListener('initialization_error', ({ message: m }: { message: string }) => {
        if (cancelled) return;
        setState('error');
        setMessage(`Player failed to initialize: ${m}`);
      });

      void player.connect();
      playerRef.current = player;
    };

    if (window.Spotify) {
      boot();
    } else {
      window.onSpotifyWebPlaybackSDKReady = boot;
      if (!document.querySelector(`script[src="${SDK_URL}"]`)) {
        const script = document.createElement('script');
        script.src = SDK_URL;
        script.async = true;
        script.onerror = () => { setState('error'); setMessage('Could not load the Spotify player script.'); };
        document.body.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
      playerRef.current?.disconnect();
      playerRef.current = null;
      setDeviceId(null);
      setState('off');
    };
  }, [enabled, spotifyConnected, client]);

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    localStorage.setItem(ENABLED_KEY, String(next));
  };

  const playHere = async () => {
    if (!deviceId) return;
    try {
      await client.useDevice(deviceId);
      setMessage('');
      void refreshStatus();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  if (!spotifyConnected) return null;

  return (
    <section className="panel">
      <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5em' }}>
        Browser player
        <span style={{ fontSize: '0.7em', fontWeight: 'normal', color: 'var(--muted)' }}>
          {state === 'off' && 'off'}
          {state === 'loading' && 'starting…'}
          {state === 'ready' && '● ready as "Harmon Player"'}
          {state === 'active' && '▶ playing here'}
          {state === 'error' && 'error'}
        </span>
      </h2>
      <p style={{ fontSize: '0.85em', color: 'var(--muted)', margin: '0.3em 0 0.8em' }}>
        Makes this tab a Spotify device — no Spotify app needed anywhere. Requires Premium.
      </p>
      <div style={{ display: 'flex', gap: '0.6em' }}>
        <button onClick={toggle}>{enabled ? 'Disable' : 'Enable'}</button>
        {deviceId && state !== 'active' && (
          <button onClick={playHere}>Play here</button>
        )}
      </div>
      {message && (
        <p className="status-err" style={{ marginTop: '0.6em' }}>{message}</p>
      )}
    </section>
  );
}
