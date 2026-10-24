import { and, asc, eq, gte, isNull, ne, notInArray, or } from "drizzle-orm";
import { schema } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/session";
import { displayCity } from "@/lib/util/city";
import { todayIST } from "@/lib/util/ist";

// "Touring India now": artists with confirmed upcoming India events the system has already found.
// Real events only (never samples); the user's own artists are excluded.
export async function GET() {
  const ctx = await requireUser();
  if (!ctx) return unauthorized();
  const { db, user } = ctx;
  const mine = (await db.select({ id: schema.userArtists.artistId }).from(schema.userArtists).where(eq(schema.userArtists.userId, user.id))).map((r) => r.id);
  const today = todayIST();
  const rows = await db
    .select({ a: schema.artists, e: schema.events })
    .from(schema.events)
    .innerJoin(schema.artists, eq(schema.artists.id, schema.events.artistId))
    .where(
      and(
        eq(schema.events.isSample, false),
        ne(schema.events.status, "cancelled"),
        ne(schema.events.status, "rumored"),
        gte(schema.events.confidence, 0.6),
        eq(schema.artists.isDeceased, false),
        or(isNull(schema.events.eventDate), gte(schema.events.eventDate, today)),
        mine.length ? notInArray(schema.artists.id, mine) : undefined,
      ),
    )
    .orderBy(asc(schema.events.eventDate))
    .limit(60);
  const seen = new Set<string>();
  const suggestions = [];
  for (const { a, e } of rows) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    suggestions.push({
      artistId: a.id,
      name: a.name,
      imageUrl: a.imageUrl,
      spotifyId: a.spotifyId,
      identityStatus: a.identityStatus,
      next: { eventId: e.id, city: e.city ? displayCity(e.city) : null, date: e.eventDate, status: e.status },
    });
    if (suggestions.length >= 8) break;
  }
  return Response.json({ suggestions });
}

// Adds a suggested artist to the user's list (artist rows already exist, so no identity lookup).
export async function POST(req: Request) {
  const ctx = await requireUser();
  if (!ctx) return unauthorized();
  const { artistId } = (await req.json().catch(() => ({}))) as { artistId?: string };
  if (!artistId || !/^[0-9a-f-]{36}$/i.test(artistId)) return Response.json({ error: "Invalid request" }, { status: 400 });
  const [a] = await ctx.db.select().from(schema.artists).where(eq(schema.artists.id, artistId));
  if (!a) return Response.json({ error: "Artist not found" }, { status: 404 });
  await ctx.db.insert(schema.userArtists).values({ userId: ctx.user.id, artistId, priority: "follow", addedVia: "suggested" }).onConflictDoNothing();
  return Response.json({ ok: true });
}
