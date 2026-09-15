import { useEffect, useState } from 'react';

import { fetchRecentAlerts, type AlertRow } from '../../../api/client';
import { Badge, Card, Table, type Column } from '../../../components/ui';
import type { BadgeVariant } from '../../../components/ui';

function levelVariant(level: string): BadgeVariant {
  if (level === 'critical') return 'danger';
  if (level === 'error') return 'danger';
  if (level === 'warning') return 'warning';
  if (level === 'info') return 'info';
  return 'default';
}

export function Alerts() {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetchRecentAlerts();
        if (!cancelled) {
          setAlerts(res.alerts);
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

  const columns: Column<AlertRow>[] = [
    {
      key: 'created_at',
      title: '时间',
      render: (row) => new Date(row.created_at).toLocaleTimeString(),
    },
    { key: 'vehicle_id', title: '车辆' },
    { key: 'alert_type', title: '类型' },
    {
      key: 'level',
      title: '级别',
      render: (row) => <Badge variant={levelVariant(row.level)}>{row.level}</Badge>,
    },
    { key: 'message', title: '消息' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-surface-100">告警</h1>
        <p className="text-sm text-surface-400 mt-1">最近告警列表（共 {alerts.length} 条）</p>
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">
          数据加载失败：{error}
        </div>
      )}

      <Card padded={false}>
        <Table<AlertRow>
          columns={columns}
          rows={alerts}
          rowKey={(r, i) => `${r.created_at}-${i}`}
          loading={loading}
          empty="暂无告警。当 geofence 或 anomaly 检测到异常时会显示。"
        />
      </Card>
    </div>
  );
}
