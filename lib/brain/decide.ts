import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";
import { emailConfigured } from "@/lib/notify/email";
import { ticketLinkOf, visibleSources } from "@/lib/links/display";
import { computeUrgency, type Urgency } from "./urgency";

const RANK = { info: 0, amber: 1, red: 2 } as const;

// For every user watching the event's artist (excluding muted): compute urgency and queue alerts.
// The unique (user, event, kind, channel) constraint guarantees nobody gets the same alert twice.
// Dispatch (Phase 3) sends them; info only goes into the digest.
export async function decideForEvents(db: Db, eventIds: string[], onlyUserId?: string) {
  const created: { userId: string; eventId: string; urgency: Urgency }[] = [];
  if (!eventIds.length) return created;
  const evs = await db.select().from(schema.events).where(inArray(schema.events.id, eventIds));
  for (const ev of evs) {
    if (ev.status === "cancelled" || ev.isSample) continue;
    const [tiers, srcs, watchers] = await Promise.all([
      db.select().from(schema.eventTiers).where(eq(schema.eventTiers.eventId, ev.id)),
      db.select().from(schema.eventSources).where(eq(schema.eventSources.eventId, ev.id)),
      db
        .select({ user: schema.users, priority: schema.userArtists.priority })
        .from(schema.userArtists)
        .innerJoin(schema.users, eq(schema.users.id, schema.userArtists.userId))
        .where(
          and(
            eq(schema.userArtists.artistId, ev.artistId),
            ne(schema.userArtists.priority, "muted"),
            onlyUserId ? eq(schema.userArtists.userId, onlyUserId) : undefined,
          ),
        ),
    ]);
    const distinct = new Set(visibleSources(srcs).map((s) => (s.platform ?? new URL(s.url).hostname).toLowerCase()));
    for (const w of watchers) {
      const urgency = computeUrgency(
        { ...ev, ticketUrl: ticketLinkOf(ev), saleOpensAt: ev.saleOpensAt, sourceCount: distinct.size, tiers },
        { homeCity: w.user.homeCity, watchCities: w.user.watchCities, priority: w.priority, p1Cities: w.user.p1Cities, p2Cities: w.user.p2Cities },
      );
      if (!urgency) continue;
      const channels: ("telegram" | "email")[] = [];
      const tg = !!w.user.telegramChatId && w.user.telegramEnabled !== false;
      const em = w.user.emailEnabled !== false && emailConfigured(); // no email channel until credentials exist
      if (urgency === "info") {
        if (em) channels.push("email"); // digest only
      } else {
        if (tg) channels.push("telegram");
        if (em && (urgency === "red" || !tg)) channels.push("email"); // red by email too; amber falls back when no Telegram
      }
      for (const channel of channels) {
        const rows = await db
          .insert(schema.alerts)
          .values({ userId: w.user.id, eventId: ev.id, kind: "new_show", channel, urgency, status: urgency === "info" ? "digest_pending" : "pending" })
          .onConflictDoUpdate({
            target: [schema.alerts.userId, schema.alerts.eventId, schema.alerts.kind, schema.alerts.channel],
            set: { urgency, status: urgency === "info" ? "digest_pending" : "pending" },
            // Only upgrade an alert that has not gone out yet.
            setWhere: sql`${schema.alerts.sentAt} is null and ${schema.alerts.status} in ('pending','digest_pending') and (case ${schema.alerts.urgency} when 'red' then 2 when 'amber' then 1 else 0 end) < ${RANK[urgency]}`,
          })
          .returning({ id: schema.alerts.id, sentAt: schema.alerts.sentAt });
        if (rows.length) created.push({ userId: w.user.id, eventId: ev.id, urgency });
      }
    }
  }
  return created;
}
