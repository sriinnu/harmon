import { useState } from 'react';
import { useClient } from '../lib/DaemonContext';

export function SmartPlay() {
  const { client } = useClient();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const play = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await client.smartPlay(query.trim());
      if (r.success && r.track) {
        setResult(`Now playing on ${r.provider}: ${r.track.artist} — ${r.track.name}`);
      } else if (r.needsAuth) {
        setResult(`${r.provider} needs authentication`);
      } else {
        setResult(r.error || 'No results found');
      }
    } catch (err: unknown) {
      setResult(err instanceof Error ? err.message : 'Playback failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <h3>Smart Play</h3>
      <form onSubmit={play} style={{ display: 'flex', gap: '0.5em' }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Play anything — searches all providers"
          style={{ flex: 1 }}
        />
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? '...' : 'Play'}</button>
      </form>
      {result && <p style={{ marginTop: '0.5em', fontSize: '0.9em' }}>{result}</p>}
    </div>
  );
}
