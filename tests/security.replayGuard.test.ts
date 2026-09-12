import { createReplayGuard } from '@apiscloud/libs';

describe('security.replayGuard', () => {
  it('首次 nonce 通过', () => {
    const guard = createReplayGuard();
    expect(guard.check('nonce-1').ok).toBe(true);
  });

  it('重复 nonce 拒绝', () => {
    const guard = createReplayGuard();
    guard.check('nonce-1');
    const result = guard.check('nonce-1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('已被使用');
  });

  it('空 nonce 拒绝', () => {
    const guard = createReplayGuard();
    expect(guard.check('').ok).toBe(false);
  });

  it('不同 nonce 独立', () => {
    const guard = createReplayGuard();
    expect(guard.check('a').ok).toBe(true);
    expect(guard.check('b').ok).toBe(true);
  });

  it('过期后 nonce 可重用', () => {
    let time = 1000;
    const guard = createReplayGuard({ ttlSec: 1, now: () => time });
    guard.check('n');
    expect(guard.check('n').ok).toBe(false);

    time += 2000;
    expect(guard.check('n').ok).toBe(true);
  });

  it('cleanup 清理过期', () => {
    let time = 1000;
    const guard = createReplayGuard({ ttlSec: 1, now: () => time });
    guard.check('a');
    guard.check('b');
    expect(guard.size()).toBe(2);

    time += 2000;
    guard.cleanup();
    expect(guard.size()).toBe(0);
  });
});
