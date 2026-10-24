import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/session";
import { getRadarEvents } from "@/lib/data/radar";

// The viewer's radar. `?demo=1` is the public read-only owner radar.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") ?? "india";
  let viewer;
  let db;
  if (url.searchParams.get("demo") === "1") {
    db = getDb();
    const [o] = await db.select().from(schema.users).where(eq(schema.users.isOwner, true));
    if (!o) return Response.json({ events: [] });
    viewer = { userId: o.id, homeCity: o.homeCity, watchCities: o.watchCities, p1Cities: o.p1Cities, p2Cities: o.p2Cities };
  } else {
    const ctx = await requireUser();
    if (!ctx) return unauthorized();
    db = ctx.db;
    viewer = { userId: ctx.user.id, homeCity: ctx.user.homeCity, watchCities: ctx.user.watchCities, p1Cities: ctx.user.p1Cities, p2Cities: ctx.user.p2Cities };
  }
  let events = await getRadarEvents(db, viewer);
  if (scope === "home") events = events.filter((e) => e.inHomeCity);
  if (scope === "festivals") events = events.filter((e) => e.isFestival);
  if (scope === "rumors") events = events.filter((e) => e.status === "rumored");
  return Response.json({ events });
}
