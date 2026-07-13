import { useState } from 'react';
import { DaemonProvider, useClient } from './lib/DaemonContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Onboarding, shouldShowOnboarding, resetOnboarding } from './components/Onboarding';
import { Header } from './components/Header';
import { ConnectionPanel } from './components/ConnectionPanel';
import { AuthPanel } from './components/AuthPanel';
import { SmartPlay } from './components/SmartPlay';
import { SessionPanel } from './components/SessionPanel';
import { NowPlaying } from './components/NowPlaying';
import { Search } from './components/Search';

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
  const { updateConnection } = useClient();
  const [showOnboarding, setShowOnboarding] = useState(shouldShowOnboarding());

  const handleOnboardingComplete = (url: string, token: string) => {
    // Push the wizard's URL/token into the live client (also persists to localStorage).
    updateConnection(url, token);
    setShowOnboarding(false);
  };

  return (
    <>
      {showOnboarding && <Onboarding onComplete={handleOnboardingComplete} />}
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
    </>
  );
}
