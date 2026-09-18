import { useEffect, useState } from 'react';

import { fetchRecentCommands, type CommandRow } from '../../../api/client';
import { Badge, Card, Table, type Column } from '../../../components/ui';
import type { BadgeVariant } from '../../../components/ui';

function statusVariant(status: string): BadgeVariant {
  if (status === 'acked') return 'success';
  if (status === 'pending') return 'info';
  if (status === 'failed') return 'danger';
  return 'default';
}

function typeVariant(type: string): BadgeVariant {
  if (type === 'dispatch') return 'info';
  if (type === 'charge') return 'warning';
  if (type === 'cancel') return 'danger';
  return 'default';
}

export function Commands() {
  const [commands, setCommands] = useState<CommandRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetchRecentCommands();
        if (!cancelled) {
          setCommands(res.commands);
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

  const columns: Column<CommandRow>[] = [
    {
      key: 'issued_at',
      title: '下发时间',
      render: (row) => new Date(row.issued_at).toLocaleString(),
    },
    {
      key: 'command_id',
      title: '指令 ID',
      render: (row) => <span className="font-mono text-xs">{row.command_id.slice(0, 8)}…</span>,
    },
    { key: 'vehicle_id', title: '车辆' },
    {
      key: 'command_type',
      title: '类型',
      render: (row) => <Badge variant={typeVariant(row.command_type)}>{row.command_type}</Badge>,
    },
    {
      key: 'status',
      title: '状态',
      render: (row) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge>,
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title text-2xl font-semibold text-surface-100">调度指令</h1>
        <p className="text-sm text-surface-400 mt-1.5">调度指令审计列表（共 {commands.length} 条）</p>
      </div>

      {error && (
        <div className="text-xs text-red-300 bg-red-500/[0.07] border border-red-500/20 rounded-lg px-3.5 py-2.5">
          数据加载失败：{error}
        </div>
      )}

      <Card padded={false}>
        <Table<CommandRow>
          columns={columns}
          rows={commands}
          rowKey={(r) => r.command_id}
          loading={loading}
          empty="暂无调度指令。当 dispatch-core 或 charging-scheduler 发命令时会显示。"
        />
      </Card>
    </div>
  );
}
