import { RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_SEC } from './constants';

export interface RateLimiterOptions {
  /** 窗口内最大请求数 */
  maxRequests?: number;
  /** 窗口大小（秒） */
  windowSec?: number;
  /** 时间源，测试可注入 */
  now?: () => number;
}

export interface RateLimiter {
  /** 检查并消耗一次请求配额 */
  tryConsume(key: string): { allowed: boolean; remaining: number; resetAt: number };
  /** 重置某个 key 的计数 */
  reset(key: string): void;
  /** 清理过期条目 */
  cleanup(): void;
  /** 当前 key 数量 */
  size(): number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * 内存限流器。
 * 单进程有效，多实例部署需替换为 Redis 版。
 */
export function createRateLimiter(options: RateLimiterOptions = {}): RateLimiter {
  const {
    maxRequests = RATE_LIMIT_MAX_REQUESTS,
    windowSec = RATE_LIMIT_WINDOW_SEC,
    now = () => Date.now(),
  } = options;

  const buckets = new Map<string, Bucket>();
  const windowMs = windowSec * 1000;

  return {
    tryConsume(key) {
      const current = now();
      const bucket = buckets.get(key);

      if (!bucket || bucket.resetAt <= current) {
        const newBucket: Bucket = { count: 1, resetAt: current + windowMs };
        buckets.set(key, newBucket);
        return { allowed: true, remaining: maxRequests - 1, resetAt: newBucket.resetAt };
      }

      if (bucket.count >= maxRequests) {
        return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
      }

      bucket.count += 1;
      return { allowed: true, remaining: maxRequests - bucket.count, resetAt: bucket.resetAt };
    },

    reset(key) {
      buckets.delete(key);
    },

    cleanup() {
      const current = now();
      for (const [key, bucket] of buckets.entries()) {
        if (bucket.resetAt <= current) {
          buckets.delete(key);
        }
      }
    },

    size() {
      return buckets.size;
    },
  };
}
