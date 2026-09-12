import { loadConfig } from '@apiscloud/libs';

import { createIngestService } from './service';

/**
 * 独立启动 ingest 服务。
 * 用法：node dist/server-entry.js
 */
async function main() {
  const config = loadConfig({ SERVICE_NAME: 'ingest' });
  const port = Number(process.env.INGEST_PORT ?? 9103);

  const service = createIngestService({ config, port });

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
  console.error('ingest 启动失败：', err);
  process.exit(1);
});