/**
 * 消息总线主题常量。
 * 主题命名规则：<域>.<子域>.<用途>
 * 一旦定下，属于核心契约，改动需版本化。
 */
export const TOPICS = {
  /** 原始遥测：车辆高频上报，1-10Hz */
  TELEMETRY_RAW: 'telemetry.raw',

  /** 聚合遥测：按区域/时间窗聚合后的低频数据 */
  TELEMETRY_AGGREGATED: 'telemetry.aggregated',

  /** 指令事件：平台下发给外部系统的调度/取消/充电等指令 */
  EVENTS_COMMANDS: 'events.commands',

  /** 告警事件：异常、围栏越界、电量骤降等 */
  EVENTS_ALERTS: 'events.alerts',
} as const;

export type TopicName = (typeof TOPICS)[keyof typeof TOPICS];

export const ALL_TOPICS: TopicName[] = [
  TOPICS.TELEMETRY_RAW,
  TOPICS.TELEMETRY_AGGREGATED,
  TOPICS.EVENTS_COMMANDS,
  TOPICS.EVENTS_ALERTS,
];
