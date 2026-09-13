import { Card, Table, type Column } from '../../../components/ui';

interface AlertRow {
  ts: number;
  vehicle_id: string;
  alert_type: string;
  level: string;
  message: string;
}

export function Alerts() {
  const columns: Column<AlertRow>[] = [
    {
      key: 'ts',
      title: '时间',
      render: (row) => new Date(row.ts).toLocaleTimeString(),
    },
    { key: 'vehicle_id', title: '车辆' },
    { key: 'alert_type', title: '类型' },
    { key: 'level', title: '级别' },
    { key: 'message', title: '消息' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-surface-100">告警</h1>
        <p className="text-sm text-surface-400 mt-1">
          最近告警列表（阶段五接入真实数据）
        </p>
      </div>

      <Card padded={false}>
        <Table<AlertRow>
          columns={columns}
          rows={[]}
          rowKey={(r, i) => `${r.ts}-${i}`}
          empty="阶段五接入 Redis alerts:recent 后显示"
        />
      </Card>
    </div>
  );
}
