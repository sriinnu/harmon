import { useState, useRef, useEffect } from 'react';
import { useDaemon } from '../lib/DaemonContext';
import { pollForProviderConnected, type HarmonClient } from '../lib/api';

export function AuthPanel() {
  const { client, status, refreshStatus } = useDaemon();
  const providers = status?.providers;
  if (!providers) return null;

  return (
    <div className="panel">
      <h3>Providers</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5em' }}>
        {Object.entries(providers).map(([name, p]) => (
          <ProviderRow key={name} name={name} status={p} client={client} onRefresh={refreshStatus} />
        ))}
      </div>
    </div>
  );
}

interface ProviderRowProps {
  name: string;
  status: { connected: boolean; name?: string; status?: string };
  client: HarmonClient;
  onRefresh: () => Promise<void>;
}

function ProviderRow({ name, status, client, onRefresh }: ProviderRowProps) {
  const [busy, setBusy] = useState(false);
  const abortRef = useRef(false);
  useEffect(() => () => { abortRef.current = true; }, []);

  const connect = async () => {
    setBusy(true);
    try {
      if (name === 'spotify' || name === 'youtube') {
        const { url } = name === 'spotify' ? await client.spotifyLogin() : await client.youtubeLogin();
        window.open(url, '_blank', 'noopener,noreferrer');
        // Poll for completion — exits as soon as the provider connects
        await pollForProviderConnected(client, name, () => abortRef.current);
        if (abortRef.current) return;
        await onRefresh();
      } else if (name === 'apple') {
        const token = prompt('Paste your Apple Music user token:');
        if (token) await client.appleSetToken(token);
        await onRefresh();
      }
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  const statusColor = status.connected ? 'var(--accent)' : 'var(--muted)';
  const statusText = status.status || (status.connected ? 'ready' : 'not connected');

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8em', padding: '0.5em 0.6em', border: '1px solid var(--line)', borderRadius: '12px', background: 'rgba(255,255,255,0.5)' }}>
      <span style={{ fontWeight: 600, flex: 1 }}>{status.name || name}</span>
      <span style={{ fontSize: '0.8em', color: statusColor }}>{statusText}</span>
      <button onClick={connect} disabled={busy} style={{ fontSize: '0.8em', padding: '0.3em 0.7em' }}>
        {busy ? '...' : status.connected ? 'Reconnect' : 'Connect'}
      </button>
    </div>
  );
}
