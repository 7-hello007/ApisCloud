import { Card, Table, type Column } from '../../../components/ui';

interface CommandRow {
  issued_at: string;
  command_id: string;
  vehicle_id: string;
  command_type: string;
  status: string;
}

export function Commands() {
  const columns: Column<CommandRow>[] = [
    {
      key: 'issued_at',
      title: '下发时间',
      render: (row) => new Date(row.issued_at).toLocaleString(),
    },
    { key: 'command_id', title: '指令 ID' },
    { key: 'vehicle_id', title: '车辆' },
    { key: 'command_type', title: '类型' },
    { key: 'status', title: '状态' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-surface-100">调度指令</h1>
        <p className="text-sm text-surface-400 mt-1">
          调度指令审计列表（阶段五接入真实数据）
        </p>
      </div>

      <Card padded={false}>
        <Table<CommandRow>
          columns={columns}
          rows={[]}
          rowKey={(r) => r.command_id}
          empty="阶段五接入 PG dispatch_commands 后显示"
        />
      </Card>
    </div>
  );
}
