import { NextResponse } from "next/server";
import { dayStatsKey, getRedis } from "@/lib/redis";
import { MAX_GUESSES } from "@/lib/constants";

/**
 * Daily-result telemetry. Each finished game POSTs once; we bump a per-day
 * histogram bucket in Redis ("1".."MAX_GUESSES" for wins, "X" for losses).
 * Reads are admin-gated by a shared token. Runs on the Node runtime so the
 * Upstash REST client is available.
 */
export const runtime = "nodejs";

const WIN_BUCKETS = Array.from({ length: MAX_GUESSES }, (_, i) => String(i + 1));
const VALID_BUCKETS = new Set<string>([...WIN_BUCKETS, "X"]);

export async function POST(request: Request) {
  const redis = getRedis();
  // No store configured: accept silently so the client never sees an error.
  if (!redis) return NextResponse.json({ ok: true, stored: false });

  let body: { day?: unknown; bucket?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const day = Number(body.day);
  const bucket = String(body.bucket);
  if (!Number.isInteger(day) || day < 1 || !VALID_BUCKETS.has(bucket)) {
    return NextResponse.json({ ok: false, error: "bad params" }, { status: 400 });
  }

  await redis.hincrby(dayStatsKey(day), bucket, 1);
  return NextResponse.json({ ok: true, stored: true });
}

export async function GET(request: Request) {
  const token = process.env.STATS_ADMIN_TOKEN;
  const provided = new URL(request.url).searchParams.get("token");
  if (!token || provided !== token) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const redis = getRedis();
  if (!redis) return NextResponse.json({ ok: false, error: "no store" }, { status: 503 });

  const day = Number(new URL(request.url).searchParams.get("day"));
  if (!Number.isInteger(day) || day < 1) {
    return NextResponse.json({ ok: false, error: "bad day" }, { status: 400 });
  }

  const hist = (await redis.hgetall<Record<string, number>>(dayStatsKey(day))) ?? {};
  const total = Object.values(hist).reduce((a, b) => a + Number(b), 0);
  const wins = WIN_BUCKETS.reduce((a, b) => a + Number(hist[b] ?? 0), 0);
  const avgGuesses =
    wins > 0
      ? WIN_BUCKETS.reduce((a, b) => a + Number(b) * Number(hist[b] ?? 0), 0) / wins
      : null;

  return NextResponse.json({ ok: true, day, total, wins, avgGuesses, histogram: hist });
}
