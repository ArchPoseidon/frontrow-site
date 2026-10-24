// Finds artists with real upcoming India shows (Gemini grounded search), adds them to the owner's radar,
// then runs sweep + process so /demo has real, sourced events. Usage: tsx scripts/seed-owner-radar.ts
import { config } from "dotenv";
config({ path: ".env.local" });
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { generateGrounded, generateJson } from "@/lib/brain/gemini";
import { resolveInputs } from "@/lib/identity/resolve";
import { enrichArtists } from "@/lib/identity/artists";
import { loadWatched } from "@/lib/brain/match";
import { sweepArtist } from "@/lib/collectors/sweep";
import { processItems } from "@/lib/brain/process";
import { upcomingForUser } from "@/lib/brain/scan";
import { mapLimit } from "@/lib/util/retry";
import { todayIST } from "@/lib/util/ist";

const Names = z.object({ artists: z.array(z.string()) });

async function main() {
  const db = getDb();
  const [owner] = await db.select().from(schema.users).where(eq(schema.users.isOwner, true));
  const today = todayIST();
  const pool = new Set<string>();
  for (const q of [
    `Which artists and bands have announced upcoming concerts in Bengaluru, India after ${today}? Give at least 15 with date, venue and a ticket link.`,
    `Which international and Indian artists have announced upcoming India tour dates (Mumbai, Delhi, Bengaluru, Hyderabad, Pune, Chennai) after ${today}? Give at least 15 with dates and ticket links.`,
    `Which artists are playing music festivals in India after ${today} (NH7 Weekender, Lollapalooza India, Sunburn, etc.)? List headliners with dates.`,
  ]) {
    const g = await generateGrounded(q);
    const out = await generateJson(`Extract the artist/band names who have upcoming India shows from this text. Names only, no tribute acts, max 20.\n\n"""${g.text.slice(0, 8000)}"""`, Names);
    out.artists.forEach((n) => pool.add(n.trim()));
  }
  const names = [...pool].filter(Boolean).slice(0, 45);
  console.log("candidates", names.length, names.join(" | "));
  const r = await resolveInputs(db, owner.id, names);
  console.log("resolved", r.resolved.length, "review", r.needsReview.length, "unverified", r.unverified.length);
  for (const x of r.needsReview) await db.update(schema.artistCandidates).set({ status: "removed" }).where(eq(schema.artistCandidates.id, x.candidateId));
  await enrichArtists(db, r.newArtistIds, 20_000);
  // Candidates were found because they tour India: treat as must-see so the daily sweep covers them.
  const ids = [...r.resolved, ...r.unverified].map((a) => a.artist.id);
  if (ids.length) await db.update(schema.userArtists).set({ priority: "must_see" }).where(and(eq(schema.userArtists.userId, owner.id), inArray(schema.userArtists.artistId, ids)));
  const watched = await loadWatched(db, ids);
  const sw = await mapLimit(watched, 4, (a) => sweepArtist(db, null, a));
  console.log("sweeps with shows:", sw.filter((s) => s.found).length, "errors:", sw.filter((s) => s.error).map((s) => s.error));
  const itemIds = sw.flatMap((s) => (s.rawItemId ? [s.rawItemId] : []));
  for (let i = 0; i < itemIds.length; i += 10) {
    const p = await processItems(db, { ids: itemIds.slice(i, i + 10), limit: 10, concurrency: 5 });
    console.log("process", { in: p.itemsIn, new: p.eventsNew, errors: p.errors });
  }
  const up = await upcomingForUser(db, owner.id, owner.homeCity);
  console.log(`\n${up.length} upcoming real events on the owner's radar (${up.filter((s) => s.inHomeCity).length} in home city)`);
  for (const s of up) console.log(`${s.date} ${s.city} | ${s.artistName} | ${s.venue} | ${s.status} ${s.confidence} | ${s.sources.length} src`);
}
main();
