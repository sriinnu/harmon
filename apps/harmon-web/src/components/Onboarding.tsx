import { useState, useRef, useEffect } from 'react';
import { HarmonClient } from '../lib/api';

const ONBOARDING_KEY = 'harmon-onboarding-complete';

export function shouldShowOnboarding(): boolean {
  return localStorage.getItem(ONBOARDING_KEY) !== 'true';
}

export function resetOnboarding(): void {
  localStorage.removeItem(ONBOARDING_KEY);
}

interface Props {
  onComplete: (url: string, token: string) => void;
}

export function Onboarding({ onComplete }: Props) {
  const abortRef = useRef(false);
  useEffect(() => () => { abortRef.current = true; }, []);

  const [step, setStep] = useState(0);
  const [url, setUrl] = useState('http://127.0.0.1:17373');
  const [token, setToken] = useState('');
  const [connected, setConnected] = useState<string[]>([]);
  const [status, setStatus] = useState('');

  const finish = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    onComplete(url, token);
  };

  const dots = (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: '1.5em' }}>
      {[0,1,2,3].map(i => (
        <span key={i} style={{
          width: 10, height: 10, borderRadius: '50%',
          background: i === step ? 'var(--accent)' : i < step ? 'rgba(202,90,46,0.4)' : 'var(--line)',
        }} />
      ))}
    </div>
  );

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 1000,
    background: 'rgba(22,33,47,0.6)', backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1em',
  };

  const card: React.CSSProperties = {
    background: 'var(--panel)', backdropFilter: 'blur(20px)',
    borderRadius: 24, padding: '2em 2.5em', maxWidth: 520, width: '100%',
    boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
  };

  const nav: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: '0.8em', marginTop: '1.5em' };

  // Step 0: Welcome
  if (step === 0) return (
    <div style={overlay}>
      <div style={card}>
        {dots}
        <h2 style={{ textAlign: 'center', marginBottom: '1em' }}>Welcome to Harmon</h2>
        <p>Policy-driven music sessions across Spotify, Apple Music, and YouTube Music.</p>
        <p style={{ color: 'var(--muted)', fontSize: '0.9em', marginTop: '1em' }}>This takes about 2 minutes.</p>
        <div style={nav}>
          <button onClick={finish}>Skip</button>
          <button className="btn-primary" onClick={() => setStep(1)}>Get started</button>
        </div>
      </div>
    </div>
  );

  // Step 1: Connect
  if (step === 1) {
    const test = async () => {
      setStatus('Testing...');
      try {
        const client = new HarmonClient(url, token || undefined);
        const s = await client.getStatus();
        if (s.isRunning) {
          setStatus('Connected!');
          const prov = s.providers ? Object.entries(s.providers).filter(([,v]) => v.connected).map(([k]) => k) : [];
          setConnected(prov);
          setTimeout(() => setStep(2), 600);
        } else {
          setStatus('Daemon not running');
        }
      } catch (e: unknown) { setStatus(e instanceof Error ? e.message : 'Connection failed'); }
    };

    return (
      <div style={overlay}>
        <div style={card}>
          {dots}
          <h2 style={{ textAlign: 'center', marginBottom: '1em' }}>Connect to Daemon</h2>
          <label style={{ fontSize: '0.85em', display: 'block', marginBottom: '0.3em' }}>Daemon URL</label>
          <input value={url} onChange={e => setUrl(e.target.value)} style={{ width: '100%', marginBottom: '0.8em' }} />
          <label style={{ fontSize: '0.85em', display: 'block', marginBottom: '0.3em' }}>API Token <span style={{ color: 'var(--muted)' }}>(optional)</span></label>
          <input type="password" value={token} onChange={e => setToken(e.target.value)} style={{ width: '100%' }} />
          {status && <p style={{ marginTop: '0.8em', fontSize: '0.9em' }}>{status}</p>}
          <div style={nav}>
            <button onClick={() => setStep(0)}>Back</button>
            <button className="btn-primary" onClick={test}>Test Connection</button>
          </div>
        </div>
      </div>
    );
  }

  // Step 2: Providers
  if (step === 2) {
    const connectProvider = async (name: string) => {
      const client = new HarmonClient(url, token || undefined);
      try {
        if (name === 'spotify') {
          const { url: authUrl } = await client.spotifyLogin();
          window.open(authUrl, '_blank', 'noopener,noreferrer');
          setStatus(`Opening ${name} login...`);
          // Poll
          for (let i = 0; i < 30; i++) {
            if (abortRef.current) return;
            await new Promise(r => setTimeout(r, 2000));
            if (abortRef.current) return;
            const s = await client.getStatus();
            if (s.providers?.[name]?.connected) {
              setConnected(prev => [...new Set([...prev, name])]);
              setStatus(`${name} connected!`);
              return;
            }
          }
        } else if (name === 'youtube') {
          const { url: authUrl } = await client.youtubeLogin();
          window.open(authUrl, '_blank', 'noopener,noreferrer');
          setStatus(`Opening ${name} login...`);
          for (let i = 0; i < 30; i++) {
            if (abortRef.current) return;
            await new Promise(r => setTimeout(r, 2000));
            if (abortRef.current) return;
            const s = await client.getStatus();
            if (s.providers?.[name]?.connected) {
              setConnected(prev => [...new Set([...prev, name])]);
              setStatus(`${name} connected!`);
              return;
            }
          }
        } else if (name === 'apple') {
          const t = prompt('Paste your Apple Music user token:');
          if (t) {
            await client.appleSetToken(t);
            setConnected(prev => [...new Set([...prev, name])]);
            setStatus('Apple Music connected!');
          }
        }
      } catch (e: unknown) { setStatus(e instanceof Error ? e.message : 'Provider connection failed'); }
    };

    return (
      <div style={overlay}>
        <div style={card}>
          {dots}
          <h2 style={{ textAlign: 'center', marginBottom: '1em' }}>Authenticate Providers</h2>
          <p style={{ marginBottom: '1em' }}>Connect at least one to start listening.</p>
          {['spotify', 'youtube', 'apple'].map(p => (
            <div key={p} style={{ display: 'flex', alignItems: 'center', gap: '0.8em', padding: '0.6em', border: '1px solid var(--line)', borderRadius: 12, marginBottom: '0.5em', background: 'rgba(255,255,255,0.5)' }}>
              <span style={{ fontWeight: 600, flex: 1, textTransform: 'capitalize' }}>{p === 'youtube' ? 'YouTube Music' : p === 'apple' ? 'Apple Music' : 'Spotify'}</span>
              <span style={{ fontSize: '0.8em', color: connected.includes(p) ? '#2e7d32' : 'var(--muted)' }}>
                {connected.includes(p) ? 'Connected' : 'Not connected'}
              </span>
              <button onClick={() => connectProvider(p)} style={{ fontSize: '0.8em', padding: '0.3em 0.6em' }}>
                {connected.includes(p) ? 'Reconnect' : 'Connect'}
              </button>
            </div>
          ))}
          {status && <p style={{ marginTop: '0.5em', fontSize: '0.85em' }}>{status}</p>}
          <div style={nav}>
            <button onClick={() => setStep(1)}>Back</button>
            <button className="btn-primary" onClick={() => setStep(3)}>{connected.length > 0 ? 'Continue' : 'Skip'}</button>
          </div>
        </div>
      </div>
    );
  }

  // Step 3: First play
  return <PlayStep url={url} token={token} dots={dots} overlay={overlay} card={card} nav={nav} setStep={setStep} finish={finish} />;
}

