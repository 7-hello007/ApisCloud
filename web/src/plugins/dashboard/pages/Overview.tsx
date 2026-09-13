import { Card } from '../../../components/ui';

export function Overview() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-surface-100">总览</h1>
        <p className="text-sm text-surface-400 mt-1">
          智能驾驶服务调度平台运行状态
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card title="车辆总数" subtitle="vehicles:active">
          <div className="text-3xl font-semibold text-surface-100">—</div>
          <div className="text-xs text-surface-500 mt-1">阶段五接入数据</div>
        </Card>
        <Card title="在线车辆" subtitle="status = idle/running">
          <div className="text-3xl font-semibold text-surface-100">—</div>
          <div className="text-xs text-surface-500 mt-1">阶段五接入数据</div>
        </Card>
        <Card title="最近告警" subtitle="alerts:recent">
          <div className="text-3xl font-semibold text-surface-100">—</div>
          <div className="text-xs text-surface-500 mt-1">阶段五接入数据</div>
        </Card>
        <Card title="调度指令" subtitle="dispatch_commands">
          <div className="text-3xl font-semibold text-surface-100">—</div>
          <div className="text-xs text-surface-500 mt-1">阶段五接入数据</div>
        </Card>
      </div>

      <Card title="地图占位" subtitle="阶段五接入真实地图">
        <div className="h-80 flex items-center justify-center bg-surface-950 border border-surface-800 rounded text-surface-500">
          🗺️ 地图将在阶段五接入
        </div>
      </Card>
    </div>
  );
}
