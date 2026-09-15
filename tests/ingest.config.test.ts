import { loadConfig, resetConfig } from '@apiscloud/libs';
import { loadIngestConfig } from '@apiscloud/ingest';

describe('ingest.config', () => {
  const ENV_KEYS = ['INGEST_MQTT_TOPIC', 'INGEST_MQTT_COMMAND_PREFIX', 'INGEST_CONSUMER_GROUP'];

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
    const cfg = loadIngestConfig(loadConfig());
    expect(cfg.mqttUplinkTopic).toBe('telemetry/raw');
    expect(cfg.mqttCommandPrefix).toBe('commands/');
    expect(cfg.consumerGroup).toBe('apiscloud-ingest');
  });

  it('环境变量可覆盖 MQTT 上行 topic', () => {
    process.env.INGEST_MQTT_TOPIC = 'custom/uplink';
    const cfg = loadIngestConfig(loadConfig());
    expect(cfg.mqttUplinkTopic).toBe('custom/uplink');
  });

  it('环境变量可覆盖命令前缀', () => {
    process.env.INGEST_MQTT_COMMAND_PREFIX = 'cmd/';
    const cfg = loadIngestConfig(loadConfig());
    expect(cfg.mqttCommandPrefix).toBe('cmd/');
  });

  it('环境变量可覆盖消费组', () => {
    process.env.INGEST_CONSUMER_GROUP = 'custom-group';
    const cfg = loadIngestConfig(loadConfig());
    expect(cfg.consumerGroup).toBe('custom-group');
  });
});
