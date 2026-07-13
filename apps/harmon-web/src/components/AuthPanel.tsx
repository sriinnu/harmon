import { useState, useRef, useEffect } from 'react';
import { useDaemon, HARMON_CONNECTION_KEYS } from '../lib/DaemonContext';
import { pollForProviderConnected, type HarmonClient } from '../lib/api';
import { ONBOARDING_KEY } from './Onboarding';

export function AuthPanel() {
  const { client, status, refreshStatus } = useDaemon();
  const providers = status?.providers;

  return (
    <div className="panel">
      <h3>Providers</h3>
      {providers ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5em' }}>
          {Object.entries(providers).map(([name, p]) => (
            <ProviderRow key={name} name={name} status={p} client={client} onRefresh={refreshStatus} />
          ))}
        </div>
      ) : (
        <p style={{ fontSize: '0.85em', color: 'var(--muted)' }}>Waiting for daemon status...</p>
      )}
      <ResetWebApp />
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
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);
  useEffect(() => () => { abortRef.current = true; }, []);

  const connect = async () => {
    setBusy(true);
    setError(null);
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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Connection failed');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setError(null);
    try {
      if (name === 'spotify') await client.spotifyLogout();
      else if (name === 'youtube') await client.youtubeLogout();
      else if (name === 'apple') await client.appleLogout();
      await onRefresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Disconnect failed');
    } finally {
      setBusy(false);
      setConfirmingDisconnect(false);
    }
  };

  const statusColor = status.connected ? 'var(--accent)' : 'var(--muted)';
  const statusText = status.status || (status.connected ? 'ready' : 'not connected');

  return (
    <div style={{ padding: '0.5em 0.6em', border: '1px solid var(--line)', borderRadius: '12px', background: 'rgba(255,255,255,0.5)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.8em' }}>
        <span style={{ fontWeight: 600, flex: 1 }}>{status.name || name}</span>
        <span style={{ fontSize: '0.8em', color: statusColor }}>{statusText}</span>
        {status.connected && !confirmingDisconnect && (
          <button onClick={() => setConfirmingDisconnect(true)} disabled={busy} style={{ fontSize: '0.8em', padding: '0.3em 0.7em' }}>
            Disconnect
          </button>
        )}
        {status.connected && confirmingDisconnect && (
          <>
            <span style={{ fontSize: '0.8em', color: 'var(--muted)' }}>Sign out on daemon?</span>
            <button onClick={disconnect} disabled={busy} className="btn-primary" style={{ fontSize: '0.8em', padding: '0.3em 0.7em' }}>
              {busy ? '...' : 'Confirm'}
            </button>
            <button onClick={() => setConfirmingDisconnect(false)} disabled={busy} style={{ fontSize: '0.8em', padding: '0.3em 0.7em' }}>
              Cancel
            </button>
          </>
        )}
        {!confirmingDisconnect && (
          <button onClick={connect} disabled={busy} style={{ fontSize: '0.8em', padding: '0.3em 0.7em' }}>
            {busy ? '...' : status.connected ? 'Reconnect' : 'Connect'}
          </button>
        )}
      </div>
      {error && <p className="status-err" style={{ marginTop: '0.4em', fontSize: '0.8em' }}>{error}</p>}
    </div>
  );
}

/**
 * Clears every harmon localStorage key (daemon URL, API token, onboarding flag)
 * and reloads so onboarding starts over. Browser-local only — provider auth on
 * the daemon is untouched; use Disconnect for that.
 */
function ResetWebApp() {
  const [confirming, setConfirming] = useState(false);

  const reset = () => {
    for (const key of [...HARMON_CONNECTION_KEYS, ONBOARDING_KEY]) {
      localStorage.removeItem(key);
    }
    location.reload();
  };

  return (
    <div style={{ marginTop: '0.8em', paddingTop: '0.8em', borderTop: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.8em' }}>
        <p style={{ flex: 1, fontSize: '0.8em', color: 'var(--muted)' }}>
          Disconnect signs a provider out on the daemon. Reset only clears this browser app
          (saved daemon URL, token, and setup state) and re-runs onboarding — daemon auth stays intact.
        </p>
        {!confirming ? (
          <button onClick={() => setConfirming(true)} style={{ fontSize: '0.8em', padding: '0.3em 0.7em', whiteSpace: 'nowrap' }}>
            Reset web app
          </button>
        ) : (
          <>
            <span style={{ fontSize: '0.8em', color: 'var(--muted)', whiteSpace: 'nowrap' }}>Clear this browser app?</span>
            <button onClick={reset} className="btn-primary" style={{ fontSize: '0.8em', padding: '0.3em 0.7em' }}>Confirm</button>
            <button onClick={() => setConfirming(false)} style={{ fontSize: '0.8em', padding: '0.3em 0.7em' }}>Cancel</button>
          </>
        )}
      </div>
    </div>
  );
}
