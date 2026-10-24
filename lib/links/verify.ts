import { and, eq } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";
import { extractTiers } from "@/lib/brain/extract";
import { generateGrounded } from "@/lib/brain/gemini";
import { deriveStatus, type EventStatus } from "@/lib/brain/dedupe";
import { mapLimit } from "@/lib/util/retry";
import { checkUrl, type LinkResult } from "./check";
import { canonicalize, hostOf, isGenericUrl, isTicketingHost } from "./url";

// A link is shown to people only in these states.
export const GOOD = new Set(["exact", "ok"]);
const STALE_MS = 7 * 24 * 3600 * 1000;
const RETRY_BLOCKED_MS = 24 * 3600 * 1000;

export type VerifyOpts = { budget?: number; useFinder?: boolean; extractTierInfo?: boolean; force?: boolean };
export type VerifyResult = { ticketStatus: string; ticketUrl: string | null; checked: number; credits: number; tiers: number };

const rank = (s: string | null | undefined) => (s === "exact" ? 0 : s === "ok" ? 1 : 2);

// Verifies every link of one event, picks the exact ticket page, and reads tiers off it.
export async function verifyEventLinks(db: Db, eventId: string, opts: VerifyOpts = {}): Promise<VerifyResult> {
  const [row] = await db
    .select({ e: schema.events, a: schema.artists })
    .from(schema.events)
    .innerJoin(schema.artists, eq(schema.artists.id, schema.events.artistId))
    .where(eq(schema.events.id, eventId));
  if (!row) return { ticketStatus: "none", ticketUrl: null, checked: 0, credits: 0, tiers: 0 };
  const { e, a } = row;
  const names = [a.name, ...(a.aliases ?? [])];
  let credits = 0;
  let budget = opts.budget ?? 0;
  const srcs = await db.select().from(schema.eventSources).where(eq(schema.eventSources.eventId, eventId));
  const results = new Map<string, LinkResult>(); // by original source url

  const fresh = (s: (typeof srcs)[number]) =>
    !opts.force && s.checkedAt && Date.now() - s.checkedAt.getTime() < (s.status === "blocked" ? RETRY_BLOCKED_MS : STALE_MS) && s.status !== "unchecked";

  const ticketCandidate = e.ticketUrl ? canonicalize(e.ticketUrl) : null;
  const pool = [...srcs];
  if (ticketCandidate && !pool.some((s) => s.url === e.ticketUrl)) {
    await db.insert(schema.eventSources).values({ eventId, url: e.ticketUrl!, platform: hostOf(e.ticketUrl!) }).onConflictDoNothing();
    pool.push({ eventId, rawItemId: null, url: e.ticketUrl!, platform: hostOf(e.ticketUrl!), status: "unchecked", httpStatus: null, finalUrl: null, pageTitle: null, checkedAt: null });
  }
  // Ticket candidate and ticketing hosts first; social profiles and others after. Cap the work per event.
  const ordered = pool
    .filter((s) => !fresh(s))
    .sort((x, y) => Number(y.url === e.ticketUrl) - Number(x.url === e.ticketUrl) || Number(isTicketingHost(y.url)) - Number(isTicketingHost(x.url)))
    .slice(0, 8);

  await mapLimit(ordered, 4, async (s) => {
    // Firecrawl only for ticket pages blocked by a bot wall (budget permitting).
    const wantsScrape = s.url === e.ticketUrl || isTicketingHost(s.url);
    const allow = wantsScrape && budget > 0;
    if (allow) budget -= 1; // reserve; refunded below if it was not spent
    // Ticketing pages must be this show (city/date); news articles only need to exist and name the artist.
    const r = await checkUrl(s.url, { names, allowFirecrawl: allow, event: wantsScrape ? { city: e.city, date: e.eventDate } : undefined });
    if (allow && r.credits === 0) budget += 1;
    credits += r.credits;
    results.set(s.url, r);
    await db
      .update(schema.eventSources)
      .set({ status: r.status, httpStatus: r.httpStatus, finalUrl: r.finalUrl, pageTitle: r.title?.slice(0, 200) ?? null, checkedAt: new Date() })
      .where(and(eq(schema.eventSources.eventId, eventId), eq(schema.eventSources.url, s.url)));
  });

  // Current state of every source after this pass.
  const all = await db.select().from(schema.eventSources).where(eq(schema.eventSources.eventId, eventId));
  const pick = () =>
    all
      .filter((s) => GOOD.has(s.status ?? "") && (s.finalUrl ?? s.url) && !isGenericUrl(s.finalUrl ?? s.url) && (isTicketingHost(s.url) || s.url === e.ticketUrl || (e.ticketUrl && canonicalize(e.ticketUrl) === s.finalUrl)))
      .sort((x, y) => rank(x.status) - rank(y.status) || Number(y.url === e.ticketUrl) - Number(x.url === e.ticketUrl) || Number(isTicketingHost(y.url)) - Number(isTicketingHost(x.url)))[0];
  let best = pick();

  // No exact ticket page yet: ask a grounded search for the direct page, then verify what it returns.
  if (!best && opts.useFinder) {
    const found = await findTicketCandidates(a.name, e.city, e.eventDate);
    const fresh2 = found.filter((u) => !all.some((s) => s.url === u)).slice(0, 3);
    for (const u of fresh2) {
      const allow = budget > 0;
      if (allow) budget -= 1;
      const r = await checkUrl(u, { names, allowFirecrawl: allow, event: { city: e.city, date: e.eventDate } });
      if (allow && r.credits === 0) budget += 1;
      credits += r.credits;
      results.set(u, r);
      await db
        .insert(schema.eventSources)
        .values({ eventId, url: u, platform: hostOf(u), status: r.status, httpStatus: r.httpStatus, finalUrl: r.finalUrl, pageTitle: r.title?.slice(0, 200) ?? null, checkedAt: new Date() })
        .onConflictDoNothing();
    }
    if (fresh2.length) {
      all.splice(0, all.length, ...(await db.select().from(schema.eventSources).where(eq(schema.eventSources.eventId, eventId))));
      best = pick();
    }
  }

  let ticketStatus: string;
  let ticketUrl: string | null = null;
  if (best) {
    ticketStatus = best.status ?? "ok";
    ticketUrl = best.finalUrl ?? best.url;
  } else if (e.ticketUrl) {
    const mine = all.find((s) => s.url === e.ticketUrl);
    ticketStatus = mine?.status && !GOOD.has(mine.status) ? mine.status : "none";
  } else {
    ticketStatus = "none";
  }
  await db.update(schema.events).set({ ticketUrl, ticketStatus, ticketCheckedAt: new Date(), ticketVerifiedAt: ticketUrl ? new Date() : null }).where(eq(schema.events.id, eventId));

  // Tiers from the page we just trusted (no extra fetch when we already hold its text).
  let tiers = 0;
  if (best && opts.extractTierInfo !== false) {
    const r = results.get(best.url);
    const text = r?.text ?? "";
    if (text.length > 400) {
      try {
        const t = await extractTiers(text, a.name);
        if (t.is_event_page && t.tiers.length) {
          const have = await db.select().from(schema.eventTiers).where(eq(schema.eventTiers.eventId, eventId));
          for (const x of t.tiers) {
            const prev = have.find((h) => h.name.toLowerCase() === x.name.toLowerCase());
            const vals = { priceInr: x.price_inr, status: x.status, opensAt: x.opens_at && !Number.isNaN(Date.parse(x.opens_at)) ? new Date(x.opens_at) : null, closesAt: x.closes_at && !Number.isNaN(Date.parse(x.closes_at)) ? new Date(x.closes_at) : null, observedAt: new Date() };
            if (prev) await db.update(schema.eventTiers).set(vals).where(eq(schema.eventTiers.id, prev.id));
            else await db.insert(schema.eventTiers).values({ eventId, name: x.name, ...vals });
            tiers++;
          }
          const status = deriveStatus({ announcement_type: "update", tiers: t.tiers, sale_opens_at: t.sale_opens_at } as Parameters<typeof deriveStatus>[0]);
          const order: EventStatus[] = ["rumored", "announced", "sale_soon", "on_sale", "early_bird", "sold_out", "cancelled"];
          const next = t.sold_out ? "sold_out" : status;
          if (order.indexOf(next) > order.indexOf((e.status as EventStatus) ?? "announced")) await db.update(schema.events).set({ status: next, updatedAt: new Date() }).where(eq(schema.events.id, eventId));
          const so = t.sale_opens_at && !Number.isNaN(Date.parse(t.sale_opens_at)) ? new Date(t.sale_opens_at) : null;
          if (so && !e.saleOpensAt) await db.update(schema.events).set({ saleOpensAt: so }).where(eq(schema.events.id, eventId));
        }
      } catch (err) {
        console.error("tier extraction failed", eventId, err instanceof Error ? err.message : err);
      }
    }
  }
  return { ticketStatus, ticketUrl, checked: ordered.length, credits, tiers };
}

