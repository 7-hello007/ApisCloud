import { z } from 'zod';

import type { AppConfig } from '../config';

import { createJwt } from './jwt';
import { createValidation } from './validation';

// ============================================================
// 常量
// ============================================================
export {
  JWT_ALGORITHM,
  JWT_DEFAULT_EXPIRES_IN,
  JWT_REFRESH_EXPIRES_IN,
  JWT_SECRET_MIN_LENGTH,
  COMMAND_SIGN_ALGORITHM,
  COMMAND_SIGNATURE_TTL_SEC,
  REPLAY_NONCE_TTL_SEC,
  RATE_LIMIT_WINDOW_SEC,
  RATE_LIMIT_MAX_REQUESTS,
  VALIDATION_MAX_STRING_LENGTH,
} from './constants';

// ============================================================
// JWT
// ============================================================
export { createJwt } from './jwt';
export type { JwtContext, JwtPayload, JwtOptions } from './jwt';

// ============================================================
// 认证
// ============================================================
export { createAuthMiddleware } from './auth';
export type { AuthOptions, AuthResult, AuthenticatedRequest } from './auth';

// ============================================================
// 输入验证
// ============================================================
export { createValidation } from './validation';
export type { ValidationContext } from './validation';
export {
  SafeString,
  SafeName,
  VehicleId,
  TaskId,
  Latitude,
  Longitude,
  Position,
  Battery,
  TimeWindow,
  Priority,
  EnvelopeSchema,
} from './validation';

// ============================================================
// 密钥管理
// ============================================================
export { createSecrets } from './secrets';
export type { SecretProvider, SecretsOptions } from './secrets';

// ============================================================
// 指令签名
// ============================================================
export { createCommandSignature } from './command-signature';
export type {
  SignableCommand,
  SignedCommand,
  CommandSignatureContext,
  CommandSignatureOptions,
} from './command-signature';

// ============================================================
// 限流
// ============================================================
export { createRateLimiter } from './rate-limiter';
export type { RateLimiter, RateLimiterOptions } from './rate-limiter';

// ============================================================
// 防重放
// ============================================================
export { createReplayGuard } from './replay-guard';
export type { ReplayGuard, ReplayGuardOptions } from './replay-guard';

// ============================================================
// 向后兼容：旧 API
// ============================================================

export { z };

export interface LegacySecurityContext {
  signJwt(payload: { sub: string; [key: string]: unknown }, expiresIn?: string): string;
  verifyJwt(token: string): { sub: string; [key: string]: unknown };
  validate<T>(schema: z.ZodType<T>, data: unknown): T;
}

/**
 * 兼容旧版本的 createSecurity。
 * 内部用新模块组合。
 */
export function createSecurity(config: AppConfig): LegacySecurityContext {
  const jwt = createJwt({ secret: config.JWT_SECRET });
  const validation = createValidation();

  return {
    signJwt(payload, expiresIn) {
      return jwt.sign(payload as never, expiresIn);
    },
    verifyJwt(token) {
      return jwt.verify(token);
    },
    validate(schema, data) {
      return validation.validate(schema, data);
    },
  };
}
