import Parser from "rss-parser";
import type { Db } from "@/lib/db";
import { normalizeName } from "@/lib/identity/normalize";
import type { Watched } from "@/lib/brain/match";
import { mapLimit } from "@/lib/util/retry";
import { insertRawItem } from "./shared";

const parser = new Parser({ timeout: 10_000, headers: { "User-Agent": "FrontRow/1.0 (personal, non-commercial concert alerts)" } });
const FRESH_MS = 14 * 24 * 3600 * 1000;

export const GENERIC_QUERIES = [
  "India tour announced",
  "Bengaluru concert tickets",
  "Mumbai concert announced",
  "music festival lineup India",
  "early bird tickets concert India",
];

export const artistFeedUrl = (name: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(`"${name}" (concert OR tour OR gig OR tickets) India`)}&hl=en-IN&gl=IN&ceid=IN:en`;
export const genericFeedUrl = (q: string) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-IN&gl=IN&ceid=IN:en`;

type Item = { title: string; link: string; publisher: string | null; snippet: string; date: Date };

async function fetchFeed(url: string): Promise<Item[]> {
  const feed = await parser.parseURL(url);
  const now = Date.now();
  return (feed.items ?? [])
    .map((i) => {
      const raw = (i.title ?? "").trim();
      // Google News titles are "Headline - Publisher".
      const cut = raw.lastIndexOf(" - ");
      const publisher = (i as { source?: string }).source ?? (cut > 0 ? raw.slice(cut + 3) : null);
      return {
        title: cut > 0 ? raw.slice(0, cut) : raw,
        link: i.link ?? "",
        publisher,
        snippet: (i.contentSnippet ?? "").trim(),
        date: new Date(i.isoDate ?? i.pubDate ?? 0),
      };
    })
    .filter((i) => i.link && i.title && now - i.date.getTime() <= FRESH_MS);
}

// Cheap relevance gate before spending a Gemini call: the headline must name a watched artist.
export function mentioned(text: string, watched: Watched[]) {
  const n = ` ${normalizeName(text)} `;
  return watched.filter((w) => w.names.some((x) => x.length >= 3 && n.includes(` ${x} `)));
}

export type NewsResult = { feeds: number; failedFeeds: number; newItems: number; itemIds: string[]; errors: string[] };

// One feed per artist; keeps recent items that name a watched artist. Never throws.
export async function collectArtistNews(db: Db, sourceId: string | null, artists: Watched[], opts: { perArtist?: number; concurrency?: number; onArtist?: (a: Watched, found: number) => void } = {}): Promise<NewsResult> {
  const res: NewsResult = { feeds: artists.length, failedFeeds: 0, newItems: 0, itemIds: [], errors: [] };
  await mapLimit(artists, opts.concurrency ?? 5, async (a) => {
    try {
      const items = (await fetchFeed(artistFeedUrl(a.name)))
        .filter((i) => mentioned(`${i.title} ${i.snippet}`, [a]).length)
        .sort((x, y) => y.date.getTime() - x.date.getTime())
        .slice(0, opts.perArtist ?? 4);
      let found = 0;
      for (const i of items) {
        const id = await insertRawItem(db, {
          sourceId,
          url: i.link,
          title: i.title,
          content: `Artist: ${a.name}\nPublisher: ${i.publisher ?? "Google News"}\nPublished: ${i.date.toISOString()}\n\n${i.title}\n${i.snippet}`,
          hashSeed: `${a.id}|${i.title}|${i.publisher}`,
        });
        if (id) {
          res.itemIds.push(id);
          res.newItems++;
          found++;
        }
      }
      opts.onArtist?.(a, found);
    } catch (e) {
      res.failedFeeds++;
      res.errors.push(`${a.name}: ${e instanceof Error ? e.message.slice(0, 100) : "feed error"}`);
    }
  });
  return res;
}

// Generic queries: only items that name any watched artist are kept.
export async function collectGenericNews(db: Db, sourceId: string | null, query: string, watched: Watched[]): Promise<NewsResult> {
  const res: NewsResult = { feeds: 1, failedFeeds: 0, newItems: 0, itemIds: [], errors: [] };
  try {
    for (const i of await fetchFeed(genericFeedUrl(query))) {
      const hit = mentioned(`${i.title} ${i.snippet}`, watched);
      if (!hit.length) continue;
      const id = await insertRawItem(db, {
        sourceId,
        url: i.link,
        title: i.title,
        content: `Publisher: ${i.publisher ?? "Google News"}\nPublished: ${i.date.toISOString()}\n\n${i.title}\n${i.snippet}`,
        hashSeed: `generic|${i.title}|${i.publisher}`,
      });
      if (id) {
        res.itemIds.push(id);
        res.newItems++;
      }
    }
  } catch (e) {
    res.failedFeeds++;
    res.errors.push(`${query}: ${e instanceof Error ? e.message.slice(0, 100) : "feed error"}`);
  }
  return res;
}
