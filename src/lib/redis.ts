import { Redis } from "@upstash/redis";

/**
 * Lazily-constructed Upstash Redis client. Returns null when the env vars are
 * absent (e.g. local dev without `vercel env pull`, or PRs without the
 * integration) so callers can degrade gracefully instead of crashing.
 */
let cached: Redis | null | undefined;

export function getRedis(): Redis | null {
  if (cached !== undefined) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  cached = url && token ? new Redis({ url, token }) : null;
  return cached;
}

/** Redis hash key holding a guess-count histogram for a given puzzle day. */
export function dayStatsKey(day: number): string {
  return `stats:day:${day}`;
}
