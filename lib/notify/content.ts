import { eq } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";
import { displayCity } from "@/lib/util/city";
import { ticketLinkOf, visibleSources } from "@/lib/links/display";
import { isConfirmed, stageOf, type Stage } from "@/lib/stage";

export type Urgency = "red" | "amber" | "info";

export type EventCard = {
  id: string;
  artistName: string;
  artistImage: string | null;
  title: string | null;
  venue: string | null;
  city: string | null;
  date: string | null;
  time: string | null;
  status: string | null;
  ticketUrl: string | null;
  isFestival: boolean;
  isSample: boolean;
  confidence: number | null;
  tiers: { name: string; priceInr: number | null; status: string | null; opensAt: Date | null; closesAt: Date | null }[];
  saleOpensAt: Date | null;
  platforms: string[];
  sourceLinks: { url: string; platform: string | null }[]; // verified, working pages only
  ticketStatus: string | null;
  stage: Stage;
};

export async function loadEventCard(db: Db, id: string): Promise<EventCard | null> {
  const [row] = await db
    .select({ e: schema.events, a: schema.artists })
    .from(schema.events)
    .innerJoin(schema.artists, eq(schema.artists.id, schema.events.artistId))
    .where(eq(schema.events.id, id));
  if (!row) return null;
  const [tiers, srcs] = await Promise.all([
    db.select().from(schema.eventTiers).where(eq(schema.eventTiers.eventId, id)),
    db.select().from(schema.eventSources).where(eq(schema.eventSources.eventId, id)),
  ]);
  const good = visibleSources(srcs);
  const platforms = [...new Set(good.map((s) => (s.platform ?? new URL(s.url).hostname.replace(/^www\./, "")).trim()).filter(Boolean))];
  const { e, a } = row;
  return {
    id: e.id,
    artistName: a.name,
    artistImage: a.imageUrl,
    title: e.title,
    venue: e.venue,
    city: e.city ? displayCity(e.city) : null,
    date: e.eventDate,
    time: e.eventTime,
    status: e.status,
    ticketUrl: ticketLinkOf(e),
    ticketStatus: e.ticketStatus,
    isFestival: !!e.isFestival,
    isSample: !!e.isSample,
    confidence: e.confidence,
    tiers: tiers.map((t) => ({ name: t.name, priceInr: t.priceInr, status: t.status, opensAt: t.opensAt, closesAt: t.closesAt })).sort((x, y) => (x.opensAt?.getTime() ?? 0) - (y.opensAt?.getTime() ?? 0)),
    saleOpensAt: e.saleOpensAt,
    platforms,
    stage: stageOf({ status: e.status, saleOpensAt: e.saleOpensAt, tiers, confirmed: isConfirmed(e.confidence, new Set(good.map((g) => (g.platform ?? g.url).toLowerCase())).size) }),
    sourceLinks: good.map((s) => ({ url: s.url, platform: s.platform })),
  };
}

const fmtDay = (d: string | null) =>
  d ? new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`)) : "Date to be announced";
export const showDay = fmtDay;

export function relative(to: Date, now = Date.now()) {
  const m = Math.round((to.getTime() - now) / 60000);
  if (m <= 0) return "now";
  if (m < 60) return `in ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `in ${h}h ${m % 60}m`;
  return `in ${Math.round(h / 24)} days`;
}

export const URGENCY_EMOJI: Record<Urgency, string> = { red: "🔴", amber: "🟠", info: "⚪" };

// One line saying why this urgency: used by the caption, email and poster.
export function reasonLine(ev: EventCard, now = Date.now()): string | null {
  const open = ev.tiers.find((t) => t.status === "open");
  if (open) {
    const price = open.priceInr ? ` · ₹${open.priceInr.toLocaleString("en-IN")}` : "";
    const closes = open.closesAt && open.closesAt.getTime() > now ? ` · closes ${relative(open.closesAt, now)}` : "";
    return `${/early|presale/i.test(open.name) ? "Early bird" : open.name} open${price}${closes}`;
  }
  if (ev.status === "early_bird" || ev.status === "on_sale") return "Tickets on sale";
  if (ev.saleOpensAt && ev.saleOpensAt.getTime() > now) return `Sale opens ${relative(ev.saleOpensAt, now)}`;
  if (ev.status === "sold_out") return "Sold out";
  if (ev.status === "rumored") return "Rumour, unconfirmed";
  return "Announced, tickets not live yet";
}

export function headline(ev: EventCard, kind: "alert" | "test" = "alert") {
  const tag = ev.isSample ? "SAMPLE" : kind === "test" ? "TEST" : ev.isFestival ? "FESTIVAL" : "NEW SHOW";
  return `${tag}${ev.city ? ` · ${ev.city.toUpperCase()}` : ""}`;
}
