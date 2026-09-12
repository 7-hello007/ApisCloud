#!/usr/bin/env node
'use strict';

const { Kafka } = require('kafkajs');

/**
 * 消息总线主题配置。
 * 分区数和保留策略按主题用途区分。
 */
const TOPIC_CONFIGS = [
  {
    topic: 'telemetry.raw',
    numPartitions: 6,
    replicationFactor: 1,
    configEntries: [
      { name: 'retention.ms', value: String(6 * 60 * 60 * 1000) }, // 6h
      { name: 'cleanup.policy', value: 'delete' },
    ],
    description: '原始遥测（高频，短期保留）',
  },
  {
    topic: 'telemetry.aggregated',
    numPartitions: 3,
    replicationFactor: 1,
    configEntries: [
      { name: 'retention.ms', value: String(72 * 60 * 60 * 1000) }, // 72h
      { name: 'cleanup.policy', value: 'delete' },
    ],
    description: '聚合遥测（低频，中期保留）',
  },
  {
    topic: 'events.commands',
    numPartitions: 3,
    replicationFactor: 1,
    configEntries: [
      { name: 'retention.ms', value: String(7 * 24 * 60 * 60 * 1000) }, // 7d
      { name: 'cleanup.policy', value: 'delete' },
    ],
    description: '调度指令（事件，长期保留）',
  },
  {
    topic: 'events.alerts',
    numPartitions: 3,
    replicationFactor: 1,
    configEntries: [
      { name: 'retention.ms', value: String(7 * 24 * 60 * 60 * 1000) }, // 7d
      { name: 'cleanup.policy', value: 'delete' },
    ],
    description: '告警事件（事件，长期保留）',
  },
];

function getBrokers() {
  const brokers = process.env.KAFKA_BROKERS ?? 'localhost:29092';
  return brokers.split(',').map((b) => b.trim());
}

async function initTopics() {
  const brokers = getBrokers();
  console.log(`[init-topics] 连接 Kafka：${brokers.join(', ')}`);

  const kafka = new Kafka({
    clientId: 'apiscloud-init-topics',
    brokers,
  });

  const admin = kafka.admin();
  await admin.connect();

  try {
    const existing = await admin.listTopics();
    console.log(`[init-topics] 已存在 ${existing.length} 个主题`);

    const toCreate = TOPIC_CONFIGS.filter((c) => !existing.includes(c.topic));

    if (toCreate.length === 0) {
      console.log('[init-topics] 所有主题已存在，无需创建');
      return;
    }

    console.log(`[init-topics] 创建 ${toCreate.length} 个主题：`);
    for (const c of toCreate) {
      console.log(
        `  - ${c.topic} (${c.description}, 分区=${c.numPartitions}, 保留=${
          c.configEntries.find((e) => e.name === 'retention.ms')?.value ?? 'default'
        }ms)`,
      );
    }

    await admin.createTopics({
      topics: toCreate.map((c) => ({
        topic: c.topic,
        numPartitions: c.numPartitions,
        replicationFactor: c.replicationFactor,
        configEntries: c.configEntries,
      })),
      waitForLeaders: true,
    });

    console.log('[init-topics] 主题创建完成');
  } finally {
    await admin.disconnect();
  }
}

if (require.main === module) {
  initTopics().catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[init-topics] 失败：${message}`);
    process.exit(1);
  });
}

module.exports = { initTopics, TOPIC_CONFIGS };
