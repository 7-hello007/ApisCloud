import { createObservabilityMetrics } from '@apiscloud/observability';

/**
 * 从 prom-client 的文本输出里提取某个指标的样本行。
 * 返回该指标所有样本行的数组。
 */
function extractMetricLines(text: string, metricName: string): string[] {
  const lines = text.split('\n');
  return lines.filter(
    (line) => line.startsWith(`${metricName}{`) || line.startsWith(`${metricName} `),
  );
}

describe('observability.businessMetrics', () => {
  it('返回 14 个指标（9 个原有 + 5 个新增）', () => {
    const metrics = createObservabilityMetrics('test-svc');

    // 服务层
    expect(metrics.httpRequests).toBeDefined();
    expect(metrics.httpDuration).toBeDefined();

    // 数据流层
    expect(metrics.dataFlowMessages).toBeDefined();
    expect(metrics.dataFlowLatency).toBeDefined();

    // 插件层
    expect(metrics.pluginActions).toBeDefined();
    expect(metrics.pluginDuration).toBeDefined();

    // 总线层
    expect(metrics.busPublished).toBeDefined();
    expect(metrics.busConsumed).toBeDefined();
    expect(metrics.busLag).toBeDefined();

    // 业务层
    expect(metrics.dispatchTasks).toBeDefined();
    expect(metrics.pluginDispatch).toBeDefined();
    expect(metrics.chargingCommands).toBeDefined();
    expect(metrics.geofenceEvents).toBeDefined();
    expect(metrics.anomalyEvents).toBeDefined();
  });

  it('dispatchTasks 递增并带全部标签', async () => {
    const metrics = createObservabilityMetrics('dispatch-core');

    metrics.dispatchTasks.inc({
      task_type: 'passenger',
      algorithm: 'nearest',
      result: 'dispatched',
    });

    const text = await metrics.registry.metrics();
    const lines = extractMetricLines(text, 'apiscloud_dispatch_tasks_total');
    expect(lines).toHaveLength(1);

    const line = lines[0];
    // 不依赖标签顺序，逐个验证
    expect(line).toContain('task_type="passenger"');
    expect(line).toContain('algorithm="nearest"');
    expect(line).toContain('result="dispatched"');
    expect(line).toContain('service="dispatch-core"');
    expect(line).toMatch(/ 1$/);
  });

  it('pluginDispatch 带 plugin 和 topic 标签', async () => {
    const metrics = createObservabilityMetrics('gateway');

    metrics.pluginDispatch.inc({
      plugin: 'geofence',
      topic: 'telemetry.raw',
    });

    const text = await metrics.registry.metrics();
    const lines = extractMetricLines(text, 'apiscloud_plugin_dispatch_total');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('plugin="geofence"');
    expect(lines[0]).toContain('topic="telemetry.raw"');
  });

  it('chargingCommands 带 command_type 和 result 标签', async () => {
    const metrics = createObservabilityMetrics('charging-scheduler');

    metrics.chargingCommands.inc({
      command_type: 'charge',
      result: 'issued',
    });

    const text = await metrics.registry.metrics();
    const lines = extractMetricLines(text, 'apiscloud_charging_commands_total');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('command_type="charge"');
    expect(lines[0]).toContain('result="issued"');
  });

  it('geofenceEvents 带 event_type 和 level 标签', async () => {
    const metrics = createObservabilityMetrics('geofence');

    metrics.geofenceEvents.inc({
      event_type: 'exit',
      level: 'warning',
    });

    const text = await metrics.registry.metrics();
    const lines = extractMetricLines(text, 'apiscloud_geofence_events_total');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('event_type="exit"');
    expect(lines[0]).toContain('level="warning"');
  });

  it('anomalyEvents 带 alert_type 和 level 标签', async () => {
    const metrics = createObservabilityMetrics('anomaly');

    metrics.anomalyEvents.inc({
      alert_type: 'speed_anomaly',
      level: 'warning',
    });

    const text = await metrics.registry.metrics();
    const lines = extractMetricLines(text, 'apiscloud_anomaly_events_total');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('alert_type="speed_anomaly"');
    expect(lines[0]).toContain('level="warning"');
  });

  it('多次 inc 累加', async () => {
    const metrics = createObservabilityMetrics('test');

    for (let i = 0; i < 5; i++) {
      metrics.dispatchTasks.inc({
        task_type: 'passenger',
        algorithm: 'nearest',
        result: 'dispatched',
      });
    }

    const text = await metrics.registry.metrics();
    const lines = extractMetricLines(text, 'apiscloud_dispatch_tasks_total');
    expect(lines).toHaveLength(1);
    // 行尾的值应为 5
    const valueMatch = lines[0].match(/ (\d+(?:\.\d+)?)$/);
    expect(valueMatch).not.toBeNull();
    expect(valueMatch![1]).toBe('5');
  });

  it('业务指标名符合 apiscloud_ 前缀', async () => {
    const metrics = createObservabilityMetrics('test');

    metrics.dispatchTasks.inc({ task_type: 'a', algorithm: 'b', result: 'c' });
    metrics.pluginDispatch.inc({ plugin: 'p', topic: 't' });
    metrics.chargingCommands.inc({ command_type: 'x', result: 'y' });
    metrics.geofenceEvents.inc({ event_type: 'e', level: 'l' });
    metrics.anomalyEvents.inc({ alert_type: 'at', level: 'l' });

    const text = await metrics.registry.metrics();
    expect(text).toMatch(/^# HELP apiscloud_dispatch_tasks_total /m);
    expect(text).toMatch(/^# HELP apiscloud_plugin_dispatch_total /m);
    expect(text).toMatch(/^# HELP apiscloud_charging_commands_total /m);
    expect(text).toMatch(/^# HELP apiscloud_geofence_events_total /m);
    expect(text).toMatch(/^# HELP apiscloud_anomaly_events_total /m);
  });

  it('不同标签组合产生不同样本行', async () => {
    const metrics = createObservabilityMetrics('test');

    metrics.dispatchTasks.inc({
      task_type: 'passenger',
      algorithm: 'nearest',
      result: 'dispatched',
    });
    metrics.dispatchTasks.inc({
      task_type: 'logistics',
      algorithm: 'batch-match',
      result: 'dispatched',
    });
    metrics.dispatchTasks.inc({
      task_type: 'passenger',
      algorithm: 'nearest',
      result: 'no_candidates',
    });

    const text = await metrics.registry.metrics();
    const lines = extractMetricLines(text, 'apiscloud_dispatch_tasks_total');
    expect(lines).toHaveLength(3);
  });
});