/** Extracted to its own component so useState calls are unconditional. */
function PlayStep({ url, token, dots, overlay, card, nav, setStep, finish }: {
  url: string; token: string;
  dots: React.ReactNode; overlay: React.CSSProperties; card: React.CSSProperties; nav: React.CSSProperties;
  setStep: (s: number) => void; finish: () => void;
}) {
  const [playQuery, setPlayQuery] = useState('');
  const [playResult, setPlayResult] = useState('');

  const tryPlay = async () => {
    if (!playQuery.trim()) return;
    setPlayResult('Searching...');
    try {
      const client = new HarmonClient(url, token || undefined);
      const r = await client.smartPlay(playQuery.trim());
      if (r.success && r.track) {
        setPlayResult(`Playing: ${r.track.artist} \u2014 ${r.track.name} on ${r.provider}`);
      } else {
        setPlayResult(r.error || 'No results');
      }
    } catch (e: unknown) { setPlayResult(e instanceof Error ? e.message : 'Playback failed'); }
  };

  return (
    <div style={overlay}>
      <div style={card}>
        {dots}
        <h2 style={{ textAlign: 'center', marginBottom: '1em' }}>Play Something</h2>
        <p style={{ marginBottom: '1em' }}>Try a search — it finds music across all your connected providers.</p>
        <div style={{ display: 'flex', gap: '0.5em' }}>
          <input value={playQuery} onChange={e => setPlayQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && tryPlay()} placeholder="e.g. Bohemian Rhapsody" style={{ flex: 1 }} />
          <button className="btn-primary" onClick={tryPlay}>Play</button>
        </div>
        {playResult && <p style={{ marginTop: '0.8em', fontSize: '0.9em' }}>{playResult}</p>}
        <div style={nav}>
          <button onClick={() => setStep(2)}>Back</button>
          <button className="btn-primary" onClick={finish}>Finish</button>
        </div>
      </div>
    </div>
  );
}
