import { ALL_TOPICS, TOPICS } from '@apiscloud/message-bus';

describe('messageBus.topics', () => {
  it('TOPICS 有 4 个主题', () => {
    expect(Object.keys(TOPICS)).toHaveLength(4);
  });

  it('主题名符合命名规范', () => {
    for (const topic of ALL_TOPICS) {
      // 格式：<域>.<子域>，小写字母 + 点
      expect(topic).toMatch(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/);
    }
  });

  it('telemetry.raw 常量正确', () => {
    expect(TOPICS.TELEMETRY_RAW).toBe('telemetry.raw');
  });

  it('telemetry.aggregated 常量正确', () => {
    expect(TOPICS.TELEMETRY_AGGREGATED).toBe('telemetry.aggregated');
  });

  it('events.commands 常量正确', () => {
    expect(TOPICS.EVENTS_COMMANDS).toBe('events.commands');
  });

  it('events.alerts 常量正确', () => {
    expect(TOPICS.EVENTS_ALERTS).toBe('events.alerts');
  });

  it('ALL_TOPICS 包含全部 4 个主题', () => {
    expect(ALL_TOPICS).toHaveLength(4);
    expect(ALL_TOPICS).toContain(TOPICS.TELEMETRY_RAW);
    expect(ALL_TOPICS).toContain(TOPICS.TELEMETRY_AGGREGATED);
    expect(ALL_TOPICS).toContain(TOPICS.EVENTS_COMMANDS);
    expect(ALL_TOPICS).toContain(TOPICS.EVENTS_ALERTS);
  });

  it('ALL_TOPICS 无重复', () => {
    const set = new Set(ALL_TOPICS);
    expect(set.size).toBe(ALL_TOPICS.length);
  });

  it('主题名以域前缀分组', () => {
    expect(TOPICS.TELEMETRY_RAW.startsWith('telemetry.')).toBe(true);
    expect(TOPICS.TELEMETRY_AGGREGATED.startsWith('telemetry.')).toBe(true);
    expect(TOPICS.EVENTS_COMMANDS.startsWith('events.')).toBe(true);
    expect(TOPICS.EVENTS_ALERTS.startsWith('events.')).toBe(true);
  });
});