// Ask Gemini + Google Search for the direct ticket page of one show.
export async function findTicketCandidates(artist: string, city: string | null, date: string | null): Promise<string[]> {
  try {
    const g = await generateGrounded(
      `Find the direct ticket purchase page (one specific event page, not a homepage or listing) for the ${artist} concert${city ? ` in ${city}` : ""}, India${date ? ` on ${date}` : ""}. Prefer BookMyShow, District, Insider, SkillBox, SortMyScene, Ticketgenie or the organiser's own page. Reply with the URLs only, one per line, or NONE.`,
    );
    const fromText = [...g.text.matchAll(/https?:\/\/[^\s)\]>"']+/g)].map((m) => m[0].replace(/[.,;]+$/, ""));
    const resolved: string[] = [];
    for (const u of [...fromText, ...g.sources.map((s) => s.url)]) {
      let url = canonicalize(u);
      if (url && /vertexaisearch\.cloud\.google\.com/.test(url)) {
        try {
          const r = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(4000) });
          url = canonicalize(r.headers.get("location") ?? "") ?? null;
        } catch {
          url = null;
        }
      }
      if (url && !isGenericUrl(url) && isTicketingHost(url) && !resolved.includes(url)) resolved.push(url);
    }
    return resolved;
  } catch {
    return [];
  }
}
