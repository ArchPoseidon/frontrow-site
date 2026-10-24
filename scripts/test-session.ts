// Local-dev helper: creates a throwaway test user with a few artists and a session token.
// Usage: tsx scripts/test-session.ts create | cleanup
import { config } from "dotenv";
config({ path: ".env.local" });
import { eq, inArray, like } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { getDb, schema } from "@/lib/db";
async function main() {
  const db = getDb();
  if (process.argv[2] === "cleanup") {
    await db.delete(schema.users).where(like(schema.users.email, "%@frontrow-test.invalid"));
    return console.log("cleaned");
  }
  const id = `test-ui-${Date.now()}`;
  await db.insert(schema.users).values({ id, name: "Test Visitor", email: `${id}@frontrow-test.invalid` });
  const arts = await db.select().from(schema.artists).where(inArray(schema.artists.name, ["Fred again..", "Hanumankind", "Labrinth", "Sonu Nigam", "Parvaaz"]));
  await db.insert(schema.userArtists).values(arts.map((a) => ({ userId: id, artistId: a.id, priority: "follow", addedVia: "search" })));
  const token = randomBytes(24).toString("hex");
  await db.insert(schema.sessions).values({ sessionToken: token, userId: id, expires: new Date(Date.now() + 86400000) });
  console.log(token);
}
main();
