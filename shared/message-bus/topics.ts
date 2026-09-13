/**
 * 消息总线主题常量。
 * 主题命名规则：<域>.<子域>.<用途>
 * 一旦定下，属于核心契约，改动需版本化。
 *
 * ============================================================
 * 主题分层（阶段五明确）
 * ============================================================
 *
 * telemetry.raw
 *   原始遥测，1-10Hz，高频，短期保留（6h）。
 *   生产者：ingest（从 MQTT 转）。
 *   消费者：data-writer、dispatch-core、aggregator、route-optimizer。
 *   语义：单条原始数据，粒度最细，流量最大。
 *
 * telemetry.aggregated
 *   聚合遥测，5s 一次，低频，中期保留（72h）。
 *   生产者：aggregator。
 *   消费者：data-writer、charging-scheduler、dashboard。
 *   语义：区域级聚合，车辆数、平均速度、低电量车辆列表。
 *   设计意图：插件默认订阅此层，不订阅 raw，避免高频压垮插件。
 *
 * events.commands
 *   调度指令事件，事件驱动，长期保留（7d）。
 *   生产者：dispatch-core、charging-scheduler、route-optimizer。
 *   消费者：ingest（转发 MQTT）、data-writer（审计）。
 *   语义：平台下发给外部系统的指令。
 *
 * events.alerts
 *   告警事件，事件驱动，长期保留（7d）。
 *   生产者：geofence、anomaly。
 *   消费者：data-writer（落库 + Redis）。
 *   语义：异常、围栏越界、电量骤降等告警。
 *
 * ============================================================
 * 订阅策略
 * ============================================================
 *
 * - 新插件默认订阅 telemetry.aggregated，不订阅 telemetry.raw。
 * - 只有确实需要单条原始数据的插件（如 route-optimizer）才订阅 raw。
 * - 插件通过 plugin.json 的 topics.filter 声明过滤条件，减少无效调用。
 */

export const TOPICS = {
  /** 原始遥测：车辆高频上报，1-10Hz。高频层。 */
  TELEMETRY_RAW: 'telemetry.raw',

  /** 聚合遥测：按区域/时间窗聚合后的低频数据。低频层。 */
  TELEMETRY_AGGREGATED: 'telemetry.aggregated',

  /** 指令事件：平台下发给外部系统的调度/取消/充电等指令。事件层。 */
  EVENTS_COMMANDS: 'events.commands',

  /** 告警事件：异常、围栏越界、电量骤降等。事件层。 */
  EVENTS_ALERTS: 'events.alerts',
} as const;

export type TopicName = (typeof TOPICS)[keyof typeof TOPICS];

export const ALL_TOPICS: TopicName[] = [
  TOPICS.TELEMETRY_RAW,
  TOPICS.TELEMETRY_AGGREGATED,
  TOPICS.EVENTS_COMMANDS,
  TOPICS.EVENTS_ALERTS,
];
