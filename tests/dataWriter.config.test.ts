import { loadConfig, resetConfig } from '@apiscloud/libs';
import { loadDataWriterConfig } from '@apiscloud/data-writer';

describe('dataWriter.config', () => {
  const ENV_KEYS = [
    'DATA_WRITER_LATEST_TTL_SEC',
    'DATA_WRITER_RECENT_ALERTS_MAX',
    'DATA_WRITER_CONSUMER_GROUP',
  ];

  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    resetConfig();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  });

  it('默认值正确', () => {
    const cfg = loadDataWriterConfig(loadConfig());
    expect(cfg.vehicleLatestTtlSec).toBe(60);
    expect(cfg.recentAlertsMax).toBe(100);
    expect(cfg.consumerGroup).toBe('apiscloud-data-writer');
  });

  it('环境变量可覆盖 TTL', () => {
    process.env.DATA_WRITER_LATEST_TTL_SEC = '120';
    const cfg = loadDataWriterConfig(loadConfig());
    expect(cfg.vehicleLatestTtlSec).toBe(120);
  });

  it('环境变量可覆盖最近告警条数', () => {
    process.env.DATA_WRITER_RECENT_ALERTS_MAX = '50';
    const cfg = loadDataWriterConfig(loadConfig());
    expect(cfg.recentAlertsMax).toBe(50);
  });

  it('环境变量可覆盖消费组', () => {
    process.env.DATA_WRITER_CONSUMER_GROUP = 'custom-group';
    const cfg = loadDataWriterConfig(loadConfig());
    expect(cfg.consumerGroup).toBe('custom-group');
  });

  it('非法 TTL 抛错', () => {
    process.env.DATA_WRITER_LATEST_TTL_SEC = 'abc';
    expect(() => loadDataWriterConfig(loadConfig())).toThrow(/DATA_WRITER_LATEST_TTL_SEC/);
  });

  it('负 TTL 抛错', () => {
    process.env.DATA_WRITER_LATEST_TTL_SEC = '-1';
    expect(() => loadDataWriterConfig(loadConfig())).toThrow(/DATA_WRITER_LATEST_TTL_SEC/);
  });

  it('0 TTL 抛错', () => {
    process.env.DATA_WRITER_LATEST_TTL_SEC = '0';
    expect(() => loadDataWriterConfig(loadConfig())).toThrow(/DATA_WRITER_LATEST_TTL_SEC/);
  });
});
