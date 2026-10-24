import { getDb } from "@/lib/db";
import { cronAuthorized, forbidden } from "@/lib/jobs";
import { finishRun, startRun } from "@/lib/collectors/shared";
import { runDueCalls, scheduleReminders } from "@/lib/voice";

export const maxDuration = 60;

// Schedules reminders for call-me artists' shows, then places the ones that are due (only when VOICE_CALLS_ENABLED=true).
export async function POST(req: Request) {
  if (!cronAuthorized(req)) return forbidden();
  const db = getDb();
  const run = await startRun(db, "calls");
  try {
    const scheduled = await scheduleReminders(db);
    const r = await runDueCalls(db);
    await finishRun(db, run, { itemsIn: scheduled, alertsSent: r.placed });
    return Response.json({ ok: true, scheduled, ...r });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    await finishRun(db, run, { errors: [msg] });
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
