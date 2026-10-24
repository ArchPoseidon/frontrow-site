import { getDb } from "@/lib/db";
import { cronAuthorized, forbidden } from "@/lib/jobs";
import { sendDigests } from "@/lib/notify/dispatch";
import { finishRun, startRun } from "@/lib/collectors/shared";

export const maxDuration = 60;

// 09:00 IST daily digest.
export async function POST(req: Request) {
  if (!cronAuthorized(req)) return forbidden();
  const db = getDb();
  const run = await startRun(db, "digest");
  try {
    const s = await sendDigests(db);
    await finishRun(db, run, { alertsSent: s.sent, errors: s.errors });
    return Response.json({ ok: true, ...s });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    await finishRun(db, run, { errors: [msg] });
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
