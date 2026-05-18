import "server-only";

/**
 * Retry a function on transient errors (503 UNAVAILABLE, 429 RATE_LIMITED).
 * Exponential backoff: 5s, 15s, 30s, 60s.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { label: string; maxRetries?: number } = { label: "op" },
): Promise<T> {
  const max = opts.maxRetries ?? 4;
  const waits = [5_000, 15_000, 30_000, 60_000];
  let lastErr: unknown;
  for (let i = 0; i <= max; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isRetryable =
        msg.includes("503") || msg.includes("UNAVAILABLE")
        || msg.includes("429") || msg.includes("RATE_LIMITED")
        || msg.includes("high demand") || msg.includes("temporarily unavailable")
        || msg.includes("quota");
      if (!isRetryable || i === max) throw err;
      const wait = waits[Math.min(i, waits.length - 1)];
      console.warn(`[retry] ${opts.label} attempt ${i + 1} failed (${msg.slice(0, 100)}), waiting ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}
