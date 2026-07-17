import { NextResponse } from "next/server";

/**
 * Dev-only editor API. Reads/writes the game's data files through the shared
 * sync engine (scripts/lib/entries.mjs) so the browser editor stays consistent
 * with the CLI. Returns 404 in production so it never ships as a live endpoint.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isDev = process.env.NODE_ENV !== "production";

// Imported lazily so the (heavy, fs-touching) engine isn't pulled into prod.
async function engine() {
  return import(
    /* webpackIgnore: true */ "../../../../scripts/lib/entries.mjs"
  );
}

const notFound = () => NextResponse.json({ error: "not found" }, { status: 404 });

export async function GET() {
  if (!isDev) return notFound();
  const { loadPool } = await engine();
  const pool = await loadPool();
  return NextResponse.json({ pool });
}

export async function POST(request: Request) {
  if (!isDev) return notFound();

  let body: {
    action?: string;
    entry?: Record<string, unknown>;
    opts?: Record<string, unknown>;
    id?: string;
    to?: number;
    qid?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const eng = await engine();
  try {
    switch (body.action) {
      case "validate": {
        const pool = await eng.loadPool();
        const norm = eng.normalizeEntry(body.entry ?? {});
        const selfId = pool.some((p: { id: string }) => p.id === norm.id)
          ? norm.id
          : null;
        const result = eng.validateEntry(norm, pool, selfId);
        return NextResponse.json(result);
      }
      case "upsert": {
        const result = await eng.upsertEntry(body.entry ?? {}, body.opts ?? {});
        return NextResponse.json({ ok: true, ...result });
      }
      case "move": {
        const result = await eng.moveEntry(body.id, Number(body.to));
        return NextResponse.json({ ok: true, ...result });
      }
      case "exclude": {
        await eng.excludeEntry(body.qid);
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
