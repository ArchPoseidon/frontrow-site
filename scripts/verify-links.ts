// Verifies links for upcoming events. Usage: tsx scripts/verify-links.ts [maxEvents] [firecrawlBudget] [--force] [--finder]
import { config } from "dotenv";
config({ path: ".env.local" });
import { and, asc, eq, gte, isNull, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { verifyEventLinks } from "@/lib/links/verify";
import { finishRun, startRun } from "@/lib/collectors/shared";
import { mapLimit } from "@/lib/util/retry";
import { todayIST } from "@/lib/util/ist";

async function main() {
  const [max, budgetArg] = [Number(process.argv[2] ?? 200), Number(process.argv[3] ?? 60)];
  const force = process.argv.includes("--force");
  const finder = process.argv.includes("--finder");
  const db = getDb();
  const run = await startRun(db, "links-backfill");
  const rows = await db
    .select({ id: schema.events.id, s: schema.events.ticketStatus })
    .from(schema.events)
    .where(and(eq(schema.events.isSample, false), or(isNull(schema.events.eventDate), gte(schema.events.eventDate, todayIST())), force ? undefined : eq(schema.events.ticketStatus, "unchecked")))
    .orderBy(asc(schema.events.eventDate))
    .limit(max);
  console.log("events to verify:", rows.length, "firecrawl budget:", budgetArg);
  let credits = 0;
  const tally: Record<string, number> = {};
  let tiers = 0;
  await mapLimit(rows, 4, async (r, i) => {
    try {
      const v = await verifyEventLinks(db, r.id, { budget: Math.max(0, budgetArg - credits), useFinder: finder, force });
      credits += v.credits;
      tiers += v.tiers;
      tally[v.ticketStatus] = (tally[v.ticketStatus] ?? 0) + 1;
      if (i % 10 === 0) console.log(`  ${i + 1}/${rows.length}`, tally, "credits", credits);
    } catch (e) {
      console.error("fail", r.id, String(e).slice(0, 100));
    }
  });
  await finishRun(db, run, { itemsIn: rows.length, firecrawlCredits: credits });
  console.log("DONE", tally, "credits", credits, "tier rows", tiers);
}
main();
