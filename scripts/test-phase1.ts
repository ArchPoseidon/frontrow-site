// Phase 1 gate check against the live Neon DB, Spotify and MusicBrainz.
// Uses two throwaway users and cleans up everything it created.
import { config } from "dotenv";
config({ path: ".env.local" });
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { resolveInputs } from "@/lib/identity/resolve";
import { enrichArtists } from "@/lib/identity/artists";

const INPUTS = [
  "Prateek Kuhad", // exact name
  "Coldplay", // exact name
  "The Local Train", // leading "The"
  "https://open.spotify.com/artist/4YRxDV8wJFPHPTeXepOstw?si=abc123", // Spotify link (Arijit Singh)
  "Dua Lipaa", // misspelling
  "Taylor", // ambiguous
  "Parvaaz", // exact, Indian band
  "Zzxqv Blorptonia Band", // nothing anywhere
  "Nucleya",
  "AP Dhillon",
].join("\n");

async function main() {
  const db = getDb();
  const mk = async (tag: string) => {
    const [u] = await db.insert(schema.users).values({ id: `test-${tag}-${Date.now()}`, name: `Test ${tag}`, email: `test-${tag}-${Date.now()}@example.invalid` }).returning();
    return u;
  };
  const a = await mk("a");
  const b = await mk("b");
  const created: string[] = [];
  try {
    const t0 = Date.now();
    const r = await resolveInputs(db, a.id, INPUTS);
    console.log(`\nUser A resolved in ${Date.now() - t0}ms`);
    console.log("VERIFIED:");
    for (const x of r.resolved) console.log(`  ${x.inputText.slice(0, 40).padEnd(42)} -> ${x.artist.name} [${x.artist.identityStatus}] img=${x.artist.imageUrl ? "yes" : "NO"} new=${x.isNew}`);
    console.log("NEEDS REVIEW (tray):");
    for (const x of r.needsReview) console.log(`  ${x.inputText.padEnd(24)} -> ${x.candidates.length} candidates: ${x.candidates.slice(0, 4).map((c) => `${c.name}${c.source === "musicbrainz" ? " (MB)" : ""}`).join(", ")}`);
    console.log("UNVERIFIED (name only):");
    for (const x of r.unverified) console.log(`  ${x.inputText} -> ${x.artist.name} [${x.artist.identityStatus}] (initials tile)`);
    console.log("FAILED:", r.failed);
    created.push(...r.resolved.map((x) => x.artist.id), ...r.unverified.map((x) => x.artist.id));

    const total = r.resolved.length + r.needsReview.length + r.unverified.length + r.failed.length;
    console.log(`\nAccounted for ${total} of 10 inputs`);

    // Duplicate check: user B adds the same names; must reuse artist rows.
    const r2 = await resolveInputs(db, b.id, INPUTS);
    const idsA = new Set([...r.resolved, ...r.unverified].map((x) => x.artist.id));
    const idsB = [...r2.resolved, ...r2.unverified].map((x) => x.artist.id);
    console.log(`User B reused ${idsB.filter((i) => idsA.has(i)).length}/${idsB.length} artist rows; new rows created: ${r2.resolved.filter((x) => x.isNew).length}`);

    // Alias enrichment (MusicBrainz, ~2-3 calls per artist)
    const t1 = Date.now();
    await enrichArtists(db, r.resolved.slice(0, 3).map((x) => x.artist.id), 40_000);
    const enriched = await db.select().from(schema.artists).where(inArray(schema.artists.id, r.resolved.slice(0, 3).map((x) => x.artist.id)));
    console.log(`\nEnrichment took ${Date.now() - t1}ms`);
    for (const e of enriched) console.log(`  ${e.name}: origin=${e.origin} mbid=${e.mbid ?? "-"} aliases=${JSON.stringify((e.aliases ?? []).slice(0, 6))}`);

    const dupes = await db.execute(`select spotify_id, count(*) from artists where spotify_id is not null group by 1 having count(*)>1` as never);
    console.log("\nDuplicate spotify_id rows:", (dupes as { rows?: unknown[] }).rows?.length ?? dupes);
  } finally {
    // cleanup: users cascade user_artists/candidates; remove artists created by this test
    await db.delete(schema.users).where(inArray(schema.users.id, [a.id, b.id]));
    if (created.length) await db.delete(schema.artists).where(inArray(schema.artists.id, created));
    console.log("\ncleaned up test users and artists");
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
