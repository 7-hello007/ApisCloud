import { Card, Table, type Column } from '../../../components/ui';

interface VehicleRow {
  vehicle_id: string;
  status: string;
  battery: number;
  lat: number;
  lng: number;
}

export function Vehicles() {
  const columns: Column<VehicleRow>[] = [
    { key: 'vehicle_id', title: '车辆 ID' },
    { key: 'status', title: '状态' },
    {
      key: 'battery',
      title: '电量',
      align: 'right',
      render: (row) => `${row.battery}%`,
    },
    {
      key: 'lat',
      title: '纬度',
      align: 'right',
      render: (row) => row.lat.toFixed(4),
    },
    {
      key: 'lng',
      title: '经度',
      align: 'right',
      render: (row) => row.lng.toFixed(4),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-surface-100">车辆</h1>
        <p className="text-sm text-surface-400 mt-1">
          实时车辆列表（阶段五接入真实数据）
        </p>
      </div>

      <Card padded={false}>
        <Table<VehicleRow>
          columns={columns}
          rows={[]}
          rowKey={(r) => r.vehicle_id}
          empty="阶段五接入 Redis vehicles:active 后显示"
        />
      </Card>
    </div>
  );
}
