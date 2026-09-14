import path from 'node:path';

import type { AppConfig } from '@apiscloud/libs';
import {
  createMessageBus,
  TOPICS,
  type Envelope,
  type MessageBus,
  type Subscription,
} from '@apiscloud/message-bus';
import {
  createObservabilityService,
  type ObservabilityService,
} from '@apiscloud/observability';

import { AlgorithmRegistry } from './algorithm-registry';
import { loadAlgorithmsFromDir } from './algorithm-loader';
import { buildDispatchCommand } from './command-builder';
import { loadDispatchCoreConfig } from './config';
import { filterCandidates } from './constraints';
import { commandToEnvelope, telemetryToVehicle } from './mapper';
import type {
  DispatchAlgorithm,
  DispatchAlgorithmInput,
  DispatchAlgorithmResult,
  DispatchCoreConfig,
  DispatchTask,
  DispatchVehicle,
} from './types';
import { parseTask } from './validation';

export interface DispatchCoreServiceOptions {
  config: AppConfig;
  port: number;
  /** 可注入的 MessageBus（测试用） */
  bus?: MessageBus;
  /** 算法插件目录，默认 <repo>/plugins/dispatch */
  algorithmPluginsDir?: string;
}

export interface DispatchCoreService {
  readonly observability: ObservabilityService;
  readonly dispatchConfig: DispatchCoreConfig;
  readonly registry: AlgorithmRegistry;
  readonly vehicles: Map<string, DispatchVehicle>;
  /** 提交任务，走完整调度流程 */
  submitTask(task: DispatchTask): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * 创建 dispatch-core 服务。
 * 组合：配置 + 算法插件 + 总线 + 可观测性。
 */
export function createDispatchCoreService(
  options: DispatchCoreServiceOptions,
): DispatchCoreService {
  const dcConfig = loadDispatchCoreConfig(options.config);

  const observability = createObservabilityService({
    service: 'dispatch-core',
    layer: options.config.LAYER,
    port: options.port,
    logLevel: options.config.LOG_LEVEL,
    prettyLogs: options.config.NODE_ENV === 'development',
  });

  const bus = options.bus ?? createMessageBus(options.config);
  const registry = new AlgorithmRegistry();
  const vehicles = new Map<string, DispatchVehicle>();
  const subscriptions: Subscription[] = [];
  let stopped = false;

  // 加载算法插件
  const algorithmDir =
    options.algorithmPluginsDir ??
    process.env.DISPATCH_ALGORITHM_DIR ??
    path.resolve(__dirname, '..', '..', '..', '..', 'plugins', 'dispatch');

  try {
    const algorithms = loadAlgorithmsFromDir(algorithmDir);
    for (const algo of algorithms) {
      registry.register(algo);
    }
    observability.logger.info(
      { count: algorithms.length, names: registry.names(), dir: algorithmDir },
      '算法插件加载完成',
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    observability.logger.error({ err: message }, '算法插件加载失败');
  }

  /**
   * 处理一条遥测，更新车辆注册表。
   */
  function handleTelemetry(env: Envelope): void {
    try {
      const vehicle = telemetryToVehicle(env);
      vehicles.set(vehicle.vehicle_id, vehicle);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      observability.logger.warn({ err: message }, '遥测处理失败');
    }
  }

  /**
   * 处理一个任务：过滤 → 算法 → 构建命令 → 发布。
   */
  async function handleTask(task: DispatchTask): Promise<void> {
    const startMs = Date.now();
    try {
      // 1. 硬约束过滤
      const candidates = Array.from(vehicles.values());
      const { passed } = filterCandidates(task, candidates, dcConfig);

      observability.metrics.dataFlowMessages.inc({
        topic: 'dispatch.tasks',
        direction: 'in',
      });

      if (passed.length === 0) {
        observability.metrics.dispatchTasks.inc({
          task_type: task.task_type,
          algorithm: 'none',
          result: 'no_candidates',
        });
        observability.logger.warn(
          { taskId: task.task_id, totalCandidates: candidates.length },
          '无候选车辆',
        );
        return;
      }

      // 2. 选择算法
      let algorithm: DispatchAlgorithm | undefined =
        registry.get(dcConfig.defaultAlgorithm) ?? registry.get(dcConfig.fallbackAlgorithm);

      if (!algorithm) {
        observability.metrics.dispatchTasks.inc({
          task_type: task.task_type,
          algorithm: 'none',
          result: 'no_algorithm',
        });
        observability.logger.error('无可用算法');
        return;
      }

      // 3. 调算法，失败回退
      const input: DispatchAlgorithmInput = { task, candidates: passed };
      let result = await tryAlgorithm(algorithm, input, dcConfig.algorithmTimeoutMs);

      if (!result && algorithm.name !== dcConfig.fallbackAlgorithm) {
        const fallback = registry.get(dcConfig.fallbackAlgorithm);
        if (fallback) {
          observability.logger.warn(
            { failed: algorithm.name, fallback: fallback.name },
            '算法失败，回退',
          );
          algorithm = fallback;
          result = await tryAlgorithm(fallback, input, dcConfig.algorithmTimeoutMs);
        }
      }

      if (!result || result.ranked.length === 0) {
        observability.metrics.dispatchTasks.inc({
          task_type: task.task_type,
          algorithm: algorithm.name,
          result: 'empty_output',
        });
        observability.logger.warn({ taskId: task.task_id }, '算法无输出');
        return;
      }

      // 4. 取最优
      const top = result.ranked[0];
      const chosen = passed.find((v) => v.vehicle_id === top.vehicle_id);
      if (!chosen) {
        observability.metrics.dispatchTasks.inc({
          task_type: task.task_type,
          algorithm: algorithm.name,
          result: 'invalid_output',
        });
        observability.logger.error({ vehicleId: top.vehicle_id }, '算法返回的车辆不在候选集');
        return;
      }

      // 5. 构建命令 + 签名
      const command = buildDispatchCommand({
        task,
        vehicle: chosen,
        algorithm: algorithm.name,
        signSecret: dcConfig.signSecret,
        signTtlSec: dcConfig.signTtlSec,
      });

      // 6. 发布 events.commands
      const env = commandToEnvelope(command);
      await bus.publish(TOPICS.EVENTS_COMMANDS, env, {
        partitionKey: command.vehicle_id,
      });

      observability.metrics.dataFlowMessages.inc({
        topic: TOPICS.EVENTS_COMMANDS,
        direction: 'out',
      });

      observability.metrics.dispatchTasks.inc({
        task_type: task.task_type,
        algorithm: algorithm.name,
        result: 'dispatched',
      });

      const durationMs = Date.now() - startMs;
      observability.logger.info(
        {
          taskId: task.task_id,
          vehicleId: chosen.vehicle_id,
          algorithm: algorithm.name,
          durationMs,
        },
        '任务已调度',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      observability.logger.error({ taskId: task.task_id, err: message }, '任务处理失败');
    }
  }

  return {
    observability,
    dispatchConfig: dcConfig,
    registry,
    vehicles,

    async submitTask(task) {
      const parsed = parseTask(task);
      await handleTask(parsed);
    },

    async start() {
      await bus.connect();
      await observability.start();

      const sub = await bus.subscribe(
        TOPICS.TELEMETRY_RAW,
        (env) => {
          handleTelemetry(env);
          return Promise.resolve();
        },
        { groupId: dcConfig.consumerGroup },
      );
      subscriptions.push(sub);

      observability.addHealthTarget({
        name: 'bus',
        check: async () => bus.health(),
      });

      observability.addHealthTarget({
        name: 'algorithms',
        check: async () => ({
          status: registry.size() > 0 ? 'ok' : 'degraded',
          message: `algorithms: ${registry.names().join(',') || 'none'}`,
        }),
      });

      observability.logger.info(
        {
          consumerGroup: dcConfig.consumerGroup,
          algorithm: dcConfig.defaultAlgorithm,
          subscribedTopics: [TOPICS.TELEMETRY_RAW],
          publishedTopics: [TOPICS.EVENTS_COMMANDS],
        },
        'dispatch-core 已启动',
      );
    },

    async stop() {
      if (stopped) return;
      stopped = true;

      for (const sub of subscriptions) {
        await sub.unsubscribe();
      }
      subscriptions.length = 0;

      await bus.close();
      await observability.stop();

      observability.logger.info('dispatch-core 已停止');
    },
  };
}

/**
 * 带超时地调用算法，超时或抛错返回 null。
 */
async function tryAlgorithm(
  algorithm: DispatchAlgorithm,
  input: DispatchAlgorithmInput,
  timeoutMs: number,
): Promise<DispatchAlgorithmResult | null> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const promise = Promise.resolve().then(() => algorithm.rank(input));
    promise.catch(() => undefined);

    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`算法 ${algorithm.name} 超时 ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // 上层会用日志记录，这里只返回 null
    void message;
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
