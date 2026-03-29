import { useClient } from '../lib/DaemonContext';
import { useState, useEffect } from 'react';
import type { TrackInfo } from '../lib/api';

export function NowPlaying() {
  const { client, provider } = useClient();
  const [track, setTrack] = useState<TrackInfo | null>(null);

  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      try {
        const t = await client.nowPlaying(provider);
        if (mounted) setTrack(t);
      } catch {
        /* ignore */
      }
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [client, provider]);

  const control = async (action: 'pause' | 'next' | 'prev') => {
    try {
      if (action === 'pause') await client.pause(provider);
      else if (action === 'next') await client.next(provider);
      else await client.prev(provider);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="panel" style={{ display: 'flex', alignItems: 'center', gap: '1em' }}>
      {track?.imageUrl && <img src={track.imageUrl} alt="" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover' }} />}
      <div style={{ flex: 1 }}>
        <h3 style={{ margin: 0, textTransform: 'none', letterSpacing: 0, fontSize: '1em', color: 'var(--ink)' }}>
          {track ? `${track.artist} — ${track.name}` : 'No track playing'}
        </h3>
        {track?.album && <p style={{ fontSize: '0.8em', color: 'var(--muted)' }}>{track.album}</p>}
      </div>
      <div style={{ display: 'flex', gap: '0.3em' }}>
        <button onClick={() => control('prev')} title="Previous">&#x23EE;</button>
        <button onClick={() => control('pause')} title="Pause">&#x23F8;</button>
        <button onClick={() => control('next')} title="Next">&#x23ED;</button>
      </div>
    </div>
  );
}
