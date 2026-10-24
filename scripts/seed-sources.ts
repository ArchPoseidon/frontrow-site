// Seeds the `sources` table (idempotent). Run: npx tsx scripts/seed-sources.ts
import { config } from "dotenv";
config({ path: ".env.local" });
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { ARTIST_NEWS_SOURCE, SWEEP_SOURCE } from "@/lib/collectors/sources";
import { GENERIC_QUERIES, genericFeedUrl } from "@/lib/collectors/news";


async function main() {
  const db = getDb();
  const rows: (typeof schema.sources.$inferInsert)[] = [
    { kind: "news_rss", name: ARTIST_NEWS_SOURCE, url: "https://news.google.com/rss/search", intervalMinutes: 60, config: { cursor: 0, batchSize: 15 } },
    ...GENERIC_QUERIES.map((q) => ({ kind: "news_rss" as const, name: `Google News · ${q}`, url: genericFeedUrl(q), intervalMinutes: 60, config: { query: q } })),
    // Ticketing listings, each verified with one scrape before saving. Every 6h to fit the Firecrawl budget.
    { kind: "listing", name: "District · Bengaluru music", url: "https://www.district.in/events/music-in-bengaluru-book-tickets", intervalMinutes: 360, config: { city: "Bengaluru" } },
    { kind: "listing", name: "BookMyShow · Bengaluru music", url: "https://in.bookmyshow.com/explore/music-shows-bengaluru", intervalMinutes: 360, config: { city: "Bengaluru" } },
    { kind: "listing", name: "AllEvents · Bengaluru music", url: "https://allevents.in/bangalore/music", intervalMinutes: 360, config: { city: "Bengaluru" } },
    { kind: "grounded_sweep", name: SWEEP_SOURCE, url: null, intervalMinutes: 1440, config: { cursor: 0, batchSize: 5, dailyCap: 25 } },
  ];
  for (const r of rows) {
    const [have] = await db.select({ id: schema.sources.id }).from(schema.sources).where(eq(schema.sources.name, r.name));
    if (!have) await db.insert(schema.sources).values(r);
  }
  console.log(`sources: ${(await db.select().from(schema.sources)).length} rows`);
}
main();
