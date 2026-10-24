// Phase 2 live check: sweep + news + process for a few of the owner's artists. Usage: tsx scripts/test-phase2.ts "Name1,Name2"
import { config } from "dotenv";
config({ path: ".env.local" });
import { inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { loadWatched } from "@/lib/brain/match";
import { sweepArtist } from "@/lib/collectors/sweep";
import { collectArtistNews } from "@/lib/collectors/news";
import { processItems } from "@/lib/brain/process";
import { upcomingForUser } from "@/lib/brain/scan";

async function main() {
  const names = (process.argv[2] ?? "Hanumankind,Talwiinder,Queens of the Stone Age,Labrinth").split(",");
  const db = getDb();
  const rows = await db.select().from(schema.artists).where(inArray(schema.artists.name, names));
  const watched = await loadWatched(db, rows.map((r) => r.id));
  console.log("watched", watched.map((w) => w.name));
  const t = Date.now();
  const ids: string[] = [];
  const sw = await Promise.all(watched.map((a) => sweepArtist(db, null, a)));
  console.log("sweeps", sw.map((s) => `${watched.find((w) => w.id === s.artistId)?.name}:${s.found ? "found" : "none"}${s.error ? " ERR " + s.error : ""}`), Date.now() - t, "ms");
  sw.forEach((s) => s.rawItemId && ids.push(s.rawItemId));
  const news = await collectArtistNews(db, null, watched, { perArtist: 3 });
  console.log("news", { feeds: news.feeds, failed: news.failedFeeds, items: news.newItems, errors: news.errors });
  ids.push(...news.itemIds);
  const p = await processItems(db, { ids, limit: 40, concurrency: 5 });
  console.log("process", { ...p, eventIds: p.eventIds.length });
  const [owner] = await db.select().from(schema.users).where(inArray(schema.users.isOwner, [true]));
  const up = await upcomingForUser(db, owner.id, owner.homeCity);
  for (const s of up) console.log(s.artistName, "|", s.city, s.date, s.status, s.confidence, s.venue, "|", s.sources.map((x) => x.platform).join(","));
  const a = await db.select({ n: schema.artists.name, l: schema.artists.lastIndiaShow, c: schema.artists.lastCheckedAt }).from(schema.artists).where(inArray(schema.artists.id, watched.map((w) => w.id)));
  console.log(a);
}
main();
