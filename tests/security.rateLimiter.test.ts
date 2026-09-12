import { createRateLimiter } from '@apiscloud/libs';

describe('security.rateLimiter', () => {
  it('窗口内限额', () => {
    const limiter = createRateLimiter({ maxRequests: 3, windowSec: 60 });
    expect(limiter.tryConsume('key1').allowed).toBe(true);
    expect(limiter.tryConsume('key1').allowed).toBe(true);
    expect(limiter.tryConsume('key1').allowed).toBe(true);
    expect(limiter.tryConsume('key1').allowed).toBe(false);
  });

  it('不同 key 独立', () => {
    const limiter = createRateLimiter({ maxRequests: 1, windowSec: 60 });
    expect(limiter.tryConsume('a').allowed).toBe(true);
    expect(limiter.tryConsume('b').allowed).toBe(true);
  });

  it('窗口过期后重置', () => {
    let time = 1000;
    const limiter = createRateLimiter({
      maxRequests: 1,
      windowSec: 1,
      now: () => time,
    });
    expect(limiter.tryConsume('key').allowed).toBe(true);
    expect(limiter.tryConsume('key').allowed).toBe(false);

    time += 2000;
    expect(limiter.tryConsume('key').allowed).toBe(true);
  });

  it('remaining 正确', () => {
    const limiter = createRateLimiter({ maxRequests: 3, windowSec: 60 });
    expect(limiter.tryConsume('k').remaining).toBe(2);
    expect(limiter.tryConsume('k').remaining).toBe(1);
    expect(limiter.tryConsume('k').remaining).toBe(0);
  });

  it('reset 重置', () => {
    const limiter = createRateLimiter({ maxRequests: 1, windowSec: 60 });
    limiter.tryConsume('k');
    limiter.reset('k');
    expect(limiter.tryConsume('k').allowed).toBe(true);
  });

  it('cleanup 清理过期', () => {
    let time = 1000;
    const limiter = createRateLimiter({
      maxRequests: 1,
      windowSec: 1,
      now: () => time,
    });
    limiter.tryConsume('a');
    limiter.tryConsume('b');
    expect(limiter.size()).toBe(2);

    time += 2000;
    limiter.cleanup();
    expect(limiter.size()).toBe(0);
  });
});
