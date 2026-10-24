import { and, asc, eq, inArray } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";
import { todayIST } from "@/lib/util/ist";
import { mapLimit } from "@/lib/util/retry";
import { normalizeName } from "@/lib/identity/normalize";
import { mentioned } from "@/lib/collectors/news";
import { extractEvents } from "./extract";
import { loadWatched, matchName, type Watched } from "./match";
import { upsertEvent, type SourceRef } from "./dedupe";
import { decideForEvents } from "./decide";
import { RetryableLlmError } from "./gemini";
import { verifyEventLinks } from "@/lib/links/verify";
import { creditsUsedToday, dailyCap } from "@/lib/firecrawl";

export type ProcessStats = { itemsIn: number; eventsNew: number; eventIds: string[]; alertsQueued: number; errors: string[]; processed: number; skipped: number; credits: number };

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

// Sweep raw items carry their grounding sources as "SOURCE_URL: <url>" lines; news items carry "Publisher: <name>".
export function sourcesOf(item: { url: string | null; content: string | null }): SourceRef[] {
  const out: SourceRef[] = [];
  const text = item.content ?? "";
  const publisher = /^Publisher:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? null;
  for (const m of text.matchAll(/^SOURCE_URL:\s*(\S+)(?:\s+\|\s*(.*))?$/gm)) {
    out.push({ url: m[1], platform: m[2]?.trim() || hostOf(m[1]), rawItemId: null });
  }
  if (item.url && !out.some((s) => s.url === item.url)) out.push({ url: item.url, platform: publisher ?? hostOf(item.url), rawItemId: null });
  return out.filter((s) => /^https?:\/\//.test(s.url));
}

async function processOne(db: Db, item: typeof schema.rawItems.$inferSelect, watched: Watched[], stats: ProcessStats) {
  const srcs = sourcesOf(item).map((s) => ({ ...s, rawItemId: item.id }));
  if (!srcs.length) {
    // Never store an event without a real source URL.
    await db.update(schema.rawItems).set({ status: "skipped", error: "no source url" }).where(eq(schema.rawItems.id, item.id));
    stats.skipped++;
    return;
  }
  const hint = /^Artist:\s*(.+)$/m.exec(item.content ?? "")?.[1]?.trim();
  const isListing = /^Kind: listing$/m.test(item.content ?? "");
  const events: Awaited<ReturnType<typeof extractEvents>> = [];
  if (isListing) {
    // Listing pages hold dozens of events: only chunks that name a watched artist go to Gemini.
    for (const chunk of listingChunks(item.content ?? "", watched)) events.push(...(await extractEvents({ title: item.title, content: chunk, url: item.url })));
  } else {
    events.push(...(await extractEvents({ title: item.title, content: item.content ?? "", url: item.url, artistHint: hint })));
  }
  const today = todayIST();
  let any = false;
  for (const e of events) {
    if (e.announcement_type === "not_an_event" || e.is_tribute_or_cover) continue;
    if (!/^india$/i.test(e.country.trim())) continue;
    if (e.date && e.date < today) continue;
    if (e.confidence < 0.3) continue;
    const names = [...new Set(e.artist_names.map((n) => n.trim()).filter(Boolean))];
    const lineup = names.length > 1 || e.is_festival ? names : null;
    const matched = new Map<string, Watched>();
    for (const n of names) {
      const m = await matchName(n, watched, e.evidence_quote || e.event_title);
      if (m) matched.set(m.artist.id, m.artist);
    }
    // A sweep is about one named artist: if Gemini wrote the name differently, trust the hint.
    if (!matched.size && hint && !e.is_festival) {
      const h = watched.find((w) => w.names.includes(normalizeName(hint)));
      if (h && names.some((n) => normalizeName(n).includes(normalizeName(hint)) || normalizeName(hint).includes(normalizeName(n)))) matched.set(h.id, h);
    }
    // A listing's own URL is a generic page; the event's page (from its link) is the real source.
    const eventSources: SourceRef[] = e.ticket_url && /^https?:\/\//.test(e.ticket_url) ? (isListing ? [{ url: e.ticket_url, platform: e.platform ?? hostOf(e.ticket_url), rawItemId: item.id }] : [...srcs, { url: e.ticket_url, platform: e.platform ?? hostOf(e.ticket_url), rawItemId: item.id }]) : srcs;
    for (const a of matched.values()) {
      const r = await upsertEvent(db, a.id, e, eventSources, lineup);
      stats.eventIds.push(r.id);
      if (r.isNew) stats.eventsNew++;
      any = true;
    }
  }
  await db.update(schema.rawItems).set({ status: any ? "processed" : "skipped", error: null }).where(eq(schema.rawItems.id, item.id));
  if (any) stats.processed++;
  else stats.skipped++;
}

// Extract -> match -> dedupe -> decide for up to `limit` raw items (or the given ids).
export async function processItems(db: Db, opts: { limit?: number; ids?: string[]; concurrency?: number; verify?: { maxEvents?: number; timeMs?: number } | false; onEvent?: (id: string) => void } = {}): Promise<ProcessStats> {
  const stats: ProcessStats = { itemsIn: 0, eventsNew: 0, eventIds: [], alertsQueued: 0, errors: [], processed: 0, skipped: 0, credits: 0 };
  const items = await db
    .select()
    .from(schema.rawItems)
    .where(opts.ids ? and(inArray(schema.rawItems.id, opts.ids), eq(schema.rawItems.status, "new")) : eq(schema.rawItems.status, "new"))
    .orderBy(asc(schema.rawItems.fetchedAt))
    .limit(opts.limit ?? 10);
  stats.itemsIn = items.length;
  if (!items.length) return stats;
  const watched = await loadWatched(db);
  await mapLimit(items, opts.concurrency ?? 4, async (item) => {
    try {
      await processOne(db, item, watched, stats);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      stats.errors.push(`${item.title?.slice(0, 40) ?? item.id}: ${msg.slice(0, 120)}`);
      // Rate limit or outage: leave it `new` for the next run. Anything else is a real error.
      if (!(e instanceof RetryableLlmError)) {
        await db.update(schema.rawItems).set({ status: "error", error: msg.slice(0, 300) }).where(eq(schema.rawItems.id, item.id));
      }
    }
  });
  stats.eventIds = [...new Set(stats.eventIds)];
  // Links are verified before anyone is alerted: a ticket button must open the exact page. What does not fit
  // in the time box stays `unchecked` (hidden from people) and is finished by the links job.
  if (opts.verify !== false) stats.credits += await verifyBatch(db, stats.eventIds, opts.verify || {});
  const alerts = await decideForEvents(db, stats.eventIds);
  stats.alertsQueued = alerts.length;
  await refreshArtistCounts(db);
  return stats;
}

// upcoming_count per artist = confirmed upcoming events, last_india_* when an upcoming show exists.
export async function refreshArtistCounts(db: Db) {
  const { sql } = await import("drizzle-orm");
  await db.execute(sql`
    update artists a set upcoming_count = coalesce(c.n, 0)
    from (select a2.id, (select count(*) from events e where e.artist_id = a2.id and e.is_sample = false
            and e.status <> 'cancelled' and (e.event_date is null or e.event_date >= current_date)) n from artists a2) c
    where a.id = c.id and a.upcoming_count is distinct from coalesce(c.n, 0)`);
}

// Verify links for events that still need it, inside a time box. Returns Firecrawl credits spent.
export async function verifyBatch(db: Db, eventIds: string[], o: { maxEvents?: number; timeMs?: number; recheckOlderThanMs?: number } = {}) {
  if (!eventIds.length) return 0;
  const started = Date.now();
  const rows = await db.select({ id: schema.events.id, s: schema.events.ticketStatus, v: schema.events.ticketVerifiedAt, u: schema.events.ticketUrl }).from(schema.events).where(inArray(schema.events.id, eventIds));
  // Unchecked events, plus (when asked) events whose verified link is older than the cutoff: a link can change after it was checked.
  const stale = (r: (typeof rows)[number]) => !!o.recheckOlderThanMs && !!r.u && (!r.v || Date.now() - r.v.getTime() > o.recheckOlderThanMs);
  const todo = rows.filter((r) => r.s === "unchecked" || r.s === null || stale(r)).slice(0, o.maxEvents ?? 12);
  const budget = Math.max(0, dailyCap() - (await creditsUsedToday(db)));
  let spent = 0;
  await mapLimit(todo, 3, async (r) => {
    if (Date.now() - started > (o.timeMs ?? 25_000)) return;
    try {
      const v = await verifyEventLinks(db, r.id, { budget: Math.max(0, budget - spent), extractTierInfo: true, force: stale(r) });
      spent += v.credits;
    } catch (e) {
      console.error("verify failed", r.id, e instanceof Error ? e.message : e);
    }
  });
  return spent;
}

// Split a listing's markdown into ~9k-character chunks on paragraph boundaries, keeping only those that name a watched artist.
export function listingChunks(content: string, watched: Watched[], size = 9000, max = 8): string[] {
  const paras = content.split(/\n{2,}/);
  const chunks: string[] = [];
  let cur = "";
  for (const p of paras) {
    if (cur.length + p.length > size && cur) {
      chunks.push(cur);
      cur = "";
    }
    cur += `${p}\n\n`;
  }
  if (cur.trim()) chunks.push(cur);
  return chunks.filter((c) => mentioned(c, watched).length > 0).slice(0, max);
}
