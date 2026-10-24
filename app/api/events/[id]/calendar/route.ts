import { and, eq } from "drizzle-orm";
import { schema } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/session";
import { addToGoogleCalendar, calendarToken, gcalTemplateUrl, removeFromGoogleCalendar } from "@/lib/gcal";
import { track } from "@/lib/track";
import { loadEventCard } from "@/lib/notify/content";

const UUID = /^[0-9a-f-]{36}$/i;

// Add to calendar: always lands in the FrontRow calendar; also in Google Calendar when it is connected.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (!u) return unauthorized();
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: "Not found" }, { status: 404 });
  const [ev] = await u.db.select({ d: schema.events.eventDate }).from(schema.events).where(eq(schema.events.id, id));
  if (!ev) return Response.json({ error: "Not found" }, { status: 404 });
  if (!ev.d) return Response.json({ error: "This show has no date yet, so there's nothing to add." }, { status: 409 });

  const g = await addToGoogleCalendar(u.db, u.user.id, id);
  await u.db
    .insert(schema.calendarEntries)
    .values({ userId: u.user.id, eventId: id, googleEventId: g.ok ? g.googleEventId : null })
    .onConflictDoUpdate({ target: [schema.calendarEntries.userId, schema.calendarEntries.eventId], set: { googleEventId: g.ok ? g.googleEventId : null } });
  await track(u.db, "calendar_add", u.user.id, { via: g.ok ? "google" : "in_app" });
  const card = await loadEventCard(u.db, id).catch(() => null);
  return Response.json({
    ok: true,
    google: g.ok,
    // Always-works fallback: Google's own pre-filled "new event" page.
    templateUrl: card ? gcalTemplateUrl(card) : null,
    // not_connected: offer Connect; google_error: Google refused this time, the FrontRow calendar still has it
    needsConnect: !g.ok && g.reason === "not_connected",
    googleError: !g.ok && g.reason === "google_error",
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (!u) return unauthorized();
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: "Not found" }, { status: 404 });
  const [row] = await u.db.select().from(schema.calendarEntries).where(and(eq(schema.calendarEntries.userId, u.user.id), eq(schema.calendarEntries.eventId, id)));
  if (row?.googleEventId) await removeFromGoogleCalendar(u.db, u.user.id, row.googleEventId);
  await u.db.delete(schema.calendarEntries).where(and(eq(schema.calendarEntries.userId, u.user.id), eq(schema.calendarEntries.eventId, id)));
  return Response.json({ ok: true });
}

export async function GET() {
  const u = await requireUser();
  if (!u) return unauthorized();
  return Response.json({ connected: !!(await calendarToken(u.db, u.user.id)) });
}
