import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { cronAuthorized, forbidden } from "@/lib/jobs";
import { collectListing } from "@/lib/collectors/listings";
import { creditsUsedToday, dailyCap } from "@/lib/firecrawl";
import { finishRun, startRun } from "@/lib/collectors/shared";

export const maxDuration = 60;

// Ticketing listings (District, BookMyShow, AllEvents, SortMyScene): each page is scraped when due,
// skipped if unchanged, and handed to the process job when it changed. Firecrawl spend is capped per day.
export async function POST(req: Request) {
  if (!cronAuthorized(req)) return forbidden();
  const db = getDb();
  const run = await startRun(db, "listings");
  const errors: string[] = [];
  let credits = 0;
  let changed = 0;
  try {
    // Keep 10 credits in reserve for link verification.
    let left = Math.max(0, dailyCap() - 10 - (await creditsUsedToday(db)));
    const sources = await db.select().from(schema.sources).where(eq(schema.sources.kind, "listing"));
    const started = Date.now();
    for (const s of sources) {
      if (Date.now() - started > 40_000) break;
      const r = await collectListing(db, s, { creditsLeft: left });
      credits += r.credits;
      left -= r.credits;
      if (r.rawItemId) changed++;
      if (r.error) errors.push(`${s.name}: ${r.error}`);
    }
    await finishRun(db, run, { itemsIn: changed, firecrawlCredits: credits, errors });
    return Response.json({ ok: true, changed, credits, errors });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    await finishRun(db, run, { firecrawlCredits: credits, errors: [msg] });
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
