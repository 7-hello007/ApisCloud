import { REPLAY_NONCE_TTL_SEC } from './constants';

export interface ReplayGuardOptions {
  /** nonce 有效期（秒） */
  ttlSec?: number;
  /** 时间源，测试可注入 */
  now?: () => number;
}

export interface ReplayGuard {
  /** 检查并记录 nonce，返回是否允许 */
  check(nonce: string): { ok: true } | { ok: false; error: string };
  /** 清理过期 nonce */
  cleanup(): void;
  /** 当前 nonce 数量 */
  size(): number;
}

/**
 * 防重放守卫。
 * 记录已用过的 nonce，同一 nonce 在 TTL 内只允许一次。
 * 内存版，多实例部署需替换为 Redis 版。
 */
export function createReplayGuard(options: ReplayGuardOptions = {}): ReplayGuard {
  const { ttlSec = REPLAY_NONCE_TTL_SEC, now = () => Date.now() } = options;

  const seen = new Map<string, number>();
  const ttlMs = ttlSec * 1000;

  function evictExpired(current: number): void {
    for (const [nonce, expireAt] of seen.entries()) {
      if (expireAt <= current) {
        seen.delete(nonce);
      }
    }
  }

  return {
    check(nonce) {
      if (!nonce || nonce.length === 0) {
        return { ok: false, error: 'nonce 不能为空' };
      }

      const current = now();
      evictExpired(current);

      if (seen.has(nonce)) {
        return { ok: false, error: `nonce 已被使用：${nonce}` };
      }

      seen.set(nonce, current + ttlMs);
      return { ok: true };
    },

    cleanup() {
      evictExpired(now());
    },

    size() {
      return seen.size;
    },
  };
}
