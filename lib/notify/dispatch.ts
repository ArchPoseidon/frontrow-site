import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";
import { todayIST } from "@/lib/util/ist";
import { loadEventCard, type EventCard, type Urgency } from "./content";
import { sendMessage, sendPhoto, TelegramError } from "./telegram";
import { telegramButtons, telegramCaption } from "./caption";
import { alertEmail, digestEmail, type DigestGroup } from "./templates";
import { appUrl, emailConfigured, sendEmail, unsubscribeUrl } from "./email";
import { normalizeCity } from "@/lib/util/city";
import { track } from "@/lib/track";
import { verifyBatch } from "@/lib/brain/process";

export type DispatchStats = { sent: number; failed: number; skipped: number; waitingForEmailSetup: number; errors: string[] };

type UserRow = typeof schema.users.$inferSelect;

export async function deliverTelegram(db: Db, user: UserRow, ev: EventCard, urgency: Urgency, alertId: string | null, kind: "alert" | "test" = "alert") {
  if (!user.telegramChatId) throw new Error("Telegram is not linked");
  const caption = telegramCaption(ev, urgency, kind);
  const buttons = telegramButtons(ev, alertId, appUrl());
  try {
    return (await sendPhoto(user.telegramChatId, `${appUrl()}/api/og/event/${ev.id}?u=${urgency}`, caption, buttons)).message_id;
  } catch (e) {
    if (e instanceof TelegramError && e.blocked) throw e;
    // Poster could not be fetched or rendered: the facts still go out as text.
    return (await sendMessage(user.telegramChatId, caption, buttons)).message_id;
  }
}

export async function deliverEmail(user: UserRow, ev: EventCard, urgency: Urgency, kind: "alert" | "test" = "alert") {
  if (!user.email) throw new Error("No email address on file");
  const unsub = unsubscribeUrl(user.id);
  const m = alertEmail(ev, urgency, unsub, kind);
  await sendEmail(user.email, m.subject, m.html, m.text, unsub);
}

// Sends unsent red/amber alerts, oldest first. Rows are claimed atomically so overlapping runs never double-send.
export async function dispatchAlerts(db: Db, limit = 20, onlyUserId?: string, perUserCap?: number): Promise<DispatchStats> {
  const stats: DispatchStats = { sent: 0, failed: 0, skipped: 0, waitingForEmailSetup: 0, errors: [] };
  const emailReady = emailConfigured();
  const claimed = await db.execute<{ id: string }>(sql`
    update alerts set status = 'sending'
    where id in (
      select id from alerts
      where status = 'pending' and sent_at is null and urgency in ('red','amber')
        and (${onlyUserId ?? null}::text is null or user_id = ${onlyUserId ?? null})
        and (channel = 'telegram' or ${emailReady})
      order by case urgency when 'red' then 0 else 1 end, id limit ${limit}
      for update skip locked)
    returning id`);
  const ids = claimed.rows.map((r) => r.id);
  stats.waitingForEmailSetup = emailReady ? 0 : (await db.select({ n: sql<number>`count(*)::int` }).from(schema.alerts).where(and(eq(schema.alerts.status, "pending"), eq(schema.alerts.channel, "email"), inArray(schema.alerts.urgency, ["red", "amber"]))))[0].n;
  if (!ids.length) return stats;
  const rows = await db
    .select({ a: schema.alerts, u: schema.users })
    .from(schema.alerts)
    .innerJoin(schema.users, eq(schema.users.id, schema.alerts.userId))
    .where(inArray(schema.alerts.id, ids))
    .orderBy(asc(schema.alerts.id));
  // A ticket button must open the exact page: verify any event still unchecked before it goes out.
  await verifyBatch(db, [...new Set(rows.map((r) => r.a.eventId))], { maxEvents: 6, timeMs: 20_000, recheckOlderThanMs: 24 * 3600 * 1000 });
  const today = todayIST();
  // A burst (first sync, big discovery) must not flood anyone: at most 5 instant alerts per user and channel per run,
  // the rest roll into the next digest.
  const perUser = new Map<string, number>();
  const cards = new Map<string, EventCard | null>();
  for (const { a, u } of rows) {
    const set = (v: Partial<typeof schema.alerts.$inferInsert>) => db.update(schema.alerts).set(v).where(eq(schema.alerts.id, a.id));
    const bucket = `${a.userId}:${a.channel}`;
    const n = (perUser.get(bucket) ?? 0) + 1;
    perUser.set(bucket, n);
    if (n > (perUserCap ?? Number(process.env.INSTANT_ALERT_CAP ?? 5))) {
      // Telegram bursts trickle out on the next runs; email overflow rolls into the digest.
      await set({ status: a.channel === "telegram" ? "pending" : "digest_pending" });
      stats.skipped++;
      continue;
    }
    try {
      if (!cards.has(a.eventId)) cards.set(a.eventId, await loadEventCard(db, a.eventId));
      const ev = cards.get(a.eventId);
      if (!ev || (ev.date && ev.date < today) || ev.status === "cancelled") {
        await set({ status: "skipped_past" });
        stats.skipped++;
        continue;
      }
      const urgency = a.urgency as Urgency;
      if (a.channel === "telegram") {
        if (u.disabledAt || !u.telegramChatId || u.telegramEnabled === false) {
          await set({ status: "skipped_unlinked" });
          stats.skipped++;
          continue;
        }
        const mid = await deliverTelegram(db, u, ev, urgency, a.id);
        await set({ status: "sent", sentAt: new Date(), telegramMessageId: mid });
      } else {
        if (u.emailEnabled === false) {
          await set({ status: "skipped_unsubscribed" });
          stats.skipped++;
          continue;
        }
        await deliverEmail(u, ev, urgency);
        await set({ status: "sent", sentAt: new Date() });
      }
      stats.sent++;
      await track(db, "alert_sent", a.userId, { urgency, channel: a.channel });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      stats.failed++;
      stats.errors.push(msg.slice(0, 120));
      if (e instanceof TelegramError && e.blocked) {
        // Blocked the bot: unlink, record it, and fall back to email for this alert.
        await db.update(schema.users).set({ telegramChatId: null }).where(eq(schema.users.id, u.id));
        await set({ status: "failed: telegram blocked" });
        await db.insert(schema.alerts).values({ userId: a.userId, eventId: a.eventId, kind: a.kind, channel: "email", urgency: a.urgency, status: "pending" }).onConflictDoNothing();
      } else if (e instanceof TelegramError && e.code === 429) {
        await set({ status: "pending" }); // try again next run
      } else {
        await set({ status: `failed: ${msg.slice(0, 120)}` });
      }
    }
  }
  return stats;
}

