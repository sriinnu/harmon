import { useDaemon } from '../lib/DaemonContext';
import { useState } from 'react';

export function SessionPanel() {
  const { client, status, provider, refreshStatus } = useDaemon();
  const session = status?.session;
  const [mode, setMode] = useState('focus');
  const [msg, setMsg] = useState('');

  const start = async () => {
    setMsg('Starting...');
    try {
      const r = await client.sessionStart(provider, mode) as { sessionId?: string };
      setMsg(`Session active: ${r.sessionId || 'running'}`);
      refreshStatus();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Failed to start session');
    }
  };

  const stop = async () => {
    try {
      await client.sessionStop();
      setMsg('Stopped');
      refreshStatus();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Failed to stop session');
    }
  };

  const nudge = async (dir: 'calmer' | 'sharper') => {
    try {
      await client.sessionNudge(dir);
      setMsg(`Nudged ${dir}`);
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Nudge failed');
    }
  };

  const active = !!session?.isActive;

  return (
    <div className="panel">
      <h3>Session</h3>
      <div style={{ display: 'flex', gap: '0.5em', flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={mode} onChange={e => setMode(e.target.value)} disabled={active}>
          {['focus', 'relax', 'energize', 'meditate', 'workout'].map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <button className="btn-primary" onClick={start} disabled={active}>Start</button>
        <button onClick={() => nudge('calmer')} disabled={!active}>Calmer</button>
        <button onClick={() => nudge('sharper')} disabled={!active}>Sharper</button>
        <button className="btn-danger" onClick={stop} disabled={!active}>Stop</button>
      </div>
      {msg && <p style={{ marginTop: '0.5em', fontSize: '0.85em', color: 'var(--muted)' }}>{msg}</p>}
      {session?.isActive && session.currentTrack && (
        <p style={{ marginTop: '0.5em', fontWeight: 600 }}>
          {session.currentTrack.artist} — {session.currentTrack.name}
        </p>
      )}
    </div>
  );
}
