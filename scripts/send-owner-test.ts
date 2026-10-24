import { config } from "dotenv";
config({ path: ".env.local" });
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { dispatchAlerts } from "@/lib/notify/dispatch";
async function main() {
  const db = getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.isOwner, true));
  console.log("linked:", !!u.telegramChatId);
  if (!u.telegramChatId) return;
  // Telegram-only: make sure the owner's queued alerts include telegram rows for home-city events.
  const { upcomingForUser } = await import("@/lib/brain/scan");
  const { decideForEvents } = await import("@/lib/brain/decide");
  await db.update(schema.users).set({ emailEnabled: false }).where(eq(schema.users.id, u.id));
  const ups = await upcomingForUser(db, u.id, u.homeCity);
  await decideForEvents(db, ups.map((s) => s.eventId), u.id);
  const s = await dispatchAlerts(db, 20, u.id);
  console.log(s);
}
main();
