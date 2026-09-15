import { createMessageBus } from '@apiscloud/message-bus';
import { loadConfig, resetConfig } from '@apiscloud/libs';

describe('messageBus.switch', () => {
  beforeEach(() => {
    resetConfig();
  });

  it('MESSAGE_BUS=memory 返回 MemoryAdapter', () => {
    const config = loadConfig({ MESSAGE_BUS: 'memory' });
    const bus = createMessageBus(config);
    expect(bus.type).toBe('memory');
  });

  it('MESSAGE_BUS=mqtt 返回 MqttAdapter', async () => {
    const config = loadConfig({ MESSAGE_BUS: 'mqtt' });
    const bus = createMessageBus(config);
    expect(bus.type).toBe('mqtt');
    await bus.close();
  });

  it('MESSAGE_BUS=kafka 返回 KafkaAdapter', async () => {
    const config = loadConfig({ MESSAGE_BUS: 'kafka' });
    const bus = createMessageBus(config);
    expect(bus.type).toBe('kafka');
    await bus.close();
  });
});
