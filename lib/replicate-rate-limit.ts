/** Initial call + up to 3 retries when Replicate returns rate limiting. */
export const REPLICATE_THROTTLE_MAX_ATTEMPTS = 4;

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function replicateBackoffMs(attemptIndex: number): number {
  const base = 800;
  const cap = 8000;
  return Math.min(cap, base * 2 ** attemptIndex + Math.floor(Math.random() * 400));
}

export function isReplicateRateLimitedError(err: unknown): boolean {
  if (err && typeof err === "object" && "response" in err) {
    const res = (err as { response?: { status?: number } }).response;
    if (res && typeof res.status === "number" && res.status === 429) {
      return true;
    }
  }
  const msg = err instanceof Error ? err.message : String(err);
  return /429|rate\s*limit|too\s+many\s+requests|throttl/i.test(msg);
}

export async function withReplicateRateLimitRetries<T>(run: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < REPLICATE_THROTTLE_MAX_ATTEMPTS; attempt++) {
    try {
      return await run();
    } catch (err) {
      lastErr = err;
      const canRetry =
        attempt < REPLICATE_THROTTLE_MAX_ATTEMPTS - 1 && isReplicateRateLimitedError(err);
      if (!canRetry) throw err;
      await sleep(replicateBackoffMs(attempt));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
