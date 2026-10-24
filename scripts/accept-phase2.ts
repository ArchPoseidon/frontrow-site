import { config } from "dotenv";
config({ path: ".env.local" });
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { runFirstScan } from "@/lib/brain/scan";
async function main() {
  const db = getDb();
  const [u] = await db.insert(schema.users).values({ id: `test-accept-${Date.now()}`, name: "Test Accept", email: `acc-${Date.now()}@example.invalid` }).returning();
  try {
    const names = ["Fred again..", "Hanumankind", "Labrinth", "Talwiinder", "Queens of the Stone Age"];
    const rows = await db.select().from(schema.artists).where(inArray(schema.artists.name, names));
    await db.insert(schema.userArtists).values(rows.map((a, i) => ({ userId: u.id, artistId: a.id, priority: i === 0 ? "must_see" : "follow", addedVia: i === 0 ? "suggested" : "search" })));
    const t = Date.now();
    await runFirstScan(db, u, (ev, d) => { if (ev !== "done") console.log(ev, JSON.stringify(d).slice(0, 140)); else console.log("DONE", (d as any).headline, "| shows", (d as any).shows.length, "| quiet", (d as any).quiet.map((q: any) => `${q.name}: ${q.lastIndia}`)); });
    console.log("elapsed s", (Date.now() - t) / 1000);
    const al = await db.select().from(schema.alerts).where(eq(schema.alerts.userId, u.id));
    console.log("alerts queued", al.length);
  } finally {
    await db.delete(schema.users).where(eq(schema.users.id, u.id));
  }
}
main();
