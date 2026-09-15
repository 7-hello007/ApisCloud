import { createLogger } from '@apiscloud/libs';
import { createEnvelope, TOPICS } from '@apiscloud/message-bus';
import type { ObservabilityMetrics } from '@apiscloud/observability';
import {
  handleEventsCommands,
  type DispatchCommandPayload,
  type PgWriter,
} from '@apiscloud/data-writer';

interface MockPgWriter extends PgWriter {
  readonly commandCalls: unknown[][];
}

function createMockPgWriter(): MockPgWriter {
  const commandCalls: unknown[][] = [];
  return {
    commandCalls,
    async upsertVehicleLatest() {},
    async insertTelemetry() {},
    async insertAlert() {},
    async insertDispatchCommand(c) {
      commandCalls.push([c]);
    },
  };
}

function createMockMetrics(): ObservabilityMetrics {
  return {
    dataFlowMessages: { inc: jest.fn() },
  } as unknown as ObservabilityMetrics;
}

describe('dataWriter.eventsCommands', () => {
  const logger = createLogger({ service: 'test', level: 'silent' });

  function makeCommand(overrides: Partial<DispatchCommandPayload> = {}): DispatchCommandPayload {
    return {
      vehicle_id: 'v-000001',
      command_id: 'cmd-1',
      command_type: 'dispatch',
      payload: {
        task_id: 'task-1',
        task_type: 'passenger',
      },
      ...overrides,
    };
  }

  it('写 dispatch_commands 审计表', async () => {
    const pgWriter = createMockPgWriter();
    const metrics = createMockMetrics();
    const env = createEnvelope({
      topic: TOPICS.EVENTS_COMMANDS,
      source: 'dispatch-core',
      payload: makeCommand(),
    });

    await handleEventsCommands(env, { pgWriter, logger, metrics });

    expect(pgWriter.commandCalls).toHaveLength(1);
    expect(pgWriter.commandCalls[0][0]).toMatchObject({
      vehicle_id: 'v-000001',
      command_id: 'cmd-1',
      command_type: 'dispatch',
    });
  });

  it('递增 dataFlowMessages 指标', async () => {
    const pgWriter = createMockPgWriter();
    const metrics = createMockMetrics();
    const env = createEnvelope({
      topic: TOPICS.EVENTS_COMMANDS,
      source: 'dispatch-core',
      payload: makeCommand(),
    });

    await handleEventsCommands(env, { pgWriter, logger, metrics });

    expect(metrics.dataFlowMessages.inc).toHaveBeenCalledWith({
      topic: TOPICS.EVENTS_COMMANDS,
      direction: 'in',
    });
  });

  it('无 task_id 也能写', async () => {
    const pgWriter = createMockPgWriter();
    const metrics = createMockMetrics();
    const env = createEnvelope({
      topic: TOPICS.EVENTS_COMMANDS,
      source: 'dispatch-core',
      payload: makeCommand({ payload: {} }),
    });

    await handleEventsCommands(env, { pgWriter, logger, metrics });

    expect(pgWriter.commandCalls).toHaveLength(1);
  });
});
