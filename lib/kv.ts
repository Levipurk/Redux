import { kv } from "@vercel/kv";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

/**
 * Hourly sliding-window rate limit keyed per user + feature.
 * Key: rate:{feature}:{userId}  TTL: 3600 s
 *
 * Falls back to "allowed" when Vercel KV is not configured (local dev).
 */
export async function checkRateLimit(
  userId: string,
  feature: string,
  limit: number,
): Promise<RateLimitResult> {
  if (!process.env.KV_REST_API_URL) {
    return { allowed: true, remaining: limit };
  }

  try {
    const key = `rate:${feature}:${userId}`;
    const count = await kv.incr(key);
    if (count === 1) {
      await kv.expire(key, 3600);
    }
    return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
  } catch {
    // KV unavailable — fail open so users aren't blocked
    return { allowed: true, remaining: limit };
  }
}

/**
 * Daily limit keyed per user + feature + calendar date (UTC).
 * Key: daily:{feature}:{userId}:{YYYY-MM-DD}  TTL: 86400 s
 *
 * Falls back to "allowed" when Vercel KV is not configured (local dev).
 */
export async function checkDailyLimit(
  userId: string,
  feature: string,
  dailyLimit: number,
): Promise<RateLimitResult> {
  if (!process.env.KV_REST_API_URL) {
    return { allowed: true, remaining: dailyLimit };
  }

  try {
    const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD UTC
    const key = `daily:${feature}:${userId}:${date}`;
    const count = await kv.incr(key);
    if (count === 1) {
      await kv.expire(key, 86400);
    }
    return { allowed: count <= dailyLimit, remaining: Math.max(0, dailyLimit - count) };
  } catch {
    return { allowed: true, remaining: dailyLimit };
  }
}
