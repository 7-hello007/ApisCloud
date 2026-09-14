import { createMetrics, type MetricsRegistry } from '@apiscloud/libs';

export interface ObservabilityMetrics {
  registry: MetricsRegistry;
  // 服务层
  httpRequests: ReturnType<MetricsRegistry['counter']>;
  httpDuration: ReturnType<MetricsRegistry['histogram']>;
  // 数据流层
  dataFlowMessages: ReturnType<MetricsRegistry['counter']>;
  dataFlowLatency: ReturnType<MetricsRegistry['histogram']>;
  // 插件层
  pluginActions: ReturnType<MetricsRegistry['counter']>;
  pluginDuration: ReturnType<MetricsRegistry['histogram']>;
  // 总线层
  busPublished: ReturnType<MetricsRegistry['counter']>;
  busConsumed: ReturnType<MetricsRegistry['counter']>;
  busLag: ReturnType<MetricsRegistry['gauge']>;
  // 业务层（阶段六新增）
  dispatchTasks: ReturnType<MetricsRegistry['counter']>;
  pluginDispatch: ReturnType<MetricsRegistry['counter']>;
  chargingCommands: ReturnType<MetricsRegistry['counter']>;
  geofenceEvents: ReturnType<MetricsRegistry['counter']>;
  anomalyEvents: ReturnType<MetricsRegistry['counter']>;
}

/**
 * 创建可观测性指标集合。
 * 四层指标：服务、数据流、插件、总线；外加业务层指标。
 */
export function createObservabilityMetrics(service: string): ObservabilityMetrics {
  const registry = createMetrics(service);

  // ============ 服务层 ============
  const httpRequests = registry.counter(
    'apiscloud_http_requests_total',
    'HTTP 请求总数',
    ['method', 'path', 'status'],
  );

  const httpDuration = registry.histogram(
    'apiscloud_http_request_duration_seconds',
    'HTTP 请求延迟',
    ['method', 'path'],
    [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  );

  // ============ 数据流层 ============
  const dataFlowMessages = registry.counter(
    'apiscloud_dataflow_messages_total',
    '数据流消息数',
    ['topic', 'direction'],
  );

  const dataFlowLatency = registry.histogram(
    'apiscloud_dataflow_latency_seconds',
    '数据流延迟',
    ['topic'],
    [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  );

  // ============ 插件层 ============
  const pluginActions = registry.counter(
    'apiscloud_plugin_actions_total',
    '插件动作次数',
    ['plugin', 'action', 'success'],
  );

  const pluginDuration = registry.histogram(
    'apiscloud_plugin_action_duration_seconds',
    '插件动作延迟',
    ['plugin', 'action'],
    [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  );

  // ============ 总线层 ============
  const busPublished = registry.counter(
    'apiscloud_bus_published_total',
    '总线发布消息数',
    ['topic'],
  );

  const busConsumed = registry.counter(
    'apiscloud_bus_consumed_total',
    '总线消费消息数',
    ['topic', 'group'],
  );

  const busLag = registry.gauge(
    'apiscloud_bus_consumer_lag',
    '消费者滞后',
    ['topic', 'group'],
  );

  // ============ 业务层（阶段六新增） ============
  const dispatchTasks = registry.counter(
    'apiscloud_dispatch_tasks_total',
    '调度任务接收总数',
    ['task_type', 'algorithm', 'result'],
  );

  const pluginDispatch = registry.counter(
    'apiscloud_plugin_dispatch_total',
    '插件消息分发次数',
    ['plugin', 'topic'],
  );

  const chargingCommands = registry.counter(
    'apiscloud_charging_commands_total',
    '充电调度指令数',
    ['command_type', 'result'],
  );

  const geofenceEvents = registry.counter(
    'apiscloud_geofence_events_total',
    '地理围栏事件数',
    ['event_type', 'level'],
  );

  const anomalyEvents = registry.counter(
    'apiscloud_anomaly_events_total',
    '异常检测事件数',
    ['alert_type', 'level'],
  );

  return {
    registry,
    httpRequests,
    httpDuration,
    dataFlowMessages,
    dataFlowLatency,
    pluginActions,
    pluginDuration,
    busPublished,
    busConsumed,
    busLag,
    dispatchTasks,
    pluginDispatch,
    chargingCommands,
    geofenceEvents,
    anomalyEvents,
  };
}
