import Parser from "rss-parser";
import { and, desc, eq, gte, inArray, ne } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";
import { normalizeName } from "@/lib/identity/normalize";
import { mapLimit } from "@/lib/util/retry";

const parser = new Parser({ timeout: 10_000, headers: { "User-Agent": "FrontRow/1.0 (personal, non-commercial concert alerts)" } });
const REFRESH_AFTER_MS = 6 * 3600 * 1000;
const KEEP_MS = 60 * 24 * 3600 * 1000;

const feedUrl = (name: string) => `https://news.google.com/rss/search?q=${encodeURIComponent(`"${name}" (music OR concert OR album OR tour OR song)`)}&hl=en-IN&gl=IN&ceid=IN:en`;

export type NewsItem = { id: string; title: string; url: string; publisher: string | null; publishedAt: string | null };

// Pulls the latest headlines for one artist from Google News and stores new ones. Never throws.
export async function refreshArtistNews(db: Db, artist: { id: string; name: string; aliases?: string[] | null }, max = 8): Promise<number> {
  try {
    const feed = await parser.parseURL(feedUrl(artist.name));
    const names = [artist.name, ...(artist.aliases ?? [])].map(normalizeName).filter((n) => n.length >= 3);
    const now = Date.now();
    const rows = (feed.items ?? [])
      .map((i) => {
        const raw = (i.title ?? "").trim();
        const cut = raw.lastIndexOf(" - ");
        return { title: cut > 0 ? raw.slice(0, cut) : raw, publisher: (i as { source?: string }).source ?? (cut > 0 ? raw.slice(cut + 3) : null), url: i.link ?? "", date: new Date(i.isoDate ?? i.pubDate ?? 0), snippet: (i.contentSnippet ?? "").trim() };
      })
      // Must be about this artist (whole-word name in the headline or snippet) and recent.
      .filter((i) => i.url && i.title && now - i.date.getTime() <= KEEP_MS && names.some((n) => ` ${normalizeName(`${i.title} ${i.snippet}`)} `.includes(` ${n} `)))
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, max);
    if (rows.length) {
      await db
        .insert(schema.artistNews)
        .values(rows.map((r) => ({ artistId: artist.id, title: r.title.slice(0, 300), url: r.url, publisher: r.publisher, publishedAt: Number.isNaN(r.date.getTime()) ? null : r.date })))
        .onConflictDoNothing();
    }
    return rows.length;
  } catch (e) {
    console.error("artist news failed", artist.name, e instanceof Error ? e.message : e);
    return 0;
  }
}

// Latest stored news for an artist; refreshes first when the newest item is older than 6 hours (or there is none).
export async function getArtistNews(db: Db, artist: { id: string; name: string; aliases?: string[] | null }, limit = 6): Promise<NewsItem[]> {
  const since = new Date(Date.now() - KEEP_MS);
  const read = () =>
    db.select().from(schema.artistNews).where(and(eq(schema.artistNews.artistId, artist.id), gte(schema.artistNews.publishedAt, since))).orderBy(desc(schema.artistNews.publishedAt)).limit(limit);
  let rows = await read();
  const [latest] = await db.select({ f: schema.artistNews.fetchedAt }).from(schema.artistNews).where(eq(schema.artistNews.artistId, artist.id)).orderBy(desc(schema.artistNews.fetchedAt)).limit(1);
  if (!latest?.f || Date.now() - latest.f.getTime() > REFRESH_AFTER_MS) {
    await refreshArtistNews(db, artist);
    rows = await read();
  }
  return rows.map((r) => ({ id: r.id, title: r.title, url: r.url, publisher: r.publisher, publishedAt: r.publishedAt?.toISOString() ?? null }));
}

// Daily/6-hourly job: refresh the news for artists people follow (active artists only).
export async function refreshFollowedNews(db: Db, limit = 25) {
  const ids = (await db.selectDistinct({ id: schema.userArtists.artistId }).from(schema.userArtists).where(ne(schema.userArtists.priority, "muted"))).map((r) => r.id);
  if (!ids.length) return { artists: 0, items: 0 };
  const rows = await db.select().from(schema.artists).where(and(inArray(schema.artists.id, ids), eq(schema.artists.isDeceased, false)));
  const latest = await db.select({ id: schema.artistNews.artistId, f: schema.artistNews.fetchedAt }).from(schema.artistNews).where(inArray(schema.artistNews.artistId, ids));
  const last = new Map<string, number>();
  for (const l of latest) if (l.f) last.set(l.id, Math.max(last.get(l.id) ?? 0, l.f.getTime()));
  const due = rows.filter((a) => Date.now() - (last.get(a.id) ?? 0) > REFRESH_AFTER_MS).slice(0, limit);
  let items = 0;
  await mapLimit(due, 4, async (a) => {
    items += await refreshArtistNews(db, a);
  });
  return { artists: due.length, items };
}
