// Checks every known artist against MusicBrainz and hides deceased solo artists and disbanded groups everywhere.
// Usage: npx tsx scripts/check-deceased.ts [--all]   (default: only artists not checked in the last 30 days)
import { config } from "dotenv";
config({ path: ".env.local" });
import { and, eq, isNotNull, isNull, lt, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getDetails, mbidForExactName, mbidForSpotifyId } from "@/lib/identity/musicbrainz";
import { inactiveFields } from "@/lib/identity/artists";

async function main() {
  const db = getDb();
  const all = process.argv.includes("--all");
  const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const rows = await db.select().from(schema.artists).where(all ? undefined : or(isNull(schema.artists.deceasedCheckedAt), lt(schema.artists.deceasedCheckedAt, cutoff)));
  let hidden = 0;
  for (const a of rows) {
    try {
      let mbid = a.mbid;
      if (!mbid && a.spotifyId) mbid = (await mbidForSpotifyId(a.spotifyId)) ?? (await mbidForExactName(a.name));
      if (!mbid) continue;
      const d = await getDetails(mbid);
      if (!d) continue;
      const f = inactiveFields(d);
      await db.update(schema.artists).set(f).where(eq(schema.artists.id, a.id));
      if (f.isDeceased) {
        hidden++;
        console.log("hidden:", a.name, f.inactiveReason);
      }
    } catch (e) {
      console.error("check failed", a.name, e instanceof Error ? e.message : e);
    }
  }
  console.log(`checked ${rows.length}, hidden ${hidden}`);
}
main();
