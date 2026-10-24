import { getDb } from "@/lib/db";
import { cronAuthorized, forbidden } from "@/lib/jobs";
import { dispatchAlerts } from "@/lib/notify/dispatch";
import { finishRun, startRun } from "@/lib/collectors/shared";

export const maxDuration = 60;

// Sends unsent red/amber alerts (oldest first, 20 per call). Safe to call twice.
export async function POST(req: Request) {
  if (!cronAuthorized(req)) return forbidden();
  const db = getDb();
  const run = await startRun(db, "dispatch");
  try {
    const s = await dispatchAlerts(db, 20);
    await finishRun(db, run, { itemsIn: s.sent + s.failed + s.skipped, alertsSent: s.sent, errors: s.errors });
    return Response.json({ ok: true, ...s });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    await finishRun(db, run, { errors: [msg] });
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
