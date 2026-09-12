import { loadConfig } from '@apiscloud/libs';

import { createObservabilityService } from './service';

/**
 * 独立启动可观测性服务。
 * 用法：node dist/server-entry.js
 */
async function main() {
  const config = loadConfig();
  const port = Number(process.env.OBSERVABILITY_PORT ?? 9106);

  const service = createObservabilityService({
    service: 'observability',
    layer: config.LAYER,
    port,
    logLevel: config.LOG_LEVEL,
    prettyLogs: config.NODE_ENV === 'development',
  });

  await service.start();

  const shutdown = async (signal: string) => {
    service.logger.info({ signal }, '收到退出信号，准备关闭');
    await service.stop();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('可观测性服务启动失败：', err);
  process.exit(1);
});
