import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/session";
import { maskPhone, normalizePhone, voiceEnabled } from "@/lib/voice";
import { track } from "@/lib/track";

async function shape(u: NonNullable<Awaited<ReturnType<typeof requireUser>>>) {
  const artists = await u.db
    .select({ id: schema.artists.id, name: schema.artists.name, imageUrl: schema.artists.imageUrl, leadMinutes: schema.userArtists.callLeadMinutes, priority: schema.userArtists.priority })
    .from(schema.userArtists)
    .innerJoin(schema.artists, eq(schema.artists.id, schema.userArtists.artistId))
    .where(and(eq(schema.userArtists.userId, u.user.id), eq(schema.userArtists.callMe, true), eq(schema.artists.isDeceased, false)));
  const reminders = await u.db
    .select({ id: schema.callReminders.id, status: schema.callReminders.status, scheduledFor: schema.callReminders.scheduledFor, artist: schema.artists.name, city: schema.events.city, date: schema.events.eventDate })
    .from(schema.callReminders)
    .innerJoin(schema.artists, eq(schema.artists.id, schema.callReminders.artistId))
    .innerJoin(schema.events, eq(schema.events.id, schema.callReminders.eventId))
    .where(eq(schema.callReminders.userId, u.user.id))
    .orderBy(asc(schema.callReminders.scheduledFor))
    .limit(20);
  return { phone: maskPhone(u.user.phoneE164), consent: !!u.user.phoneConsentAt, enabled: voiceEnabled(), artists, reminders: reminders.map((r) => ({ ...r, scheduledFor: r.scheduledFor?.toISOString() ?? null })) };
}

export async function GET() {
  const u = await requireUser();
  if (!u) return unauthorized();
  return Response.json(await shape(u));
}

const Body = z.object({ phone: z.string().max(30).optional(), consent: z.boolean().optional() });

export async function PUT(req: Request) {
  const u = await requireUser();
  if (!u) return unauthorized();
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const set: Partial<typeof schema.users.$inferInsert> = {};
  if (b.data.phone !== undefined) {
    const p = b.data.phone.trim() === "" ? null : normalizePhone(b.data.phone);
    if (b.data.phone.trim() !== "" && !p) return Response.json({ error: "Enter a valid mobile number (10 digits, or with +91)." }, { status: 400 });
    set.phoneE164 = p;
    if (!p) set.phoneConsentAt = null;
  }
  if (b.data.consent !== undefined) {
    if (b.data.consent && !(set.phoneE164 ?? u.user.phoneE164)) return Response.json({ error: "Add your phone number first." }, { status: 400 });
    set.phoneConsentAt = b.data.consent ? new Date() : null;
  }
  if (Object.keys(set).length) await u.db.update(schema.users).set(set).where(eq(schema.users.id, u.user.id));
  // Withdrawing consent (or removing the number) cancels every call that has not been placed.
  if (set.phoneConsentAt === null) await u.db.update(schema.callReminders).set({ status: "cancelled" }).where(and(eq(schema.callReminders.userId, u.user.id), eq(schema.callReminders.status, "scheduled")));
  if (b.data.consent !== undefined) await track(u.db, "call_optin", u.user.id, { on: b.data.consent });
  const [fresh] = await u.db.select().from(schema.users).where(eq(schema.users.id, u.user.id));
  return Response.json(await shape({ ...u, user: fresh }));
}
