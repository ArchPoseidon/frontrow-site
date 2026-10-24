import { and, eq } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";
import { normalizeCity } from "@/lib/util/city";
import { isoWeekIST } from "@/lib/util/ist";
import type { ExtractedEvent } from "./extract";

export type EventStatus = "rumored" | "announced" | "sale_soon" | "on_sale" | "early_bird" | "sold_out" | "cancelled";
// Status only moves forward, except to cancelled.
const RANK: Record<EventStatus, number> = { rumored: 0, announced: 1, sale_soon: 2, on_sale: 3, early_bird: 4, sold_out: 5, cancelled: 6 };

export function dedupeKey(artistId: string, city: string | null, date: string | null) {
  return `${artistId}|${normalizeCity(city) || "tbd"}|${date ?? `tbd:${isoWeekIST()}`}`;
}

const EARLY = /early|presale|pre-sale|phase\s*1|first\s*release|tier\s*1/i;

export function deriveStatus(e: ExtractedEvent): EventStatus {
  if (e.announcement_type === "rumor") return "rumored";
  const open = e.tiers.filter((t) => t.status === "open");
  if (open.some((t) => EARLY.test(t.name))) return "early_bird";
  if (open.length) return "on_sale";
  if (e.tiers.length && e.tiers.every((t) => t.status === "sold_out")) return "sold_out";
  const opens = e.sale_opens_at ? Date.parse(e.sale_opens_at) : NaN;
  if (Number.isFinite(opens) && opens > Date.now()) return "sale_soon";
  return "announced";
}

const toDate = (s: string | null) => {
  const t = s ? Date.parse(s) : NaN;
  return Number.isFinite(t) ? new Date(t) : null;
};

export type SourceRef = { url: string; platform: string | null; rawItemId: string | null };

export async function upsertEvent(
  db: Db,
  artistId: string,
  e: ExtractedEvent,
  sources: SourceRef[],
  lineup: string[] | null,
): Promise<{ id: string; isNew: boolean }> {
  const key = dedupeKey(artistId, e.city, e.date);
  const status = deriveStatus(e);
  const saleOpensAt = toDate(e.sale_opens_at);
  const [existing] = await db.select().from(schema.events).where(eq(schema.events.dedupeKey, key));

  let id: string;
  let isNew = false;
  if (!existing) {
    const [row] = await db
      .insert(schema.events)
      .values({
        artistId,
        title: e.event_title,
        venue: e.venue,
        city: e.city,
        eventDate: e.date,
        eventTime: e.time,
        ticketUrl: e.ticket_url,
        platform: e.platform,
        status,
        saleOpensAt,
        confidence: e.confidence,
        isFestival: e.is_festival,
        lineup: lineup ?? [],
        dedupeKey: key,
        updatedAt: new Date(),
      })
      .onConflictDoNothing({ target: schema.events.dedupeKey })
      .returning({ id: schema.events.id });
    if (row) {
      id = row.id;
      isNew = true;
    } else {
      const [again] = await db.select().from(schema.events).where(eq(schema.events.dedupeKey, key));
      id = again.id;
    }
  } else {
    id = existing.id;
  }

  if (!isNew) {
    // Merge: fill nulls, never move status backwards, raise confidence.
    const [cur] = await db.select().from(schema.events).where(eq(schema.events.id, id));
    const nextStatus = status === "cancelled" || RANK[status] > RANK[(cur.status as EventStatus) ?? "announced"] ? status : cur.status;
    await db
      .update(schema.events)
      .set({
        venue: cur.venue ?? e.venue,
        eventTime: cur.eventTime ?? e.time,
        ticketUrl: cur.ticketUrl ?? e.ticket_url,
        ...(!cur.ticketUrl && e.ticket_url ? { ticketStatus: "unchecked" } : {}),
        platform: cur.platform ?? e.platform,
        saleOpensAt: cur.saleOpensAt ?? saleOpensAt,
        title: cur.title ?? e.event_title,
        status: nextStatus,
        confidence: Math.max(cur.confidence ?? 0, e.confidence),
        lineup: (lineup?.length ?? 0) > (cur.lineup?.length ?? 0) ? lineup : cur.lineup,
        updatedAt: new Date(),
      })
      .where(eq(schema.events.id, id));
  }

  for (const s of sources) {
    await db
      .insert(schema.eventSources)
      .values({ eventId: id, rawItemId: s.rawItemId, url: s.url, platform: s.platform })
      .onConflictDoNothing();
  }

  // Two or more distinct sources means confidence 0.9 or higher.
  const srcRows = await db.select().from(schema.eventSources).where(eq(schema.eventSources.eventId, id));
  const distinct = new Set(srcRows.map((r) => (r.platform ?? new URL(r.url).hostname).toLowerCase()));
  if (distinct.size >= 2) {
    const [cur] = await db.select({ c: schema.events.confidence }).from(schema.events).where(eq(schema.events.id, id));
    if ((cur?.c ?? 0) < 0.9) await db.update(schema.events).set({ confidence: 0.9 }).where(eq(schema.events.id, id));
  }

  // Tiers: upsert by name.
  if (e.tiers.length) {
    const have = await db.select().from(schema.eventTiers).where(eq(schema.eventTiers.eventId, id));
    for (const t of e.tiers) {
      const prev = have.find((h) => h.name.toLowerCase() === t.name.toLowerCase());
      const vals = { priceInr: t.price_inr, status: t.status, opensAt: toDate(t.opens_at), closesAt: toDate(t.closes_at), observedAt: new Date() };
      if (prev) await db.update(schema.eventTiers).set(vals).where(and(eq(schema.eventTiers.id, prev.id)));
      else await db.insert(schema.eventTiers).values({ eventId: id, name: t.name, ...vals });
    }
  }
  return { id, isNew };
}
