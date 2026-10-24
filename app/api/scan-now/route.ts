import { and, desc, eq, gte } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { auth } from "@/auth";
import { loadWatched } from "@/lib/brain/match";
import { collectArtistNews } from "@/lib/collectors/news";
import { ARTIST_NEWS_SOURCE } from "@/lib/collectors/sources";
import { processItems } from "@/lib/brain/process";
import { upcomingForUser } from "@/lib/brain/scan";
import { dispatchAlerts } from "@/lib/notify/dispatch";
import { finishRun, markSource, startRun } from "@/lib/collectors/shared";
import { formatShowDate } from "@/lib/util/ist";
import { track } from "@/lib/track";
import { sseResponse } from "@/lib/util/sse";

export const maxDuration = 60;
const GAP_MS = 2 * 60 * 1000;
const MAX_ARTISTS = 40;

// Scan now: news -> process -> dispatch for one user's artists, streaming progress.
// Signed-in: 1 per 2 minutes per user. `?demo=1` (public): the owner's artists, 1 per 2 minutes globally, no alerts sent.
export async function POST(req: Request) {
  const db = getDb();
  const demo = new URL(req.url).searchParams.get("demo") === "1";
  let userId: string | null = null;
  if (demo) {
    const [o] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.isOwner, true));
    userId = o?.id ?? null;
  } else {
    userId = (await auth())?.user?.id ?? null;
    if (!userId) return Response.json({ error: "Please sign in" }, { status: 401 });
  }
  if (!userId) return Response.json({ error: "Nothing to scan yet" }, { status: 404 });

  if (!demo) await track(db, "scan_now", userId);
  const job = demo ? "scan-now:demo" : `scan-now:${userId}`;
  const [last] = await db
    .select({ startedAt: schema.runs.startedAt })
    .from(schema.runs)
    .where(and(eq(schema.runs.job, job), gte(schema.runs.startedAt, new Date(Date.now() - GAP_MS))))
    .orderBy(desc(schema.runs.startedAt))
    .limit(1);
  if (last?.startedAt) {
    const wait = Math.ceil((GAP_MS - (Date.now() - last.startedAt.getTime())) / 1000);
    return Response.json({ error: demo ? `Someone just scanned. Try again in ${wait}s.` : `You scanned a moment ago. Try again in ${wait}s.`, retryAfter: wait }, { status: 429, headers: { "Retry-After": String(wait) } });
  }
  const run = await startRun(db, job);
  const uid = userId;

  return sseResponse(async (emit) => {
    const errors: string[] = [];
    let eventsNew = 0;
    let credits = 0;
    let alertsSent = 0;
    try {
      const mine = await db
        .select({ id: schema.userArtists.artistId, p: schema.userArtists.priority })
        .from(schema.userArtists)
        .where(eq(schema.userArtists.userId, uid));
      const order = [...mine].filter((m) => m.p !== "muted").sort((a, b) => (a.p === "must_see" ? 0 : 1) - (b.p === "must_see" ? 0 : 1));
      const watched = await loadWatched(db, order.slice(0, MAX_ARTISTS).map((m) => m.id));
      if (!watched.length) {
        emit("log", { text: "You have no artists to scan yet." });
        emit("done", { newEvents: 0 });
        return;
      }
      emit("log", { text: `Checking news for ${watched.length} artist${watched.length === 1 ? "" : "s"}…` });
      const [src] = await db.select().from(schema.sources).where(eq(schema.sources.name, ARTIST_NEWS_SOURCE));
      const news = await collectArtistNews(db, src?.id ?? null, watched, { perArtist: 3 });
      errors.push(...news.errors);
      if (src) await markSource(db, src.id, { ok: news.failedFeeds < news.feeds, error: news.errors[0] });
      emit("log", { text: `Checked ${news.feeds - news.failedFeeds} news feeds${news.failedFeeds ? ` (${news.failedFeeds} failed)` : ""}` });
      emit("log", { text: `Found ${news.newItems} candidate item${news.newItems === 1 ? "" : "s"}` });

      const p = await processItems(db, { ids: news.itemIds.slice(0, 30), limit: 30, concurrency: 5 });
      errors.push(...p.errors);
      eventsNew = p.eventsNew;
      credits = p.credits;
      if (p.eventIds.length) {
        const known = await upcomingForUser(db, uid, null);
        for (const s of known.filter((k) => p.eventIds.includes(k.eventId))) emit("log", { text: `Matched: ${s.artistName}, ${s.city ?? "city TBA"}, ${formatShowDate(s.date)}` });
      }
      if (!p.eventIds.length && news.newItems) emit("log", { text: "None of the new items were real India shows" });

      if (!demo) {
        const d = await dispatchAlerts(db, 20, uid);
        alertsSent = d.sent;
        errors.push(...d.errors);
        if (d.sent) emit("log", { text: `Alert sent: ${d.sent}` });
      }
      emit("log", { text: eventsNew ? `Done: ${eventsNew} new show${eventsNew === 1 ? "" : "s"} found` : "Done: nothing new right now" });
      emit("done", { newEvents: eventsNew, alertsSent });
    } finally {
      await finishRun(db, run, { eventsNew, alertsSent, firecrawlCredits: credits, errors });
    }
  });
}

