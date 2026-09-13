import { loadConfig } from '@apiscloud/libs';

import { createDispatchCoreService } from './service';

/**
 * 独立启动 dispatch-core 服务。
 * 用法：node dist/server-entry.js
 */
async function main() {
  const config = loadConfig({ SERVICE_NAME: 'dispatch-core' });
  const port = Number(process.env.DISPATCH_CORE_PORT ?? 9105);

  const service = createDispatchCoreService({ config, port });

  await service.start();

  const shutdown = async (signal: string) => {
    service.observability.logger.info({ signal }, '收到退出信号，准备关闭');
    await service.stop();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('dispatch-core 启动失败：', err);
  process.exit(1);
});
