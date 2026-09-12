import type { AppConfig } from '@apiscloud/libs';
import { createObservabilityService, type ObservabilityService } from '@apiscloud/observability';

import { loadSimulatorConfig } from './config';
import { Fleet } from './fleet';
import { createMqttPublisher, type MqttPublisher } from './mqtt-publisher';
import type { SimulatorConfig } from './types';

export interface SimulatorServiceOptions {
  config: AppConfig;
  port: number;
}

export interface SimulatorService {
  readonly observability: ObservabilityService;
  readonly simulatorConfig: SimulatorConfig;
  start(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * 创建 simulator 服务。
 * 组合：配置 + 车队 + MQTT 发布器 + 可观测性。
 */
export function createSimulatorService(
  options: SimulatorServiceOptions,
): SimulatorService {
  const simConfig = loadSimulatorConfig(options.config);

  const observability = createObservabilityService({
    service: 'simulator',
    layer: options.config.LAYER,
    port: options.port,
    logLevel: options.config.LOG_LEVEL,
    prettyLogs: options.config.NODE_ENV === 'development',
  });

  const fleet = new Fleet(simConfig);
  const publisher: MqttPublisher = createMqttPublisher(options.config, simConfig.mqttTopic);

  let timer: NodeJS.Timeout | null = null;

  observability.logger.info(
    {
      vehicleCount: simConfig.vehicleCount,
      publishIntervalMs: simConfig.publishIntervalMs,
      mqttTopic: simConfig.mqttTopic,
    },
    '模拟器初始化完成',
  );

  return {
    observability,
    simulatorConfig: simConfig,

    async start() {
      await publisher.connect();
      await observability.start();

      observability.addHealthTarget({
        name: 'mqtt',
        check: async () => publisher.health(),
      });

      observability.addHealthTarget({
        name: 'fleet',
        check: async () => ({
          status: 'ok',
          message: `${fleet.size()} vehicles`,
        }),
      });

      const tickSec = simConfig.publishIntervalMs / 1000;

      timer = setInterval(() => {
        void (async () => {
          try {
            const states = fleet.tick(tickSec);
            const promises = states.map((state) =>
              publisher.publish(state).catch((err) => {
                const message = err instanceof Error ? err.message : String(err);
                observability.logger.error(
                  { vehicleId: state.vehicle_id, err: message },
                  '发布失败',
                );
              }),
            );
            await Promise.all(promises);
            observability.metrics.dataFlowMessages.inc(
              { topic: simConfig.mqttTopic, direction: 'out' },
              states.length,
            );
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            observability.logger.error({ err: message }, 'tick 失败');
          }
        })();
      }, simConfig.publishIntervalMs);

      observability.logger.info('模拟器已启动');
    },

    async stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      await publisher.close();
      await observability.stop();
      observability.logger.info('模拟器已停止');
    },
  };
}