import { useClient, useStatus } from '../lib/DaemonContext';
import { useState, useEffect } from 'react';
import type { TrackInfo } from '../lib/api';

type ProviderName = 'spotify' | 'apple' | 'youtube';
type Mode = 'auto' | ProviderName;

const PROVIDER_ORDER: ProviderName[] = ['spotify', 'apple', 'youtube'];
const PROVIDER_LABELS: Record<ProviderName, string> = {
  spotify: 'Spotify',
  apple: 'Apple Music',
  youtube: 'YouTube Music',
};

export function NowPlaying() {
  const { client } = useClient();
  const { status } = useStatus();
  const [mode, setMode] = useState<Mode>('auto');
  const [track, setTrack] = useState<TrackInfo | null>(null);
  const [activeProvider, setActiveProvider] = useState<ProviderName | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Stable string key so the poll effect re-runs only when the connected set changes.
  const connectedKey = PROVIDER_ORDER
    .filter(p => status?.providers?.[p]?.connected)
    .join(',');

  useEffect(() => {
    let mounted = true;

    const poll = async () => {
      if (mode === 'auto') {
        // Scan connected providers in stable order; first non-null now-playing wins.
        const candidates = connectedKey ? (connectedKey.split(',') as ProviderName[]) : [];
        for (const p of candidates) {
          try {
            const t = await client.nowPlaying(p);
            if (!mounted) return;
            if (t) {
              setTrack(t);
              setActiveProvider(p);
              setError(null);
              return;
            }
          } catch {
            // Expected while scanning: a provider can be connected for auth but
            // have no active playback runtime — move on to the next one.
          }
        }
        if (mounted) {
          setTrack(null);
          setActiveProvider(null);
        }
      } else {
        try {
          const t = await client.nowPlaying(mode);
          if (mounted) {
            setTrack(t);
            setActiveProvider(mode);
            setError(null);
          }
        } catch (err: unknown) {
          if (mounted) {
            setTrack(null);
            setError(err instanceof Error ? err.message : 'Could not fetch now playing');
          }
        }
      }
    };

    poll();
    const interval = setInterval(poll, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [client, mode, connectedKey]);

  // Controls target the manually-selected provider, or whichever provider Auto found playing.
  const controlTarget = mode === 'auto' ? activeProvider : mode;

  const control = async (action: 'pause' | 'next' | 'prev') => {
    if (!controlTarget) return;
    setError(null);
    try {
      if (action === 'pause') await client.pause(controlTarget);
      else if (action === 'next') await client.next(controlTarget);
      else await client.prev(controlTarget);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : `Could not ${action}`);
    }
  };

  return (
    <div className="panel" style={{ display: 'flex', alignItems: 'center', gap: '1em', flexWrap: 'wrap' }}>
      {track?.imageUrl && <img src={track.imageUrl} alt="" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover' }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3 style={{ margin: 0, textTransform: 'none', letterSpacing: 0, fontSize: '1em', color: 'var(--ink)' }}>
          {track ? `${track.artist} — ${track.name}` : 'No track playing'}
        </h3>
        <p style={{ fontSize: '0.8em', color: 'var(--muted)' }}>
          {track?.album ? `${track.album}` : ''}
          {track && activeProvider ? `${track.album ? ' · ' : ''}on ${PROVIDER_LABELS[activeProvider]}` : ''}
          {!track && mode === 'auto' ? 'Auto — watching all connected providers' : ''}
        </p>
        {error && <p className="status-err" style={{ fontSize: '0.8em', marginTop: '0.2em' }}>{error}</p>}
      </div>
      <select value={mode} onChange={e => setMode(e.target.value as Mode)} title="Which provider to show — Auto finds whichever is playing">
        <option value="auto">Auto</option>
        {PROVIDER_ORDER.map(p => (
          <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
        ))}
      </select>
      <div style={{ display: 'flex', gap: '0.3em' }}>
        <button onClick={() => control('prev')} disabled={!controlTarget} title="Previous">&#x23EE;</button>
        <button onClick={() => control('pause')} disabled={!controlTarget} title="Pause">&#x23F8;</button>
        <button onClick={() => control('next')} disabled={!controlTarget} title="Next">&#x23ED;</button>
      </div>
    </div>
  );
}