// Daily digest: everything new in the last 24 hours, grouped. Skipped when there is nothing new.
export async function sendDigests(db: Db): Promise<{ sent: number; skipped: number; errors: string[] }> {
  const out = { sent: 0, skipped: 0, errors: [] as string[] };
  if (!emailConfigured()) return out;
  const users = await db.select().from(schema.users).where(eq(schema.users.emailEnabled, true));
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  for (const u of users) {
    if (!u.email) continue;
    try {
      const mine = await db
        .select({ a: schema.alerts, firstSeenAt: schema.events.firstSeenAt })
        .from(schema.alerts)
        .innerJoin(schema.events, eq(schema.events.id, schema.alerts.eventId))
        .where(and(eq(schema.alerts.userId, u.id), sql`${schema.alerts.kind} not in ('digest','test')`));
      const byEvent = new Map<string, Urgency>();
      for (const { a, firstSeenAt } of mine) {
        if ((firstSeenAt && firstSeenAt >= since) || a.status === "digest_pending") {
          const prev = byEvent.get(a.eventId);
          const rank = { red: 2, amber: 1, info: 0 } as const;
          const cur = (a.urgency as Urgency) ?? "info";
          if (!prev || rank[cur] > rank[prev]) byEvent.set(a.eventId, cur);
        }
      }
      if (!byEvent.size) {
        out.skipped++;
        continue;
      }
      // One digest row per (user, event) so no event appears in two digests.
      const fresh = await db
        .insert(schema.alerts)
        .values([...byEvent].map(([eventId, urgency]) => ({ userId: u.id, eventId, kind: "digest", channel: "email", urgency, status: "pending" })))
        .onConflictDoNothing()
        .returning({ id: schema.alerts.id, eventId: schema.alerts.eventId, urgency: schema.alerts.urgency });
      if (!fresh.length) {
        out.skipped++;
        continue;
      }
      const home = normalizeCity(u.homeCity ?? "Bengaluru");
      const groups: DigestGroup[] = [
        { title: u.homeCity ?? "Bengaluru", items: [] },
        { title: "Rest of India", items: [] },
        { title: "Rumours and lineups", items: [] },
      ];
      for (const f of fresh) {
        const ev = await loadEventCard(db, f.eventId);
        if (!ev) continue;
        const item = { ev, urgency: f.urgency as Urgency };
        if (ev.status === "rumored" || (ev.isFestival && !ev.ticketUrl)) groups[2].items.push(item);
        else if (normalizeCity(ev.city) === home) groups[0].items.push(item);
        else groups[1].items.push(item);
      }
      const unsub = unsubscribeUrl(u.id);
      const m = digestEmail(groups, unsub);
      try {
        await sendEmail(u.email, m.subject, m.html, m.text, unsub);
      } catch (e) {
        await db.delete(schema.alerts).where(inArray(schema.alerts.id, fresh.map((f) => f.id))); // retry next run
        throw e;
      }
      await db.update(schema.alerts).set({ status: "sent", sentAt: new Date() }).where(inArray(schema.alerts.id, fresh.map((f) => f.id)));
      await db.update(schema.alerts).set({ status: "sent", sentAt: new Date() }).where(and(eq(schema.alerts.userId, u.id), eq(schema.alerts.status, "digest_pending")));
      out.sent++;
    } catch (e) {
      out.errors.push(e instanceof Error ? e.message.slice(0, 120) : "digest failed");
    }
  }
  return out;
}
