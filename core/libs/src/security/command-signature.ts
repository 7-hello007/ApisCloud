import { createHmac, timingSafeEqual } from 'node:crypto';

import { COMMAND_SIGN_ALGORITHM, COMMAND_SIGNATURE_TTL_SEC } from './constants';

export interface SignableCommand {
  command_id: string;
  vehicle_id: string;
  task_id?: string;
  command_type: string;
  payload: unknown;
  issued_at: number;
}

export interface SignedCommand {
  command: SignableCommand;
  signature: string;
  algorithm: string;
}

export interface CommandSignatureContext {
  sign(command: SignableCommand): SignedCommand;
  verify(signed: SignedCommand): { ok: true } | { ok: false; error: string };
}

export interface CommandSignatureOptions {
  secret: string;
  /** 签名有效期（秒），默认 60 */
  ttlSec?: number;
}

/**
 * 生成命令的规范化字符串。
 * 顺序固定，避免 JSON key 顺序不同导致签名不一致。
 */
function canonicalize(command: SignableCommand): string {
  return [
    command.command_id,
    command.vehicle_id,
    command.task_id ?? '',
    command.command_type,
    JSON.stringify(command.payload),
    String(command.issued_at),
  ].join('|');
}

/**
 * 创建指令签名上下文。
 * 用于阶段三：平台下发给外部系统的调度指令。
 */
export function createCommandSignature(options: CommandSignatureOptions): CommandSignatureContext {
  const { secret, ttlSec = COMMAND_SIGNATURE_TTL_SEC } = options;

  function computeSignature(command: SignableCommand): string {
    return createHmac(COMMAND_SIGN_ALGORITHM, secret).update(canonicalize(command)).digest('hex');
  }

  return {
    sign(command) {
      return {
        command,
        signature: computeSignature(command),
        algorithm: COMMAND_SIGN_ALGORITHM,
      };
    },

    verify(signed) {
      const { command, signature } = signed;

      // 时间窗校验
      const now = Math.floor(Date.now() / 1000);
      const age = now - command.issued_at;
      if (age > ttlSec) {
        return { ok: false, error: `指令已过期（${age}s > ${ttlSec}s）` };
      }
      if (age < -ttlSec) {
        return { ok: false, error: '指令时间戳在未来' };
      }

      // 签名校验
      const expected = computeSignature(command);
      const expectedBuf = Buffer.from(expected, 'hex');
      const actualBuf = Buffer.from(signature, 'hex');

      if (expectedBuf.length !== actualBuf.length) {
        return { ok: false, error: '签名长度不匹配' };
      }
      if (!timingSafeEqual(expectedBuf, actualBuf)) {
        return { ok: false, error: '签名校验失败' };
      }

      return { ok: true };
    },
  };
}
