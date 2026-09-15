import { randomUUID } from 'node:crypto';

import { createCommandSignature, type SignableCommand } from '@apiscloud/libs';

import type { CommandType, DispatchCommandPayload, DispatchTask, DispatchVehicle } from './types';

export interface BuildCommandOptions {
  task: DispatchTask;
  vehicle: DispatchVehicle;
  algorithm: string;
  signSecret: string;
  signTtlSec: number;
}

export interface BuiltCommand {
  vehicle_id: string;
  command_id: string;
  command_type: CommandType;
  payload: DispatchCommandPayload;
}

/**
 * 构建调度命令。
 * 结构符合 ingest 的 DownlinkCommand：
 *   { vehicle_id, command_id, command_type, payload }
 * 签名结果放在 payload.signed 里。
 */
export function buildDispatchCommand(options: BuildCommandOptions): BuiltCommand {
  const { task, vehicle, signSecret, signTtlSec } = options;

  const commandId = randomUUID();
  const issuedAt = Math.floor(Date.now() / 1000);

  const signable: SignableCommand = {
    command_id: commandId,
    vehicle_id: vehicle.vehicle_id,
    task_id: task.task_id,
    command_type: 'dispatch',
    payload: {
      origin: task.origin,
      destination: task.destination,
      task_type: task.task_type,
    },
    issued_at: issuedAt,
  };

  const signatureCtx = createCommandSignature({
    secret: signSecret,
    ttlSec: signTtlSec,
  });
  const signed = signatureCtx.sign(signable);

  return {
    vehicle_id: vehicle.vehicle_id,
    command_id: commandId,
    command_type: 'dispatch',
    payload: {
      task_id: task.task_id,
      task_type: task.task_type,
      origin: task.origin,
      destination: task.destination,
      issued_at: issuedAt,
      signed: {
        command: {
          command_id: signed.command.command_id,
          vehicle_id: signed.command.vehicle_id,
          task_id: signed.command.task_id ?? task.task_id,
          command_type: signed.command.command_type,
          payload: signed.command.payload,
          issued_at: signed.command.issued_at,
        },
        signature: signed.signature,
        algorithm: signed.algorithm,
      },
    },
  };
}
