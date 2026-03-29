import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { HarmonClient, type DaemonStatus } from './api';

type ProviderName = 'spotify' | 'apple' | 'youtube';

interface ClientContextValue {
  client: HarmonClient;
  provider: ProviderName;
  setProvider: (p: ProviderName) => void;
  updateConnection: (url: string, token?: string) => void;
}

interface StatusContextValue {
  status: DaemonStatus | null;
  loading: boolean;
  error: string | null;
  refreshStatus: () => Promise<void>;
}

const ClientCtx = createContext<ClientContextValue | null>(null);
const StatusCtx = createContext<StatusContextValue | null>(null);

export function useClient(): ClientContextValue {
  const ctx = useContext(ClientCtx);
  if (!ctx) throw new Error('useClient must be within DaemonProvider');
  return ctx;
}

export function useStatus(): StatusContextValue {
  const ctx = useContext(StatusCtx);
  if (!ctx) throw new Error('useStatus must be within DaemonProvider');
  return ctx;
}

/** Convenience hook that combines both contexts — use useClient() or useStatus() when only one is needed. */
export function useDaemon() {
  return { ...useClient(), ...useStatus() };
}

export function DaemonProvider({ children }: { children: React.ReactNode }) {
  const [url, setUrl] = useState(localStorage.getItem('harmon-daemon-url') || 'http://127.0.0.1:17373');
  const [token, setToken] = useState(localStorage.getItem('harmon-api-token') || '');
  const [provider, setProvider] = useState<ProviderName>('spotify');
  const [status, setStatus] = useState<DaemonStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const client = useMemo(() => new HarmonClient(url, token || undefined), [url, token]);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await client.getStatus();
      setStatus(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed');
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [client]);

  const updateConnection = useCallback((newUrl: string, newToken?: string) => {
    localStorage.setItem('harmon-daemon-url', newUrl);
    localStorage.setItem('harmon-api-token', newToken || '');
    setUrl(newUrl);
    setToken(newToken || '');
  }, []);

  useEffect(() => { refreshStatus(); }, [refreshStatus]);

  // Poll status every 10s
  useEffect(() => {
    const interval = setInterval(refreshStatus, 10000);
    return () => clearInterval(interval);
  }, [refreshStatus]);

  const clientValue = useMemo<ClientContextValue>(
    () => ({ client, provider, setProvider, updateConnection }),
    [client, provider, updateConnection],
  );

  const statusValue = useMemo<StatusContextValue>(
    () => ({ status, loading, error, refreshStatus }),
    [status, loading, error, refreshStatus],
  );

  return (
    <ClientCtx.Provider value={clientValue}>
      <StatusCtx.Provider value={statusValue}>
        {children}
      </StatusCtx.Provider>
    </ClientCtx.Provider>
  );
}
