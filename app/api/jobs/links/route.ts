import { and, asc, eq, gte, inArray, isNull, lt, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { cronAuthorized, forbidden } from "@/lib/jobs";
import { creditsUsedToday, dailyCap } from "@/lib/firecrawl";
import { verifyEventLinks } from "@/lib/links/verify";
import { finishRun, startRun } from "@/lib/collectors/shared";
import { mapLimit } from "@/lib/util/retry";
import { todayIST } from "@/lib/util/ist";

export const maxDuration = 60;

// Link verifier: first unchecked events, then upcoming events whose last check is more than 3 days old.
// Verifies that every ticket/source link loads, is a specific page and names the artist; reads tiers off the ticket page.
export async function POST(req: Request) {
  if (!cronAuthorized(req)) return forbidden();
  const db = getDb();
  const run = await startRun(db, "links");
  const errors: string[] = [];
  let credits = 0;
  let checked = 0;
  try {
    const started = Date.now();
    const today = todayIST();
    const upcoming = and(eq(schema.events.isSample, false), or(isNull(schema.events.eventDate), gte(schema.events.eventDate, today)));
    const unchecked = await db.select({ id: schema.events.id }).from(schema.events).where(and(upcoming, eq(schema.events.ticketStatus, "unchecked"))).orderBy(asc(schema.events.firstSeenAt)).limit(8);
    const blocked = unchecked.length >= 8 ? [] : await db.select({ id: schema.events.id }).from(schema.events).where(and(upcoming, eq(schema.events.ticketStatus, "blocked"), lt(schema.events.ticketCheckedAt, new Date(Date.now() - 24 * 3600 * 1000)))).orderBy(asc(schema.events.ticketCheckedAt)).limit(8 - unchecked.length);
    const room1 = 8 - unchecked.length - blocked.length;
    // Shows with no direct ticket page yet: look again every 2 days, this time asking a grounded search to find it.
    const noPage = room1 <= 0 ? [] : await db.select({ id: schema.events.id }).from(schema.events).where(and(upcoming, inArray(schema.events.ticketStatus, ["generic", "none", "mismatch"]), lt(schema.events.ticketCheckedAt, new Date(Date.now() - 2 * 24 * 3600 * 1000)))).orderBy(asc(schema.events.ticketCheckedAt)).limit(Math.min(3, room1));
    const room = room1 - noPage.length;
    const stale = room <= 0 ? [] : await db.select({ id: schema.events.id }).from(schema.events).where(and(upcoming, lt(schema.events.ticketCheckedAt, new Date(Date.now() - 3 * 24 * 3600 * 1000)))).orderBy(asc(schema.events.ticketCheckedAt)).limit(room);
    const todo = [...unchecked, ...blocked, ...noPage, ...stale];
    const finderIds = new Set([...unchecked, ...noPage].map((x) => x.id));
    const budget = Math.max(0, dailyCap() - (await creditsUsedToday(db)));
    await mapLimit(todo, 3, async ({ id }) => {
      if (Date.now() - started > 45_000) return;
      try {
        const v = await verifyEventLinks(db, id, { budget: Math.max(0, budget - credits), useFinder: finderIds.has(id), force: noPage.some((n) => n.id === id) });
        credits += v.credits;
        checked++;
      } catch (e) {
        errors.push(e instanceof Error ? e.message.slice(0, 100) : "verify failed");
      }
    });
    await finishRun(db, run, { itemsIn: checked, firecrawlCredits: credits, errors });
    return Response.json({ ok: true, checked, credits, errors });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    await finishRun(db, run, { errors: [msg] });
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
