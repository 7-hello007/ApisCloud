import { safeCall, withTimeout } from '@apiscloud/plugin-host';

describe('pluginHost.guard', () => {
  describe('withTimeout', () => {
    it('正常完成', async () => {
      const r = await withTimeout(async () => 42, 1000, 'test');
      expect(r).toBe(42);
    });

    it('超时抛错', async () => {
      await expect(
        withTimeout(
          async () => {
            await new Promise((resolve) => setTimeout(resolve, 200));
            return 'too-late';
          },
          50,
          'slow',
        ),
      ).rejects.toThrow(/超时/);
    });

    it('内部抛错能透传', async () => {
      await expect(
        withTimeout(
          async () => {
            throw new Error('boom');
          },
          1000,
          'fail',
        ),
      ).rejects.toThrow('boom');
    });
  });

  describe('safeCall', () => {
    it('成功返回 ok', async () => {
      const onError = jest.fn();
      const r = await safeCall(async () => 'ok', onError, 'test');
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toBe('ok');
      expect(onError).not.toHaveBeenCalled();
    });

    it('失败返回 error', async () => {
      const onError = jest.fn();
      const r = await safeCall(
        async () => {
          throw new Error('boom');
        },
        onError,
        'test',
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.message).toContain('boom');
      expect(onError).toHaveBeenCalled();
    });

    it('同步函数也能处理', async () => {
      const r = await safeCall(() => 42, jest.fn(), 'sync');
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toBe(42);
    });
  });
});
