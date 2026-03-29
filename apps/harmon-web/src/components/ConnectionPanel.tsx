import { useState } from 'react';
import { useDaemon } from '../lib/DaemonContext';

export function ConnectionPanel() {
  const { status, loading, error, provider, setProvider, updateConnection, refreshStatus } = useDaemon();
  const [url, setUrl] = useState(localStorage.getItem('harmon-daemon-url') || 'http://127.0.0.1:17373');
  const [token, setToken] = useState(localStorage.getItem('harmon-api-token') || '');

  const handleConnect = () => {
    updateConnection(url, token);
    refreshStatus();
  };

  return (
    <div className="panel">
      <h3>Connection</h3>
      <div style={{ display: 'flex', gap: '0.5em', flexWrap: 'wrap', alignItems: 'end' }}>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <label style={{ fontSize: '0.8em', display: 'block', marginBottom: '0.2em' }}>Daemon URL</label>
          <input value={url} onChange={e => setUrl(e.target.value)} style={{ width: '100%' }} />
        </div>
        <div style={{ flex: 0.5, minWidth: '120px' }}>
          <label style={{ fontSize: '0.8em', display: 'block', marginBottom: '0.2em' }}>API Token</label>
          <input type="password" value={token} onChange={e => setToken(e.target.value)} style={{ width: '100%' }} />
        </div>
        <select value={provider} onChange={e => setProvider(e.target.value as 'spotify' | 'apple' | 'youtube')}>
          <option value="spotify">Spotify</option>
          <option value="apple">Apple Music</option>
          <option value="youtube">YouTube Music</option>
        </select>
        <button onClick={handleConnect}>Connect</button>
        <button onClick={refreshStatus} disabled={loading}>{loading ? '...' : 'Refresh'}</button>
      </div>
      {error && <p className="status-err" style={{ marginTop: '0.5em', fontSize: '0.85em' }}>{error}</p>}
      {status && <p className="status-ok" style={{ marginTop: '0.5em', fontSize: '0.85em' }}>Connected — v{status.version}</p>}
    </div>
  );
}
