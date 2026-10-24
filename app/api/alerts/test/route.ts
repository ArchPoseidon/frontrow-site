import { eq } from "drizzle-orm";
import { schema } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/session";
import { upcomingForUser } from "@/lib/brain/scan";
import { loadEventCard, type Urgency } from "@/lib/notify/content";
import { deliverEmail, deliverTelegram } from "@/lib/notify/dispatch";
import { emailConfigured } from "@/lib/notify/email";
import { TelegramError } from "@/lib/notify/telegram";
import { addDays } from "@/lib/util/ist";

export const maxDuration = 60;

// "Send test alert": the user's nearest REAL upcoming event, labelled Test. Only when there is none,
// a sample card labelled Sample (stored with is_sample = true).
export async function POST() {
  const ctx = await requireUser();
  if (!ctx) return unauthorized();
  const { db, user } = ctx;
  const tgOn = !!user.telegramChatId && user.telegramEnabled !== false;
  const emOn = user.emailEnabled !== false && !!user.email && emailConfigured();
  if (!tgOn && !emOn) return Response.json({ error: "Connect Telegram or turn on email first" }, { status: 409 });

  const upcoming = (await upcomingForUser(db, user.id, user.homeCity)).filter((s) => s.date);
  let eventId = upcoming.sort((a, b) => (a.inHomeCity === b.inHomeCity ? 0 : a.inHomeCity ? -1 : 1) || (a.date! < b.date! ? -1 : 1))[0]?.eventId;
  let sample = false;
  if (!eventId) {
    sample = true;
    const [first] = await db
      .select({ id: schema.userArtists.artistId })
      .from(schema.userArtists)
      .where(eq(schema.userArtists.userId, user.id))
      .limit(1);
    if (!first) return Response.json({ error: "Add an artist first" }, { status: 409 });
    const key = `sample|${user.id}`;
    await db
      .insert(schema.events)
      .values({ artistId: first.id, title: "Sample show", venue: "Sample Arena", city: user.homeCity ?? "Bengaluru", eventDate: addDays(30), status: "early_bird", confidence: 1, isSample: true, dedupeKey: key, updatedAt: new Date() })
      .onConflictDoNothing();
    const [row] = await db.select({ id: schema.events.id }).from(schema.events).where(eq(schema.events.dedupeKey, key));
    eventId = row.id;
  }
  const ev = await loadEventCard(db, eventId);
  if (!ev) return Response.json({ error: "Couldn't load the event" }, { status: 500 });
  if (sample) ev.tiers = [{ name: "Early bird", priceInr: 1500, status: "open", opensAt: null, closesAt: new Date(Date.now() + 36 * 3600 * 1000) }];

  const urgency: Urgency = "amber";
  const sent: string[] = [];
  const failed: string[] = [];
  const record = async (channel: "telegram" | "email", mid?: number) => {
    await db
      .insert(schema.alerts)
      .values({ userId: user.id, eventId: ev.id, kind: "test", channel, urgency, status: "sent", sentAt: new Date(), telegramMessageId: mid })
      .onConflictDoUpdate({ target: [schema.alerts.userId, schema.alerts.eventId, schema.alerts.kind, schema.alerts.channel], set: { sentAt: new Date(), status: "sent" } });
  };
  if (tgOn) {
    try {
      const mid = await deliverTelegram(db, user, ev, urgency, null, "test");
      await record("telegram", mid);
      sent.push("Telegram");
    } catch (e) {
      failed.push(e instanceof TelegramError && e.blocked ? "Telegram (you blocked the bot, send /start to it again)" : "Telegram");
    }
  }
  if (emOn) {
    try {
      await deliverEmail(user, ev, urgency, "test");
      await record("email");
      sent.push("email");
    } catch {
      failed.push("email");
    }
  }
  return Response.json({ ok: sent.length > 0, sent, failed, sample, artist: ev.artistName, city: ev.city, date: ev.date }, { status: sent.length ? 200 : 502 });
}
