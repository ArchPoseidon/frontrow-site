import { and, eq, gte, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { cronAuthorized, forbidden } from "@/lib/jobs";
import { loadWatched } from "@/lib/brain/match";
import { sweepArtist } from "@/lib/collectors/sweep";
import { SWEEP_SOURCE } from "@/lib/collectors/sources";
import { finishRun, markSource, startRun } from "@/lib/collectors/shared";
import { mapLimit } from "@/lib/util/retry";

export const maxDuration = 60;

// Grounded sweep: the next batch of 5 must-see artists not swept today (cap 25 a day).
export async function POST(req: Request) {
  if (!cronAuthorized(req)) return forbidden();
  const db = getDb();
  const run = await startRun(db, "sweep");
  try {
    const [src] = await db.select().from(schema.sources).where(eq(schema.sources.name, SWEEP_SOURCE));
    const cfg = (src?.config ?? {}) as { batchSize?: number; dailyCap?: number };
    const dayStart = new Date(Date.now() - 20 * 3600 * 1000);
    const [{ n: doneToday }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.artists).where(gte(schema.artists.lastCheckedAt, dayStart));
    const room = Math.max(0, (cfg.dailyCap ?? 25) - doneToday);
    const mustSee = await db
      .selectDistinct({ id: schema.userArtists.artistId })
      .from(schema.userArtists)
      .innerJoin(schema.artists, eq(schema.artists.id, schema.userArtists.artistId))
      .where(and(eq(schema.userArtists.priority, "must_see"), sql`(${schema.artists.lastCheckedAt} is null or ${schema.artists.lastCheckedAt} < ${dayStart})`))
      .limit(Math.min(cfg.batchSize ?? 5, room));
    const watched = await loadWatched(db, mustSee.map((m) => m.id));
    const results = await mapLimit(watched, 3, (a) => sweepArtist(db, src?.id ?? null, a));
    const errors = results.flatMap((r) => (r.error ? [r.error] : []));
    if (src) await markSource(db, src.id, { ok: errors.length < results.length || !results.length, error: errors[0] });
    await finishRun(db, run, { itemsIn: results.filter((r) => r.rawItemId).length, errors });
    return Response.json({ ok: true, swept: results.length, withShows: results.filter((r) => r.found).length, errors });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    await finishRun(db, run, { errors: [msg] });
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
