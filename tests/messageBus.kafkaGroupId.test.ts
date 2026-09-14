import { buildGroupId } from '@apiscloud/message-bus';

describe('messageBus.kafkaGroupId', () => {
  describe('有 baseGroupId', () => {
    it('拼成 <base>--<topic 去点>', () => {
      expect(buildGroupId('apiscloud-data-writer', 'telemetry.raw')).toBe(
        'apiscloud-data-writer--telemetry-raw',
      );
    });

    it('多个点都被替换', () => {
      expect(buildGroupId('apiscloud-gateway', 'events.commands.dispatch')).toBe(
        'apiscloud-gateway--events-commands-dispatch',
      );
    });

    it('topic 无点时保持原样', () => {
      expect(buildGroupId('apiscloud-x', 'simple')).toBe('apiscloud-x--simple');
    });

    it('不同 topic 得到不同 groupId', () => {
      const g1 = buildGroupId('apiscloud-data-writer', 'telemetry.raw');
      const g2 = buildGroupId('apiscloud-data-writer', 'events.alerts');
      expect(g1).not.toBe(g2);
    });

    it('不同 base 得到不同 groupId', () => {
      const g1 = buildGroupId('apiscloud-a', 'telemetry.raw');
      const g2 = buildGroupId('apiscloud-b', 'telemetry.raw');
      expect(g1).not.toBe(g2);
    });
  });

  describe('无 baseGroupId', () => {
    it('拼成 apiscloud-<topic 去点>', () => {
      expect(buildGroupId(undefined, 'telemetry.raw')).toBe('apiscloud-telemetry-raw');
    });

    it('多个点都被替换', () => {
      expect(buildGroupId(undefined, 'events.alerts.critical')).toBe(
        'apiscloud-events-alerts-critical',
      );
    });
  });

  describe('边界', () => {
    it('空字符串 baseGroupId 视为无（falsy）', () => {
      // 注意：'' 是 falsy，所以走 apiscloud- 前缀
      expect(buildGroupId('', 'telemetry.raw')).toBe('apiscloud-telemetry-raw');
    });

    it('单字符 topic', () => {
      expect(buildGroupId('base', 'x')).toBe('base--x');
    });

    it('长 topic', () => {
      const longTopic = 'very.long.topic.name.with.many.dots';
      const result = buildGroupId('apiscloud-test', longTopic);
      expect(result).toBe('apiscloud-test--very-long-topic-name-with-many-dots');
    });
  });

  describe('实际使用场景', () => {
    it('data-writer 订阅 4 个主题得到 4 个独立 groupId', () => {
      const base = 'apiscloud-data-writer';
      const topics = ['telemetry.raw', 'telemetry.aggregated', 'events.alerts', 'events.commands'];
      const groupIds = topics.map((t) => buildGroupId(base, t));
      const uniqueGroupIds = new Set(groupIds);
      expect(uniqueGroupIds.size).toBe(4);
    });

    it('gateway 订阅 2 个主题得到 2 个独立 groupId', () => {
      const base = 'apiscloud-gateway';
      const topics = ['telemetry.raw', 'telemetry.aggregated'];
      const groupIds = topics.map((t) => buildGroupId(base, t));
      expect(new Set(groupIds).size).toBe(2);
    });

    it('同 topic 同 base 得到相同 groupId（多实例负载均衡）', () => {
      const g1 = buildGroupId('apiscloud-data-writer', 'telemetry.raw');
      const g2 = buildGroupId('apiscloud-data-writer', 'telemetry.raw');
      expect(g1).toBe(g2);
    });
  });
});
