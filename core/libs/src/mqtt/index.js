'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.createMqtt = createMqtt;
const mqtt_1 = __importDefault(require('mqtt'));
function createMqtt(config) {
  const client = mqtt_1.default.connect(config.MQTT_URL, {
    clientId: `apiscloud-${config.SERVICE_NAME}-${Math.random().toString(16).slice(2, 10)}`,
    username: config.MQTT_USERNAME,
    password: config.MQTT_PASSWORD,
    clean: true,
    reconnectPeriod: 1000,
    connectTimeout: 10_000,
    keepalive: 30,
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
      await new Promise((resolve, reject) => {
        client.publish(topic, buf, { qos }, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },
    async subscribe(topic, handler, qos = 0) {
      await new Promise((resolve, reject) => {
        client.subscribe(topic, { qos }, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      client.on('message', (t, payload) => {
        if (t === topic) {
          handler(t, payload);
        }
      });
    },
    async health() {
      if (client.connected) {
        return { status: 'ok' };
      }
      return { status: 'degraded', message: 'not connected' };
    },
    async close() {
      await new Promise((resolve) => {
        client.end(false, {}, () => resolve());
      });
    },
    raw() {
      return client;
    },
  };
}
//# sourceMappingURL=index.js.map
