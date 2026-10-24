import { and, desc, eq, gte, inArray, isNull, ne, notInArray, or, sql } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";
import { computeUrgency } from "@/lib/brain/urgency";
import { displayCity, normalizeCity } from "@/lib/util/city";
import { todayIST, formatMonthYear } from "@/lib/util/ist";
import { ticketLinkOf, visibleSources } from "@/lib/links/display";
import { isConfirmed, stageOf } from "@/lib/stage";
import type { AlertView, ArtistView, EventView, TierView } from "@/components/event-card/types";

type EventRow = typeof schema.events.$inferSelect;
type TierRow = typeof schema.eventTiers.$inferSelect;

const EARLY = /early|presale|pre-sale/i;
const rel = (to: Date, now = Date.now()) => {
  const m = Math.max(0, Math.round((to.getTime() - now) / 60000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h ${m % 60}m` : `${Math.round(h / 24)} days`;
};

export function reasonAndCountdown(e: Pick<EventRow, "status" | "saleOpensAt">, tiers: Pick<TierRow, "name" | "status" | "closesAt" | "priceInr">[], now = Date.now()) {
  const open = tiers.find((t) => t.status === "open");
  if (open) {
    const price = open.priceInr ? ` · ₹${open.priceInr.toLocaleString("en-IN")}` : "";
    const name = EARLY.test(open.name) ? "Early bird" : open.name;
    if (open.closesAt && open.closesAt.getTime() > now) return { reason: `${name} open${price} · closes in ${rel(open.closesAt, now)}`, countdown: { to: open.closesAt.toISOString(), label: "Closes in" } };
    return { reason: `${name} open${price}`, countdown: null };
  }
  if (e.status === "early_bird") return { reason: "Early bird open", countdown: null };
  if (e.status === "on_sale") return { reason: "Tickets on sale", countdown: null };
  if (e.saleOpensAt && e.saleOpensAt.getTime() > now) return { reason: `Sale opens in ${rel(e.saleOpensAt, now)}`, countdown: { to: e.saleOpensAt.toISOString(), label: "Sale opens in" } };
  if (e.status === "sold_out") return { reason: "Sold out", countdown: null };
  if (e.status === "rumored") return { reason: "Rumour, not confirmed", countdown: null };
  return { reason: "Announced, tickets not live yet", countdown: null };
}

export type Viewer = { userId: string; homeCity: string | null; watchCities: string[] | null; p1Cities?: string[] | null; p2Cities?: string[] | null };

// Upcoming real events for a viewer's non-muted artists, with urgency computed for that viewer.
// `elsewhere`: instead of the viewer's own artists, shows on sale right now for artists they do not follow yet
// (real, sourced events), so a new user's "On sale now" is never empty.
export async function getRadarEvents(db: Db, viewer: Viewer, opts: { includeDismissed?: boolean; elsewhere?: { limit: number } } = {}): Promise<EventView[]> {
  const today = todayIST();
  const base = and(ne(schema.events.status, "cancelled"), or(isNull(schema.events.eventDate), gte(schema.events.eventDate, today)), eq(schema.events.isSample, false));
  let rows: { e: typeof schema.events.$inferSelect; a: typeof schema.artists.$inferSelect; priority: string | null }[];
  if (opts.elsewhere) {
    const mine = (await db.select({ id: schema.userArtists.artistId }).from(schema.userArtists).where(eq(schema.userArtists.userId, viewer.userId))).map((r) => r.id);
    const live = sql`(${schema.events.status} in ('early_bird','on_sale') or exists (select 1 from event_tiers t where t.event_id = ${schema.events.id} and t.status = 'open'))`;
    const picked = await db
      .select({ e: schema.events, a: schema.artists })
      .from(schema.events)
      .innerJoin(schema.artists, eq(schema.artists.id, schema.events.artistId))
      .where(and(base, live, eq(schema.artists.isDeceased, false), inArray(schema.events.ticketStatus, ["exact", "ok"]), mine.length ? notInArray(schema.artists.id, mine) : undefined))
      .orderBy(schema.events.eventDate)
      .limit(opts.elsewhere.limit * 3);
    // One show per artist, soonest first.
    const seen = new Set<string>();
    rows = picked.filter((r) => (seen.has(r.a.id) ? false : (seen.add(r.a.id), true))).slice(0, opts.elsewhere.limit).map((r) => ({ ...r, priority: "follow" }));
  } else {
    rows = await db
      .select({ e: schema.events, a: schema.artists, priority: schema.userArtists.priority })
      .from(schema.events)
      .innerJoin(schema.artists, eq(schema.artists.id, schema.events.artistId))
      .innerJoin(schema.userArtists, and(eq(schema.userArtists.artistId, schema.artists.id), eq(schema.userArtists.userId, viewer.userId)))
      .where(and(ne(schema.userArtists.priority, "muted"), eq(schema.artists.isDeceased, false), base));
  }
  if (!rows.length) return [];
  const ids = rows.map((r) => r.e.id);
  const [tiers, srcs, dismissed, cal] = await Promise.all([
    db.select().from(schema.eventTiers).where(inArray(schema.eventTiers.eventId, ids)),
    db.select().from(schema.eventSources).where(inArray(schema.eventSources.eventId, ids)),
    db.select({ eventId: schema.alerts.eventId, action: schema.alerts.userAction }).from(schema.alerts).where(and(eq(schema.alerts.userId, viewer.userId), inArray(schema.alerts.userAction, ["dismissed", "going", "saved", "bought"]))),
    db.select({ eventId: schema.calendarEntries.eventId }).from(schema.calendarEntries).where(eq(schema.calendarEntries.userId, viewer.userId)),
  ]);
  const inCal = new Set(cal.map((c) => c.eventId));
  const dis = new Set(dismissed.filter((d) => d.action === "dismissed").map((d) => d.eventId));
  // "bought it" in Telegram and "Going" on the dashboard are the same thing.
  const marks = new Map<string, "going" | "saved">();
  for (const d of dismissed) if (d.action === "going" || d.action === "bought") marks.set(d.eventId, "going");
  for (const d of dismissed) if (d.action === "saved" && !marks.has(d.eventId)) marks.set(d.eventId, "saved");
  const home = normalizeCity(viewer.homeCity ?? "Bengaluru");
  const p1set = new Set((viewer.p1Cities ?? []).map(normalizeCity));
  const out: EventView[] = [];
  for (const { e, a, priority } of rows) {
    const my = tiers.filter((t) => t.eventId === e.id).sort((x, y) => (x.opensAt?.getTime() ?? 0) - (y.opensAt?.getTime() ?? 0));
    const mySrc = visibleSources(srcs.filter((s) => s.eventId === e.id));
    const distinct = new Set(mySrc.map((s) => (s.platform ?? new URL(s.url).hostname).toLowerCase()));
    const urgency = computeUrgency({ ...e, ticketUrl: ticketLinkOf(e), sourceCount: distinct.size, tiers: my }, { homeCity: viewer.homeCity, watchCities: viewer.watchCities, priority, p1Cities: viewer.p1Cities, p2Cities: viewer.p2Cities });
    if (!urgency && !opts.elsewhere) continue; // a city this viewer does not watch
    const isDismissed = dis.has(e.id);
    if (isDismissed && !opts.includeDismissed) continue;
    const { reason, countdown } = reasonAndCountdown(e, my);
    out.push({
      id: e.id,
      artistId: a.id,
      artistName: a.name,
      artistImage: a.imageUrl,
      title: e.title,
      venue: e.venue,
      city: e.city ? displayCity(e.city) : null,
      date: e.eventDate,
      time: e.eventTime,
      status: e.status,
      ticketUrl: ticketLinkOf(e),
      isFestival: !!e.isFestival,
      isSample: !!e.isSample,
      confidence: e.confidence,
      lineup: e.lineup ?? [],
      tiers: my.map((t): TierView => ({ name: t.name, priceInr: t.priceInr, status: t.status as TierView["status"], opensAt: t.opensAt?.toISOString() ?? null, closesAt: t.closesAt?.toISOString() ?? null })),
      saleOpensAt: e.saleOpensAt?.toISOString() ?? null,
      sources: mySrc.map((s) => ({ url: s.url, platform: s.platform })),
      urgency: urgency ?? "info",
      stage: stageOf({ status: e.status, saleOpensAt: e.saleOpensAt, tiers: my, confirmed: isConfirmed(e.confidence, distinct.size) }),
      reason,
      countdown,
      inHomeCity: normalizeCity(e.city) === home || p1set.has(normalizeCity(e.city)),
      dismissed: isDismissed,
      mine: marks.get(e.id) ?? null,
      inCalendar: inCal.has(e.id),
      notFollowed: !!opts.elsewhere,
      priority: priority === "must_see" ? "must_see" : "follow",
    });
  }
  const rank = { red: 0, amber: 1, info: 2 } as const;
  return out.sort((x, y) => (x.date ?? "9999").localeCompare(y.date ?? "9999") || rank[x.urgency] - rank[y.urgency]);
}

export async function getArtistViews(db: Db, userId: string): Promise<ArtistView[]> {
  const rows = await db
    .select({ a: schema.artists, priority: schema.userArtists.priority })
    .from(schema.userArtists)
    .innerJoin(schema.artists, eq(schema.artists.id, schema.userArtists.artistId))
    .where(and(eq(schema.userArtists.userId, userId), eq(schema.artists.isDeceased, false)));
  const order = { must_see: 0, follow: 1, muted: 2 } as const;
  return rows
    .map(({ a, priority }) => ({
      id: a.id,
      name: a.name,
      imageUrl: a.imageUrl,
      identityStatus: a.identityStatus,
      priority: (priority ?? "follow") as ArtistView["priority"],
      lastIndiaShow: a.lastIndiaShow ?? (a.lastIndiaDate ? formatMonthYear(a.lastIndiaDate) : null),
      lastCheckedAt: a.lastCheckedAt?.toISOString() ?? null,
      upcomingCount: a.upcomingCount ?? 0,
    }))
    .sort((x, y) => order[x.priority] - order[y.priority] || y.upcomingCount - x.upcomingCount || x.name.localeCompare(y.name));
}

export async function getAlertHistory(db: Db, userId: string, limit = 15): Promise<AlertView[]> {
  const rows = await db
    .select({ a: schema.alerts, name: schema.artists.name, city: schema.events.city, date: schema.events.eventDate })
    .from(schema.alerts)
    .innerJoin(schema.events, eq(schema.events.id, schema.alerts.eventId))
    .innerJoin(schema.artists, eq(schema.artists.id, schema.events.artistId))
    .where(and(eq(schema.alerts.userId, userId), eq(schema.alerts.status, "sent")))
    .orderBy(desc(schema.alerts.sentAt))
    .limit(limit);
  return rows.map(({ a, name, city, date }) => ({ id: a.id, artistName: name, city: city ? displayCity(city) : null, date, channel: a.channel, kind: a.kind, urgency: a.urgency, sentAt: a.sentAt?.toISOString() ?? null, status: a.status, action: a.userAction }));
}

export async function getPublicCounters(db: Db) {
  const since = new Date();
  since.setUTCDate(1);
  since.setUTCHours(0, 0, 0, 0);
  const [[a], [s], [n]] = await Promise.all([
    db.select({ n: sql<number>`count(distinct ${schema.userArtists.artistId})::int` }).from(schema.userArtists).where(ne(schema.userArtists.priority, "muted")),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.events).where(and(eq(schema.events.isSample, false), gte(schema.events.firstSeenAt, since))),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.alerts).where(and(eq(schema.alerts.status, "sent"), ne(schema.alerts.kind, "test"), ne(schema.alerts.kind, "digest"))),
  ]);
  return { artistsWatched: a.n, showsThisMonth: s.n, alertsSent: n.n };
}

// One event for the detail page. Public; urgency is shown for the viewer's cities when signed in, else Bengaluru / all India.
export async function getEventView(db: Db, id: string, viewer?: { homeCity: string | null; watchCities: string[] | null; p1Cities?: string[] | null; p2Cities?: string[] | null; userId?: string }) {
  const [row] = await db
    .select({ e: schema.events, a: schema.artists })
    .from(schema.events)
    .innerJoin(schema.artists, eq(schema.artists.id, schema.events.artistId))
    .where(eq(schema.events.id, id));
  if (!row) return null;
  const { e, a } = row;
  const [tiers, srcs, others] = await Promise.all([
    db.select().from(schema.eventTiers).where(eq(schema.eventTiers.eventId, id)),
    db.select().from(schema.eventSources).where(eq(schema.eventSources.eventId, id)),
    db
      .select()
      .from(schema.events)
      .where(and(eq(schema.events.artistId, a.id), ne(schema.events.id, id), ne(schema.events.status, "cancelled"), gte(schema.events.eventDate, todayIST()), eq(schema.events.isSample, false)))
      .orderBy(schema.events.eventDate),
  ]);
  const my = [...tiers].sort((x, y) => (x.opensAt?.getTime() ?? 0) - (y.opensAt?.getTime() ?? 0));
  const vis = visibleSources(srcs);
  const distinct = new Set(vis.map((s) => (s.platform ?? new URL(s.url).hostname).toLowerCase()));
  const v = { homeCity: viewer?.homeCity ?? "Bengaluru", watchCities: viewer?.watchCities ?? ["ALL_INDIA"], p1Cities: viewer?.p1Cities, p2Cities: viewer?.p2Cities };
  const urgency = computeUrgency({ ...e, ticketUrl: ticketLinkOf(e), sourceCount: distinct.size, tiers: my }, { ...v, priority: "follow" }) ?? "info";
  const { reason, countdown } = reasonAndCountdown(e, my);
  let mine: EventView["mine"] = null;
  let inCalendar = false;
  if (viewer?.userId) {
    const acts = await db.select({ a: schema.alerts.userAction }).from(schema.alerts).where(and(eq(schema.alerts.userId, viewer.userId), eq(schema.alerts.eventId, id)));
    mine = acts.some((x) => x.a === "going" || x.a === "bought") ? "going" : acts.some((x) => x.a === "saved") ? "saved" : null;
    inCalendar = (await db.select().from(schema.calendarEntries).where(and(eq(schema.calendarEntries.userId, viewer.userId), eq(schema.calendarEntries.eventId, id)))).length > 0;
  }
  const view: EventView = {
    id: e.id, artistId: a.id, artistName: a.name, artistImage: a.imageUrl, title: e.title, venue: e.venue,
    city: e.city ? displayCity(e.city) : null, date: e.eventDate, time: e.eventTime, status: e.status, ticketUrl: ticketLinkOf(e),
    isFestival: !!e.isFestival, isSample: !!e.isSample, confidence: e.confidence, lineup: e.lineup ?? [],
    tiers: my.map((t): TierView => ({ name: t.name, priceInr: t.priceInr, status: t.status as TierView["status"], opensAt: t.opensAt?.toISOString() ?? null, closesAt: t.closesAt?.toISOString() ?? null })),
    saleOpensAt: e.saleOpensAt?.toISOString() ?? null, sources: vis.map((s) => ({ url: s.url, platform: s.platform })),
    urgency, stage: stageOf({ status: e.status, saleOpensAt: e.saleOpensAt, tiers: my, confirmed: isConfirmed(e.confidence, distinct.size) }), reason, countdown, inHomeCity: normalizeCity(e.city) === normalizeCity(v.homeCity) || (v.p1Cities ?? []).map(normalizeCity).includes(normalizeCity(e.city)),
    mine, inCalendar,
  };
  return {
    view,
    tierHistory: my.map((t) => ({ name: t.name, status: t.status, priceInr: t.priceInr, observedAt: t.observedAt?.toISOString() ?? null })),
    otherDates: others.map((o) => ({ id: o.id, city: o.city ? displayCity(o.city) : null, date: o.eventDate, venue: o.venue })),
    firstSeenAt: e.firstSeenAt?.toISOString() ?? null,
  };
}
