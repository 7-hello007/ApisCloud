export interface WaitForOptions {
  timeoutMs?: number;
  intervalMs?: number;
}

/**
 * 等待条件成立。
 * 用于异步断言，避免用 setTimeout 硬等。
 */
export async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  options: WaitForOptions = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 2000;
  const intervalMs = options.intervalMs ?? 10;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`waitFor 超时（${timeoutMs}ms）`);
}

/**
 * 短暂的 delay，仅在无法用 waitFor 时使用。
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
