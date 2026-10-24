// Runs the listing collectors once (force) and processes what they found. Usage: tsx scripts/run-listings.ts
import { config } from "dotenv";
config({ path: ".env.local" });
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { collectListing } from "@/lib/collectors/listings";
import { processItems } from "@/lib/brain/process";
import { finishRun, startRun } from "@/lib/collectors/shared";
import { creditsUsedToday, dailyCap } from "@/lib/firecrawl";

async function main() {
  const db = getDb();
  const run = await startRun(db, "listings");
  let credits = 0;
  const ids: string[] = [];
  const used = await creditsUsedToday(db);
  console.log("credits used 24h:", used, "/", dailyCap());
  for (const s of await db.select().from(schema.sources).where(eq(schema.sources.kind, "listing"))) {
    const r = await collectListing(db, s, { creditsLeft: Math.max(0, dailyCap() - used - credits), force: true });
    credits += r.credits;
    console.log(s.name, JSON.stringify(r));
    if (r.rawItemId) ids.push(r.rawItemId);
  }
  await finishRun(db, run, { itemsIn: ids.length, firecrawlCredits: credits });
  const p = await processItems(db, { ids, limit: 10, concurrency: 3, verify: false });
  console.log("process", { in: p.itemsIn, newEvents: p.eventsNew, events: p.eventIds.length, errors: p.errors });
}
main();
