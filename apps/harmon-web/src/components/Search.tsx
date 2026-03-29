import { useState } from 'react';
import { useClient } from '../lib/DaemonContext';
import type { HarmonClient } from '../lib/api';

export function Search() {
  const { client, provider } = useClient();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [busy, setBusy] = useState(false);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    try {
      const data = await client.search(provider, query.trim());
      // Normalize — Spotify wraps in tracks.items, others return array
      const items: SearchResultItem[] = data?.tracks?.items || data?.songs || data?.results || (Array.isArray(data) ? data : []);
      setResults(items.slice(0, 20));
    } catch {
      setResults([]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <h3>Search</h3>
      <form onSubmit={search} style={{ display: 'flex', gap: '0.5em', marginBottom: '0.8em' }}>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search tracks..." style={{ flex: 1 }} />
        <button type="submit" disabled={busy}>{busy ? '...' : 'Search'}</button>
      </form>
      {results.length > 0 && (
        <div className="grid">
          {results.map((item, i) => (
            <TrackCard key={item.id || i} track={item} provider={provider} client={client} />
          ))}
        </div>
      )}
    </div>
  );
}

interface SearchResultItem {
  id?: string;
  name?: string;
  title?: string;
  artist?: string;
  artistName?: string;
  artists?: Array<{ name: string }>;
  album?: { name?: string; images?: Array<{ url: string }> } | string;
  albumName?: string;
  imageUrl?: string;
  artwork?: { url?: string };
  uri?: string;
  url?: string;
}

function TrackCard({ track, provider, client }: { track: SearchResultItem; provider: string; client: HarmonClient }) {
  const name = track.name || track.title || '';
  const artist = track.artists?.[0]?.name || track.artist || track.artistName || '';
  const albumObj = typeof track.album === 'object' ? track.album : null;
  const albumStr = typeof track.album === 'string' ? track.album : null;
  const album = albumObj?.name || albumStr || track.albumName || '';
  const imageUrl = albumObj?.images?.[0]?.url || track.imageUrl || track.artwork?.url || '';
  const uri = track.uri || track.url || '';

  const play = async () => {
    try {
      await client.play(provider, { uri });
    } catch {
      /* ignore */
    }
  };

  return (
    <article style={{ border: '1px solid var(--line)', borderRadius: '12px', padding: '0.8em', background: 'rgba(255,255,255,0.5)', display: 'flex', gap: '0.6em' }}>
      {imageUrl && <img src={imageUrl} alt="" style={{ width: 48, height: 48, borderRadius: 6, objectFit: 'cover' }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontWeight: 600, fontSize: '0.9em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</p>
        <p style={{ fontSize: '0.8em', color: 'var(--muted)' }}>{artist}{album ? ` · ${album}` : ''}</p>
      </div>
      <button onClick={play} style={{ fontSize: '0.8em', padding: '0.3em 0.6em', alignSelf: 'center' }}>Play</button>
    </article>
  );
}
