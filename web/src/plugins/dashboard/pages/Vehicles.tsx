import { useEffect, useState } from 'react';

import { fetchActiveVehicles, type VehicleRow } from '../../../api/client';
import { Card, Table, type Column } from '../../../components/ui';

/**
 * 转数字，兼容 pg 返回的字符串 / null / undefined。
 */
function toNum(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function Vehicles() {
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetchActiveVehicles();
        if (!cancelled) {
          setVehicles(res.vehicles);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    const timer = setInterval(() => void load(), 5_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const columns: Column<VehicleRow>[] = [
    { key: 'vehicle_id', title: '车辆 ID' },
    {
      key: 'status',
      title: '状态',
      render: (row) => (
        <span
          className={
            row.status === 'running'
              ? 'text-emerald-400'
              : row.status === 'idle'
                ? 'text-blue-400'
                : row.status === 'charging'
                  ? 'text-amber-400'
                  : 'text-surface-400'
          }
        >
          {row.status}
        </span>
      ),
    },
    {
      key: 'battery',
      title: '电量',
      align: 'right',
      render: (row) => {
        const battery = toNum(row.battery);
        if (battery === null) return '—';
        const color =
          battery < 20 ? 'text-red-400' : battery < 50 ? 'text-amber-400' : 'text-emerald-400';
        return <span className={color}>{battery.toFixed(1)}%</span>;
      },
    },
    {
      key: 'speed',
      title: '速度',
      align: 'right',
      render: (row) => {
        const speed = toNum(row.speed);
        return speed === null ? '—' : `${speed.toFixed(1)} km/h`;
      },
    },
    {
      key: 'lat',
      title: '纬度',
      align: 'right',
      render: (row) => {
        const lat = toNum(row.lat);
        return lat === null ? '—' : lat.toFixed(4);
      },
    },
    {
      key: 'lng',
      title: '经度',
      align: 'right',
      render: (row) => {
        const lng = toNum(row.lng);
        return lng === null ? '—' : lng.toFixed(4);
      },
    },
    {
      key: 'updated_at',
      title: '更新时间',
      render: (row) => (row.updated_at ? new Date(row.updated_at).toLocaleTimeString() : '—'),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title text-2xl font-semibold text-surface-100">车辆</h1>
          <p className="text-sm text-surface-400 mt-1.5">实时车辆列表（共 {vehicles.length} 辆）</p>
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-300 bg-red-500/[0.07] border border-red-500/20 rounded-lg px-3.5 py-2.5">
          数据加载失败：{error}
        </div>
      )}

      <Card padded={false}>
        <Table<VehicleRow>
          columns={columns}
          rows={vehicles}
          rowKey={(r) => r.vehicle_id}
          loading={loading}
          empty="暂无活跃车辆。请确保 simulator 和 ingest 已启动。"
        />
      </Card>
    </div>
  );
}
