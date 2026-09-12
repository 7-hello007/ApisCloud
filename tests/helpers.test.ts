import { delay, makeEnvelope, makePlugin, makePluginInstance, waitFor } from './helpers';

describe('tests.helpers', () => {
  describe('makeEnvelope', () => {
    it('默认值正确', () => {
      const env = makeEnvelope();
      expect(env.topic).toBe('telemetry.raw');
      expect(env.source).toBe('test');
      expect(env.payload).toEqual({ test: true });
      expect(env.trace_id).toBeDefined();
    });

    it('可覆盖字段', () => {
      const env = makeEnvelope({
        topic: 'events.alerts',
        source: 'anomaly',
        payload: { level: 'high' },
      });
      expect(env.topic).toBe('events.alerts');
      expect(env.source).toBe('anomaly');
      expect(env.payload).toEqual({ level: 'high' });
    });
  });

  describe('makePlugin', () => {
    it('默认值正确', () => {
      const plugin = makePlugin();
      expect(plugin.manifest.name).toBe('test-plugin');
      expect(plugin.manifest.version).toBe('1.0.0');
      expect(plugin.manifest.core).toBe(false);
      expect(plugin.manifest.lazy).toBe(true);
      expect(plugin.manifest.profile).toEqual(['test']);
    });

    it('可覆盖 manifest 字段', () => {
      const plugin = makePlugin({
        name: 'nearest-dispatch',
        core: true,
        profile: ['core'],
        topics: { subscribe: ['telemetry.aggregated'] },
      });
      expect(plugin.manifest.name).toBe('nearest-dispatch');
      expect(plugin.manifest.core).toBe(true);
      expect(plugin.manifest.profile).toEqual(['core']);
      expect(plugin.manifest.topics?.subscribe).toEqual(['telemetry.aggregated']);
    });
  });

  describe('makePluginInstance', () => {
    it('所有钩子都是 jest.fn', () => {
      const instance = makePluginInstance();
      expect(jest.isMockFunction(instance.onLoad)).toBe(true);
      expect(jest.isMockFunction(instance.onUnload)).toBe(true);
      expect(jest.isMockFunction(instance.onMessage)).toBe(true);
      expect(jest.isMockFunction(instance.onTimer)).toBe(true);
      expect(jest.isMockFunction(instance.getRoutes)).toBe(true);
      expect(jest.isMockFunction(instance.getHealth)).toBe(true);
    });

    it('getHealth 默认返回 ok', async () => {
      const instance = makePluginInstance();
      const health = await instance.getHealth();
      expect(health).toEqual({ status: 'ok' });
    });
  });

  describe('waitFor', () => {
    it('条件立即成立返回', async () => {
      await expect(waitFor(() => true)).resolves.toBeUndefined();
    });

    it('条件延迟成立返回', async () => {
      let flag = false;
      setTimeout(() => {
        flag = true;
      }, 50);
      await expect(waitFor(() => flag)).resolves.toBeUndefined();
    });

    it('超时抛错', async () => {
      await expect(waitFor(() => false, { timeoutMs: 100 })).rejects.toThrow(/超时/);
    });
  });

  describe('delay', () => {
    it('等待指定时间', async () => {
      const start = Date.now();
      await delay(50);
      expect(Date.now() - start).toBeGreaterThanOrEqual(40);
    });
  });
});
