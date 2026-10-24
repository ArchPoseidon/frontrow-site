import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/session";
import { track } from "@/lib/track";

const Body = z.object({ callMe: z.boolean().optional(), leadMinutes: z.number().int().min(5).max(1440).optional() });
export const MAX_CALL_ARTISTS = 5;

// Turn "call me when tickets drop" on or off for one followed artist (core list is capped at 5).
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (!u) return unauthorized();
  const { id } = await ctx.params;
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success || !/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Invalid request" }, { status: 400 });
  if (b.data.callMe) {
    const [{ n }] = await u.db.select({ n: sql<number>`count(*)::int` }).from(schema.userArtists).where(and(eq(schema.userArtists.userId, u.user.id), eq(schema.userArtists.callMe, true)));
    const [cur] = await u.db.select({ c: schema.userArtists.callMe }).from(schema.userArtists).where(and(eq(schema.userArtists.userId, u.user.id), eq(schema.userArtists.artistId, id)));
    if (!cur?.c && n >= MAX_CALL_ARTISTS) return Response.json({ error: `You can pick up to ${MAX_CALL_ARTISTS} artists for calls. Turn one off first.` }, { status: 409 });
  }
  const rows = await u.db
    .update(schema.userArtists)
    .set({ ...(b.data.callMe !== undefined ? { callMe: b.data.callMe } : {}), ...(b.data.leadMinutes ? { callLeadMinutes: b.data.leadMinutes } : {}) })
    .where(and(eq(schema.userArtists.userId, u.user.id), eq(schema.userArtists.artistId, id)))
    .returning();
  if (!rows.length) return Response.json({ error: "Follow this artist first" }, { status: 404 });
  if (b.data.callMe === false) {
    // Cancel reminders that have not been placed yet.
    await u.db.update(schema.callReminders).set({ status: "cancelled" }).where(and(eq(schema.callReminders.userId, u.user.id), eq(schema.callReminders.artistId, id), eq(schema.callReminders.status, "scheduled")));
  }
  await track(u.db, "call_toggle", u.user.id, { on: !!b.data.callMe });
  return Response.json({ ok: true, needsPhone: !!b.data.callMe && !(u.user.phoneE164 && u.user.phoneConsentAt) });
}
