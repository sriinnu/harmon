import { useState } from 'react';
import { DaemonProvider, useDaemon } from './lib/DaemonContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Onboarding, shouldShowOnboarding, resetOnboarding, completeOnboarding } from './components/Onboarding';
import { Header } from './components/Header';
import { ConnectionPanel } from './components/ConnectionPanel';
import { AuthPanel } from './components/AuthPanel';
import { SmartPlay } from './components/SmartPlay';
import { SessionPanel } from './components/SessionPanel';
import { NowPlaying } from './components/NowPlaying';
import { Search } from './components/Search';
import { SpotifyWebPlayer } from './components/SpotifyWebPlayer';
import { AppleWebPlayer } from './components/AppleWebPlayer';

export function App() {
  return (
    <ErrorBoundary>
      <DaemonProvider>
        <AppShell />
      </DaemonProvider>
    </ErrorBoundary>
  );
}

function AppShell() {
  const { status, updateConnection, refreshStatus } = useDaemon();
  const [showOnboarding, setShowOnboarding] = useState(shouldShowOnboarding());
  const [showSettings, setShowSettings] = useState(false);

  // The daemon is the source of truth: a working authenticated connection
  // means setup is done, whatever the onboarding flag says. This also stops
  // the wizard from re-asking for tokens after a cleared flag.
  if (showOnboarding && status?.isRunning) {
    completeOnboarding();
    setShowOnboarding(false);
  }

  const handleOnboardingComplete = (url: string, token: string) => {
    // Push the wizard's URL/token into the live client (also persists to localStorage).
    updateConnection(url, token);
    setShowOnboarding(false);
    // Refresh immediately so already-connected providers show up without
    // waiting for the next 10s status poll. If the URL/token changed, the
    // client-change effect in DaemonProvider refreshes again with the new client.
    void refreshStatus();
  };

  const connected = Boolean(status?.isRunning);
  const connectedProviders = Object.entries(status?.providers ?? {})
    .filter(([, p]) => (p as { connected?: boolean })?.connected)
    .map(([name]) => name);

  return (
    <>
      {showOnboarding && <Onboarding onComplete={handleOnboardingComplete} />}
      <div className="shell">
        <Header />
        {connected ? (
          <div className="panel" style={{ display: 'flex', alignItems: 'center', gap: '0.6em', padding: '0.6em 1em' }}>
            <span aria-hidden style={{ color: 'var(--ok, #3a8c4c)' }}>●</span>
            <span style={{ fontSize: '0.9em' }}>
              Connected · {connectedProviders.length > 0 ? connectedProviders.join(', ') : 'no providers yet'}
            </span>
            <button
              onClick={() => setShowSettings((v) => !v)}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', textDecoration: 'underline' }}
            >
              {showSettings ? 'Hide settings' : 'Settings'}
            </button>
          </div>
        ) : (
          // Not connected: connection setup is the main event.
          <ConnectionPanel />
        )}
        {(showSettings || !connected) && (
          <>
            {connected && <ConnectionPanel />}
            <AuthPanel />
          </>
        )}
        <NowPlaying />
        <SpotifyWebPlayer />
        <AppleWebPlayer />
        <SmartPlay />
        <SessionPanel />
        <Search />
        <footer style={{ textAlign: 'center', padding: '2em 0 1em', fontSize: '0.8em', color: 'var(--muted)' }}>
          <button onClick={() => { resetOnboarding(); location.reload(); }} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', textDecoration: 'underline', fontSize: '1em' }}>
            Re-run setup wizard
          </button>
        </footer>
      </div>
    </>
  );
}
