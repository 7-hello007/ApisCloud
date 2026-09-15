/**
 * 给 Promise 加超时控制。
 * 超时抛错，定时器清理，原始 Promise 拒绝不会变成未处理拒绝。
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;

  const promise = Promise.resolve().then(fn);
  // 阻止未处理的拒绝
  promise.catch(() => undefined);

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} 超时 ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type SafeResult<T> = { ok: true; value: T } | { ok: false; error: Error };

/**
 * 安全调用：捕获异常，不抛出。
 */
export async function safeCall<T>(
  fn: () => Promise<T> | T,
  onError: (err: Error) => void,
  label: string,
): Promise<SafeResult<T>> {
  try {
    const result = await fn();
    return { ok: true, value: result };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    onError(new Error(`[${label}] ${error.message}`));
    return { ok: false, error };
  }
}
