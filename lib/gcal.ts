import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";
import { loadEventCard } from "@/lib/notify/content";
import { appUrl } from "@/lib/notify/email";

export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

// An access token for the user's Google Calendar, or null if they have not connected it.
// Refreshes with the stored refresh token when the access token is about to expire.
export async function calendarToken(db: Db, userId: string): Promise<string | null> {
  const [a] = await db.select().from(schema.accounts).where(and(eq(schema.accounts.userId, userId), eq(schema.accounts.provider, "google")));
  if (!a || !a.scope?.includes("calendar")) return null;
  const now = Math.floor(Date.now() / 1000);
  if (a.access_token && a.expires_at && a.expires_at - now > 120) return a.access_token;
  if (!a.refresh_token) return null;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.AUTH_GOOGLE_ID ?? "", client_secret: process.env.AUTH_GOOGLE_SECRET ?? "", grant_type: "refresh_token", refresh_token: a.refresh_token }),
    signal: AbortSignal.timeout(10_000),
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!r.ok || !j.access_token) {
    // Revoked, or a Testing-mode refresh token that expired after 7 days: the user reconnects.
    console.error("gcal token refresh failed", r.status, JSON.stringify(j).slice(0, 200));
    return null;
  }
  await db
    .update(schema.accounts)
    .set({ access_token: j.access_token, expires_at: now + (j.expires_in ?? 3600) })
    .where(and(eq(schema.accounts.provider, "google"), eq(schema.accounts.providerAccountId, a.providerAccountId)));
  return j.access_token;
}

// Same user + same show always gives the same Google event id, so adding twice never duplicates.
const gid = (userId: string, eventId: string) => `fr${createHash("sha256").update(`${userId}:${eventId}`).digest("hex").slice(0, 40)}`;

const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);

// A plain "Add to Google Calendar" link that needs no sign-in or API: Google opens its own pre-filled event form.
// Always works, so a failed API call never leaves the user at a dead end.
export function gcalTemplateUrl(ev: { artistName: string; title?: string | null; isFestival?: boolean; date: string | null; time?: string | null; venue?: string | null; city?: string | null; id: string; ticketUrl?: string | null }): string | null {
  if (!ev.date) return null;
  const d = ev.date.replace(/-/g, "");
  const t = /^(\d{1,2}):(\d{2})/.exec(ev.time ?? "");
  let dates: string;
  if (t) {
    const startMs = Date.parse(`${ev.date}T${t[1].padStart(2, "0")}:${t[2]}:00+05:30`);
    const fmt = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    dates = `${fmt(startMs)}/${fmt(startMs + 3 * 3600_000)}`;
  } else dates = `${d}/${nextDay(ev.date).replace(/-/g, "")}`;
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: `${ev.artistName}${ev.title && ev.title !== ev.artistName && ev.isFestival ? ` · ${ev.title}` : ""} (live)`,
    dates,
    location: [ev.venue, ev.city].filter(Boolean).join(", "),
    details: [ev.ticketUrl ? `Tickets: ${ev.ticketUrl}` : "", `Details: ${appUrl()}/event/${ev.id}`, "Added from FrontRow"].filter(Boolean).join("\n"),
    ctz: "Asia/Kolkata",
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

export type GcalResult = { ok: true; googleEventId: string } | { ok: false; reason: "no_date" | "not_connected" | "google_error"; detail?: string };

export async function addToGoogleCalendar(db: Db, userId: string, eventId: string): Promise<GcalResult> {
  const ev = await loadEventCard(db, eventId);
  if (!ev || !ev.date) return { ok: false, reason: "no_date" };
  const token = await calendarToken(db, userId);
  if (!token) return { ok: false, reason: "not_connected" };
  const t = /^(\d{1,2}):(\d{2})/.exec(ev.time ?? "");
  const start = t ? { dateTime: `${ev.date}T${t[1].padStart(2, "0")}:${t[2]}:00+05:30`, timeZone: "Asia/Kolkata" } : { date: ev.date };
  const end = t ? { dateTime: new Date(Date.parse(`${ev.date}T${t[1].padStart(2, "0")}:${t[2]}:00+05:30`) + 3 * 3600_000).toISOString(), timeZone: "Asia/Kolkata" } : { date: nextDay(ev.date) };
  const body = {
    id: gid(userId, eventId),
    summary: `${ev.artistName}${ev.title && ev.title !== ev.artistName && ev.isFestival ? ` · ${ev.title}` : ""} (live)`,
    location: [ev.venue, ev.city].filter(Boolean).join(", "),
    description: [ev.ticketUrl ? `Tickets: ${ev.ticketUrl}` : "", `Details: ${appUrl()}/event/${ev.id}`, "Added from FrontRow"].filter(Boolean).join("\n"),
    start,
    end,
    source: { title: "FrontRow", url: `${appUrl()}/event/${ev.id}` },
  };
  const r = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12_000),
  });
  // 409: already there (same deterministic id). Fine.
  if (!r.ok && r.status !== 409) {
    const detail = (await r.text().catch(() => "")).slice(0, 240);
    // Keep a trace (status and Google's message, never the token): usually "Calendar API not enabled" (403) or a revoked grant (401).
    console.error("gcal insert failed", r.status, detail);
    await db.insert(schema.runs).values({ job: "gcal", finishedAt: new Date(), errors: [`Google Calendar ${r.status}: ${detail}`] }).catch(() => {});
    return { ok: false, reason: r.status === 401 || (r.status === 403 && /insufficient|scope|permission/i.test(detail)) ? "not_connected" : "google_error", detail: `${r.status}` };
  }
  return { ok: true, googleEventId: body.id };
}

export async function removeFromGoogleCalendar(db: Db, userId: string, googleEventId: string) {
  const token = await calendarToken(db, userId);
  if (!token) return;
  await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${googleEventId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) }).catch(() => {});
}
