import mqtt, { type MqttClient } from 'mqtt';

import type { AppConfig } from '../config';
import type { HealthCheckResult } from '../health';

export interface MqttWrapper {
  publish(topic: string, payload: unknown, qos?: 0 | 1 | 2): Promise<void>;
  subscribe(
    topic: string,
    handler: (topic: string, payload: Buffer) => void,
    qos?: 0 | 1 | 2,
  ): Promise<void>;
  connect(): Promise<void>;
  health(): Promise<HealthCheckResult>;
  close(): Promise<void>;
  raw(): MqttClient;
}

export function createMqtt(config: AppConfig): MqttWrapper {
  const client = mqtt.connect(config.MQTT_URL, {
    clientId: `apiscloud-${config.SERVICE_NAME}-${Math.random().toString(16).slice(2, 10)}`,
    username: config.MQTT_USERNAME,
    password: config.MQTT_PASSWORD,
    clean: true,
    reconnectPeriod: config.NODE_ENV === 'test' ? 0 : 1000,
    connectTimeout: 10_000,
    keepalive: 30,
    // 关键：测试环境不自动连接
    manualConnect: config.NODE_ENV === 'test',
  });

  client.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[mqtt] error:', err.message);
  });

  return {
    async publish(topic, payload, qos = 0) {
      const buf = Buffer.isBuffer(payload)
        ? payload
        : Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload));
      await new Promise<void>((resolve, reject) => {
        client.publish(topic, buf, { qos }, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },

    async subscribe(topic, handler, qos = 0) {
      await new Promise<void>((resolve, reject) => {
        client.subscribe(topic, { qos }, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      client.on('message', (t: string, payload: Buffer) => {
        if (t === topic) {
          handler(t, payload);
        }
      });
    },

    async connect() {
      if (client.connected) return;
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('MQTT 连接超时')), 10_000);
        client.once('connect', () => {
          clearTimeout(timeout);
          resolve();
        });
        client.once('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
        if (client.disconnected) {
          client.reconnect();
        }
      });
    },

    async health(): Promise<HealthCheckResult> {
      if (client.connected) {
        return { status: 'ok' };
      }
      return { status: 'degraded', message: 'not connected' };
    },

    async close() {
      await new Promise<void>((resolve) => {
        try {
          // 用 endAsync 或同步 end 都包在 try 里
          client.end(true, {}, () => resolve());
          // 防止回调永远不触发
          setTimeout(resolve, 100);
        } catch {
          // 未连接、未初始化时 end 会报错，直接忽略
          resolve();
        }
      });
    },

    raw() {
      return client;
    },
  };
}