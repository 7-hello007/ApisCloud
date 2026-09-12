import jwt from 'jsonwebtoken';

import {
  JWT_ALGORITHM,
  JWT_DEFAULT_EXPIRES_IN,
  JWT_REFRESH_EXPIRES_IN,
} from './constants';

export interface JwtPayload {
  sub: string;
  role?: string;
  [key: string]: unknown;
}

export interface JwtOptions {
  secret: string;
  algorithm?: typeof JWT_ALGORITHM;
}

export interface JwtContext {
  sign(payload: JwtPayload, expiresIn?: string): string;
  signRefresh(payload: JwtPayload, expiresIn?: string): string;
  verify<T extends JwtPayload = JwtPayload>(token: string): T;
  decode<T extends JwtPayload = JwtPayload>(token: string): T | null;
}

/**
 * 创建 JWT 上下文。
 */
export function createJwt(options: JwtOptions): JwtContext {
  const { secret, algorithm = JWT_ALGORITHM } = options;

  function signWith(payload: JwtPayload, expiresIn: string): string {
    return jwt.sign(payload, secret, { algorithm, expiresIn } as jwt.SignOptions);
  }

  return {
    sign(payload, expiresIn = JWT_DEFAULT_EXPIRES_IN) {
      return signWith(payload, expiresIn);
    },

    signRefresh(payload, expiresIn = JWT_REFRESH_EXPIRES_IN) {
      return signWith(payload, expiresIn);
    },

    verify<T extends JwtPayload = JwtPayload>(token: string): T {
      try {
        const decoded = jwt.verify(token, secret, { algorithms: [algorithm] });
        if (typeof decoded === 'string') {
          throw new Error('JWT payload 不是对象');
        }
        return decoded as T;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`JWT 校验失败：${message}`);
      }
    },

    decode<T extends JwtPayload = JwtPayload>(token: string): T | null {
      const decoded = jwt.decode(token);
      if (!decoded || typeof decoded === 'string') return null;
      return decoded as T;
    },
  };
}
