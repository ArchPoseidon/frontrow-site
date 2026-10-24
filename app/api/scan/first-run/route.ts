import { requireUser, unauthorized } from "@/lib/session";
import { runFirstScan } from "@/lib/brain/scan";
import { sseResponse } from "@/lib/util/sse";
import { eq } from "drizzle-orm";
import { schema } from "@/lib/db";
import { finishRun, startRun } from "@/lib/collectors/shared";

export const maxDuration = 60;

// Streams progress as server-sent events: start, step, log, found, done (with the summary).
export async function POST() {
  const ctx = await requireUser();
  if (!ctx) return unauthorized();
  const { db, user } = ctx;
  return sseResponse(async (emit) => {
    const run = await startRun(db, "first-run");
    const r = await runFirstScan(db, user, emit).catch(async (e) => {
      await finishRun(db, run, { errors: [String(e).slice(0, 160)] });
      throw e;
    });
    await finishRun(db, run, { firecrawlCredits: r.credits });
    // Mark onboarding as finished once the user has seen their first results.
    await db.update(schema.users).set({ onboardedAt: user.onboardedAt ?? new Date(), firstScanAt: user.firstScanAt ?? new Date() }).where(eq(schema.users.id, user.id));
  });
}
