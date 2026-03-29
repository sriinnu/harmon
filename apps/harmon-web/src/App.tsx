import { useState } from 'react';
import { DaemonProvider } from './lib/DaemonContext';
import { Onboarding, shouldShowOnboarding, resetOnboarding } from './components/Onboarding';
import { Header } from './components/Header';
import { ConnectionPanel } from './components/ConnectionPanel';
import { AuthPanel } from './components/AuthPanel';
import { SmartPlay } from './components/SmartPlay';
import { SessionPanel } from './components/SessionPanel';
import { NowPlaying } from './components/NowPlaying';
import { Search } from './components/Search';

export function App() {
  const [showOnboarding, setShowOnboarding] = useState(shouldShowOnboarding());
  const [daemonUrl, setDaemonUrl] = useState(localStorage.getItem('harmon-daemon-url') || 'http://127.0.0.1:17373');
  const [apiToken, setApiToken] = useState(localStorage.getItem('harmon-api-token') || '');

  const handleOnboardingComplete = (url: string, token: string) => {
    setDaemonUrl(url);
    setApiToken(token);
    localStorage.setItem('harmon-daemon-url', url);
    localStorage.setItem('harmon-api-token', token);
    setShowOnboarding(false);
  };

  return (
    <>
      {showOnboarding && <Onboarding onComplete={handleOnboardingComplete} />}
      <DaemonProvider>
        <div className="shell">
          <Header />
          <ConnectionPanel />
          <AuthPanel />
          <NowPlaying />
          <SmartPlay />
          <SessionPanel />
          <Search />
          <footer style={{ textAlign: 'center', padding: '2em 0 1em', fontSize: '0.8em', color: 'var(--muted)' }}>
            <button onClick={() => { resetOnboarding(); location.reload(); }} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', textDecoration: 'underline', fontSize: '1em' }}>
              Re-run setup wizard
            </button>
          </footer>
        </div>
      </DaemonProvider>
    </>
  );
}
