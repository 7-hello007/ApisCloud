import { useEffect, useState } from 'react';

import { api } from '../api/client';

import { useTheme } from './ThemeProvider';

interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  service: string;
  checks: Record<string, { status: string }>;
}

export function Topbar() {
  const { theme, toggle } = useTheme();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await api.get<HealthResponse>('/health');
        if (!cancelled) {
          setHealth(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setHealth(null);
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    };
    void load();
    const timer = setInterval(() => void load(), 10_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const statusColor =
    health?.status === 'ok'
      ? 'bg-emerald-500'
      : health?.status === 'degraded'
        ? 'bg-amber-500'
        : 'bg-red-500';

  const statusText = health?.status ?? (error ? 'offline' : 'loading');

  return (
    <header className="h-14 shrink-0 border-b border-surface-800 bg-surface-900 flex items-center justify-between px-5">
      <div className="text-sm text-surface-300">
        智能驾驶服务调度平台
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-xs text-surface-300">
          <span className={`inline-block w-2 h-2 rounded-full ${statusColor}`} />
          <span>{statusText}</span>
        </div>

        <button
          type="button"
          onClick={toggle}
          className="text-xs px-3 py-1 rounded border border-surface-700 hover:bg-surface-800 transition-colors"
        >
          {theme === 'dark' ? '浅色' : '深色'}
        </button>
      </div>
    </header>
  );
}
