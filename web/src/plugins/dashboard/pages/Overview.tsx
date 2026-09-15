import { useEffect, useState } from 'react';

import {
  fetchActiveVehicles,
  fetchRecentAlerts,
  fetchRecentCommands,
  type AlertRow,
  type CommandRow,
  type VehicleRow,
} from '../../../api/client';
import { Card } from '../../../components/ui';

interface Stats {
  vehicles: number;
  lowBattery: number;
  alerts: number;
  commands: number;
}

function toNum(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function Overview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [vehiclesRes, alertsRes, commandsRes] = await Promise.all([
          fetchActiveVehicles().catch(() => ({ count: 0, vehicles: [] as VehicleRow[] })),
          fetchRecentAlerts().catch(() => ({ count: 0, alerts: [] as AlertRow[] })),
          fetchRecentCommands().catch(() => ({ count: 0, commands: [] as CommandRow[] })),
        ]);

        if (cancelled) return;

        const lowBattery = vehiclesRes.vehicles.filter((v) => {
          const b = toNum(v.battery);
          return b !== null && b < 20;
        }).length;

        setStats({
          vehicles: vehiclesRes.count,
          lowBattery,
          alerts: alertsRes.count,
          commands: commandsRes.count,
        });
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    const timer = setInterval(() => void load(), 10_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-surface-100">总览</h1>
        <p className="text-sm text-surface-400 mt-1">智能驾驶服务调度平台运行状态</p>
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">
          数据加载失败：{error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card title="车辆总数" subtitle="vehicles:active">
          <div className="text-3xl font-semibold text-surface-100">
            {loading ? '—' : (stats?.vehicles ?? 0)}
          </div>
          <div className="text-xs text-surface-500 mt-1">
            {loading ? '加载中…' : `低电量 ${stats?.lowBattery ?? 0} 辆`}
          </div>
        </Card>
        <Card title="低电量车辆" subtitle="battery < 20%">
          <div className="text-3xl font-semibold text-amber-400">
            {loading ? '—' : (stats?.lowBattery ?? 0)}
          </div>
          <div className="text-xs text-surface-500 mt-1">需要充电调度</div>
        </Card>
        <Card title="最近告警" subtitle="alerts:recent">
          <div className="text-3xl font-semibold text-surface-100">
            {loading ? '—' : (stats?.alerts ?? 0)}
          </div>
          <div className="text-xs text-surface-500 mt-1">最近 100 条</div>
        </Card>
        <Card title="调度指令" subtitle="dispatch_commands">
          <div className="text-3xl font-semibold text-surface-100">
            {loading ? '—' : (stats?.commands ?? 0)}
          </div>
          <div className="text-xs text-surface-500 mt-1">最近 100 条</div>
        </Card>
      </div>

      <Card title="地图占位" subtitle="阶段六接入真实地图">
        <div className="h-80 flex items-center justify-center bg-surface-950 border border-surface-800 rounded text-surface-500">
          🗺️ 地图将在阶段六接入
        </div>
      </Card>
    </div>
  );
}
