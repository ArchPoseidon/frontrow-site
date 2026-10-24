import { getDb } from "@/lib/db";
import { cronAuthorized, forbidden } from "@/lib/jobs";
import { processItems } from "@/lib/brain/process";
import { finishRun, startRun } from "@/lib/collectors/shared";

export const maxDuration = 60;

// Extract -> match -> dedupe -> decide for up to 10 new raw items. Safe to call twice.
export async function POST(req: Request) {
  if (!cronAuthorized(req)) return forbidden();
  const db = getDb();
  const run = await startRun(db, "process");
  try {
    const s = await processItems(db, { limit: Number(process.env.PROCESS_BATCH ?? 6), concurrency: 4, verify: { maxEvents: 6, timeMs: 10_000 } });
    await finishRun(db, run, { itemsIn: s.itemsIn, eventsNew: s.eventsNew, alertsSent: 0, firecrawlCredits: s.credits, errors: s.errors });
    return Response.json({ ok: true, ...s, eventIds: undefined });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    await finishRun(db, run, { errors: [msg] });
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
