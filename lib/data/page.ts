import { schema, type Db } from "@/lib/db";
import { getCachedScanInfo } from "./cached";
import { getAlertHistory, getArtistViews, getRadarEvents } from "./radar";

// Everything the radar screen needs for one viewer (the signed-in user, or the owner for /demo).
export async function loadRadarPage(db: Db, user: typeof schema.users.$inferSelect, opts: { history: boolean }) {
  const viewer = { userId: user.id, homeCity: user.homeCity, watchCities: user.watchCities, p1Cities: user.p1Cities, p2Cities: user.p2Cities };
  const [events, artists, history, scan, liveElsewhere] = await Promise.all([
    getRadarEvents(db, viewer),
    getArtistViews(db, user.id),
    opts.history ? getAlertHistory(db, user.id) : Promise.resolve(undefined),
    getCachedScanInfo(),
    getRadarEvents(db, viewer, { elsewhere: { limit: 6 } }),
  ]);
  return { events, liveElsewhere, artists, history, sourceCount: scan.sourceCount, lastScanAt: scan.lastScanAt };
}
