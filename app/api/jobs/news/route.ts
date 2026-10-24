import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { cronAuthorized, forbidden } from "@/lib/jobs";
import { loadWatched } from "@/lib/brain/match";
import { collectArtistNews, collectGenericNews } from "@/lib/collectors/news";
import { ARTIST_NEWS_SOURCE } from "@/lib/collectors/sources";
import { finishRun, markSource, startRun } from "@/lib/collectors/shared";

export const maxDuration = 60;

// RSS collector: the next batch of watched artists (cursor in sources.config), plus the generic feeds due.
export async function POST(req: Request) {
  if (!cronAuthorized(req)) return forbidden();
  const db = getDb();
  const run = await startRun(db, "news");
  const errors: string[] = [];
  let newItems = 0;
  try {
    const watched = (await loadWatched(db)).sort((a, b) => a.id.localeCompare(b.id));
    const [artistSrc] = await db.select().from(schema.sources).where(eq(schema.sources.name, ARTIST_NEWS_SOURCE));
    if (artistSrc && watched.length) {
      const cfg = (artistSrc.config ?? {}) as { cursor?: number; batchSize?: number };
      const size = cfg.batchSize ?? 15;
      const start = (cfg.cursor ?? 0) % watched.length;
      const batch = [...watched.slice(start), ...watched.slice(0, start)].slice(0, size);
      const r = await collectArtistNews(db, artistSrc.id, batch);
      newItems += r.newItems;
      errors.push(...r.errors);
      await markSource(db, artistSrc.id, { ok: r.failedFeeds < r.feeds, error: r.errors[0], config: { ...cfg, cursor: (start + size) % watched.length } });
    }
    const generic = (await db.select().from(schema.sources).where(eq(schema.sources.kind, "news_rss"))).filter((s) => s.name !== ARTIST_NEWS_SOURCE && s.enabled);
    for (const s of generic) {
      const due = !s.lastRunAt || Date.now() - s.lastRunAt.getTime() >= (s.intervalMinutes ?? 60) * 60_000;
      if (!due) continue;
      const q = (s.config as { query?: string } | null)?.query;
      if (!q) continue;
      const r = await collectGenericNews(db, s.id, q, watched);
      newItems += r.newItems;
      errors.push(...r.errors);
      await markSource(db, s.id, { ok: r.failedFeeds === 0, error: r.errors[0] });
    }
    await finishRun(db, run, { itemsIn: newItems, errors });
    return Response.json({ ok: true, newItems, errors });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    await finishRun(db, run, { errors: [msg, ...errors] });
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
