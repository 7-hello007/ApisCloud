import jwt from 'jsonwebtoken';
import { z } from 'zod';

import type { AppConfig } from '../config';

export interface JwtPayload {
  sub: string;
  role?: string;
  [key: string]: unknown;
}

export interface SecurityContext {
  signJwt(payload: JwtPayload, expiresIn?: string): string;
  verifyJwt(token: string): JwtPayload;
  validate<T>(schema: z.ZodType<T>, data: unknown): T;
}

export function createSecurity(config: AppConfig): SecurityContext {
  return {
    signJwt(payload, expiresIn = '1h') {
      return jwt.sign(payload, config.JWT_SECRET, { expiresIn } as jwt.SignOptions);
    },

    verifyJwt(token) {
      try {
        const decoded = jwt.verify(token, config.JWT_SECRET);
        if (typeof decoded === 'string') {
          throw new Error('invalid jwt payload');
        }
        return decoded as JwtPayload;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`JWT 校验失败：${message}`);
      }
    },

    validate<T>(schema: z.ZodType<T>, data: unknown): T {
      const parsed = schema.safeParse(data);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ');
        throw new Error(`输入校验失败：${issues}`);
      }
      return parsed.data;
    },
  };
}

export { z };
