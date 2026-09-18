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
      ? 'bg-emerald-400'
      : health?.status === 'degraded'
        ? 'bg-amber-400'
        : 'bg-red-400';

  const statusText = health?.status ?? (error ? 'offline' : 'loading');

  return (
    <header className="h-16 shrink-0 border-b border-surface-800/80 bg-surface-900/55 backdrop-blur-2xl flex items-center justify-between px-5 md:px-7">
      <div className="flex items-center gap-3">
        <div className="w-1 h-5 rounded-full bg-brand-400 shadow-[0_0_12px_rgb(56_189_248_/_0.6)]" />
        <div>
          <div className="text-sm font-medium text-surface-100">智能驾驶服务调度平台</div>
          <div className="hidden sm:block text-[10px] text-surface-500 font-mono tracking-wide">INTELLIGENT FLEET ORCHESTRATION</div>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-surface-800/45 border border-surface-700/60 text-[11px] text-surface-300 font-mono">
          <span className={`w-1.5 h-1.5 rounded-full ${statusColor} shadow-[0_0_8px_currentColor]`} />
          <span className="capitalize">{statusText}</span>
        </div>

        <button
          type="button"
          onClick={toggle}
          className="text-xs px-3 py-1.5 rounded-lg border border-surface-700/70 bg-surface-800/35 text-surface-300 hover:text-surface-100 hover:bg-surface-800/70 transition-all"
        >
          {theme === 'dark' ? '浅色' : '深色'}
        </button>
      </div>
    </header>
  );
}
