import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { HarmonClient, type DaemonStatus } from './api';

interface DaemonContextValue {
  client: HarmonClient;
  status: DaemonStatus | null;
  loading: boolean;
  error: string | null;
  provider: 'spotify' | 'apple' | 'youtube';
  setProvider: (p: 'spotify' | 'apple' | 'youtube') => void;
  refreshStatus: () => Promise<void>;
  updateConnection: (url: string, token?: string) => void;
}

const DaemonCtx = createContext<DaemonContextValue | null>(null);

export function useDaemon(): DaemonContextValue {
  const ctx = useContext(DaemonCtx);
  if (!ctx) throw new Error('useDaemon must be used within DaemonProvider');
  return ctx;
}

export function DaemonProvider({ children }: { children: React.ReactNode }) {
  const [url, setUrl] = useState(localStorage.getItem('harmon-daemon-url') || 'http://127.0.0.1:17373');
  const [token, setToken] = useState(localStorage.getItem('harmon-api-token') || '');
  const [provider, setProvider] = useState<'spotify' | 'apple' | 'youtube'>('spotify');
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

  return (
    <DaemonCtx.Provider value={{ client, status, loading, error, provider, setProvider, refreshStatus, updateConnection }}>
      {children}
    </DaemonCtx.Provider>
  );
}
