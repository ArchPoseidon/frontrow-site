import { and, count, eq, gte, ne } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { cronAuthorized, forbidden } from "@/lib/jobs";
import { creditsUsedToday, dailyCap } from "@/lib/firecrawl";
import { monthlyCap as sdMonthly, scrapedoUsed } from "@/lib/scrapedo";
import { esc, sendMessage } from "@/lib/notify/telegram";
import { appUrl, emailConfigured, sendEmail } from "@/lib/notify/email";
import { finishRun, startRun } from "@/lib/collectors/shared";

export const maxDuration = 60;

// Daily 8:30 IST message to the owner: silent failure is the worst outcome, so this says what is red.
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return forbidden();
  const db = getDb();
  const run = await startRun(db, "heartbeat");
  try {
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const [sources, [events], [alerts], used, [owner], [spotify], links, runs] = await Promise.all([
      db.select().from(schema.sources),
      db.select({ n: count() }).from(schema.events).where(and(gte(schema.events.firstSeenAt, since), eq(schema.events.isSample, false))),
      db.select({ n: count() }).from(schema.alerts).where(and(gte(schema.alerts.sentAt, since), eq(schema.alerts.status, "sent"), ne(schema.alerts.kind, "test"), ne(schema.alerts.kind, "digest"))),
      creditsUsedToday(db),
      db.select().from(schema.users).where(eq(schema.users.isOwner, true)),
      db.select().from(schema.spotifyConnections).innerJoin(schema.users, eq(schema.users.id, schema.spotifyConnections.userId)).where(eq(schema.users.isOwner, true)),
      db.select({ s: schema.events.ticketStatus, n: count() }).from(schema.events).groupBy(schema.events.ticketStatus),
      db.select().from(schema.runs).where(gte(schema.runs.startedAt, since)),
    ]);
    const sd = await scrapedoUsed().catch(() => ({ month: 0, day: 0 }));
    const bad = sources.filter((s) => !s.enabled || (s.consecutiveFailures ?? 0) > 0 || s.lastError);
    const ok = sources.length - bad.length;
    const never = sources.filter((s) => !s.lastOkAt && s.enabled).length;
    const real = runs.filter((r) => r.job !== "scrapedo" && r.job !== "spotify-connect");
    const jobsRan = new Set(real.map((r) => r.job.replace(/^scan-now:.*/, "scan-now"))).size;
    const lc = Object.fromEntries(links.map((l) => [l.s ?? "unchecked", l.n]));
    const lines = [
      "<b>FrontRow heartbeat</b>",
      `Sources OK: ${ok}/${sources.length}${never ? ` (${never} not run yet)` : ""}`,
      `New shows (24h): ${events.n}`,
      `Alerts sent (24h): ${alerts.n}`,
      `Firecrawl credits (24h): ${used}/${dailyCap()}`,
      `Ticket links: ${lc.exact ?? 0} verified, ${(lc.unchecked ?? 0) + (lc.blocked ?? 0)} pending, ${(lc.generic ?? 0) + (lc.broken ?? 0) + (lc.mismatch ?? 0) + (lc.none ?? 0)} without a direct page`,
      `Backup crawler (Scrape.do): ${sd.day} credits today, ${sd.month}/${sdMonthly()} this month`,
      `Job runs (24h): ${real.length} across ${jobsRan} jobs`,
    ];
    if (spotify?.spotify_connections?.broken) lines.push("🔴 Spotify connection is broken: reconnect it in Setup");
    if (!real.length) lines.push("🔴 No jobs ran in the last 24 hours. Check cron-job.org");
    const refused = runs.filter((r) => r.job === "spotify-connect");
    if (refused.length) lines.push(`🟠 Spotify refused ${refused.length} connection${refused.length === 1 ? "" : "s"} in 24h (the account probably is not on the Spotify app's user list). ${esc(String((refused[0].errors as string[] | null)?.[0] ?? "").slice(0, 100))}`);
    for (const s of bad) lines.push(`🔴 ${esc(s.name)}: ${esc((s.lastError ?? (s.enabled ? "failing" : "disabled")).slice(0, 80))}`);
    // A Telegram chat can be linked to one account at a time, so the owner's report is pinned to a fixed chat when
    // OWNER_TELEGRAM_CHAT_ID is set; otherwise it uses the owner account's linked chat.
    const chatId = process.env.OWNER_TELEGRAM_CHAT_ID ? Number(process.env.OWNER_TELEGRAM_CHAT_ID) : owner?.telegramChatId;
    if (!chatId) {
      await finishRun(db, run, { errors: ["owner has no Telegram chat linked"] });
      return Response.json({ ok: false, error: "Owner has no Telegram chat linked" });
    }
    await sendMessage(chatId, lines.join("\n"));
    // The same report by email, to the owner's address only (OWNER_EMAIL). Nobody else ever receives it.
    const ownerEmail = process.env.OWNER_EMAIL;
    if (ownerEmail && emailConfigured()) {
      const text = lines.join("\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
      const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;line-height:1.6">${text.split("\n").map((l, i) => (i === 0 ? `<h2 style="margin:0 0 8px">${l}</h2>` : `<div>${l.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</div>`)).join("")}</div>`;
      await sendEmail(ownerEmail, "FrontRow daily heartbeat", html, text, `${appUrl()}/profile`).catch((e) => console.error("heartbeat email", e));
    }
    await finishRun(db, run, { alertsSent: 1 });
    return Response.json({ ok: true, lines });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    await finishRun(db, run, { errors: [msg] });
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
