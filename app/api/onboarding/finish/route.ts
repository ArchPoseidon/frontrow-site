import { after } from "next/server";
import { eq } from "drizzle-orm";
import { schema } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/session";
import { track } from "@/lib/track";
import { startBackgroundScan } from "@/lib/brain/scan";

export const maxDuration = 60;

// Last onboarding click: mark the user onboarded and start the first scan in the background.
// The user goes straight to the radar; results and Telegram alerts arrive as the scan finds them.
export async function POST() {
  const ctx = await requireUser();
  if (!ctx) return unauthorized();
  const { db, user } = ctx;
  await db.update(schema.users).set({ onboardedAt: user.onboardedAt ?? new Date(), onboardingStep: 4 }).where(eq(schema.users.id, user.id));
  await track(db, "onboarding_done", user.id);
  after(async () => {
    await startBackgroundScan(db, user.id, 50_000).catch((e) => console.error("background scan", e));
  });
  return Response.json({ ok: true });
}
