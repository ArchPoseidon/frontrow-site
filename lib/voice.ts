import { and, eq, gt, isNotNull, ne, sql } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";
import { loadEventCard } from "@/lib/notify/content";
import { showDay } from "@/lib/notify/content";

// Voice reminder calls. Voibz carries the phone line (SIP) and an ElevenLabs conversational agent speaks.
// Everything is behind VOICE_CALLS_ENABLED=true: with the flag off, reminders are scheduled and shown, but no call is placed.
export const voiceEnabled = () => process.env.VOICE_CALLS_ENABLED === "true";
const MAX_ATTEMPTS = 3;
const RETRY_MIN = [0, 10, 30];

export const maskPhone = (p: string | null | undefined) => (p ? `${p.slice(0, 3)} ••••• ••${p.slice(-3)}` : null);

// +91 default; accepts "98765 43210", "+91 98765 43210", "09876543210".
export function normalizePhone(raw: string): string | null {
  const d = raw.replace(/[^\d+]/g, "");
  if (/^\+\d{10,14}$/.test(d)) return d;
  const digits = d.replace(/\D/g, "").replace(/^0+/, "");
  if (/^\d{10}$/.test(digits)) return `+91${digits}`;
  if (/^91\d{10}$/.test(digits)) return `+${digits}`;
  return null;
}

// No calls outside 09:00-21:00 IST: pull the time back into the window (before 9 -> 20:30 the evening before).
export function withinWindow(d: Date): Date {
  const ist = new Date(d.getTime() + 5.5 * 3600_000);
  const h = ist.getUTCHours() + ist.getUTCMinutes() / 60;
  if (h >= 9 && h < 21) return d;
  const day = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - (h < 9 ? 1 : 0), 20, 30));
  return new Date(day.getTime() - 5.5 * 3600_000);
}

// Create/refresh reminders for call-me artists' shows with a known go-live time; cancel ones that no longer apply.
export async function scheduleReminders(db: Db) {
  const rows = await db
    .select({ ua: schema.userArtists, u: schema.users, e: schema.events })
    .from(schema.userArtists)
    .innerJoin(schema.users, eq(schema.users.id, schema.userArtists.userId))
    .innerJoin(schema.events, eq(schema.events.artistId, schema.userArtists.artistId))
    .innerJoin(schema.artists, eq(schema.artists.id, schema.userArtists.artistId))
    .where(and(eq(schema.userArtists.callMe, true), ne(schema.userArtists.priority, "muted"), isNotNull(schema.users.phoneE164), isNotNull(schema.users.phoneConsentAt), isNotNull(schema.events.saleOpensAt), gt(schema.events.saleOpensAt, new Date()), eq(schema.events.isSample, false), ne(schema.events.status, "cancelled"), eq(schema.artists.isDeceased, false)));
  let made = 0;
  for (const { ua, e } of rows) {
    const when = withinWindow(new Date(e.saleOpensAt!.getTime() - (ua.callLeadMinutes ?? 60) * 60_000));
    if (when.getTime() < Date.now() - 3600_000) continue;
    const r = await db
      .insert(schema.callReminders)
      .values({ userId: ua.userId, artistId: ua.artistId, eventId: e.id, scheduledFor: when })
      .onConflictDoUpdate({ target: [schema.callReminders.userId, schema.callReminders.eventId], set: { scheduledFor: when }, setWhere: eq(schema.callReminders.status, "scheduled") })
      .returning({ id: schema.callReminders.id });
    made += r.length;
  }
  return made;
}

export type CallResult = { ok: boolean; callId?: string; error?: string };

// Outbound call through an ElevenLabs agent over Voibz's SIP trunk. NOTE: confirm the endpoint and fields against the live API
// with one call to the owner's own number before turning VOICE_CALLS_ENABLED on.
export async function placeCall(to: string, vars: Record<string, string>): Promise<CallResult> {
  const key = process.env.ELEVENLABS_API_KEY;
  const agent = process.env.ELEVENLABS_AGENT_ID;
  const phoneId = process.env.ELEVENLABS_PHONE_NUMBER_ID;
  if (!key || !agent || !phoneId) return { ok: false, error: "voice provider not configured" };
  try {
    const r = await fetch("https://api.elevenlabs.io/v1/convai/sip-trunk/outbound-call", {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ agent_id: agent, agent_phone_number_id: phoneId, to_number: to, conversation_initiation_client_data: { dynamic_variables: vars } }),
      signal: AbortSignal.timeout(20_000),
    });
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; conversation_id?: string; callSid?: string; message?: string };
    if (!r.ok || j.success === false) return { ok: false, error: `${r.status} ${j.message ?? ""}`.trim().slice(0, 160) };
    return { ok: true, callId: j.conversation_id ?? j.callSid };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 120) : "call failed" };
  }
}

// Places due calls (flag permitting). Claims rows atomically so overlapping runs never call twice.
export async function runDueCalls(db: Db, max = 5) {
  if (!voiceEnabled()) return { placed: 0, skipped: "voice calls are off" };
  const now = new Date();
  const claimed = await db.execute(sql`
    update call_reminders set status = 'calling', attempts = attempts + 1
    where id in (select id from call_reminders where status in ('scheduled','no_answer') and scheduled_for <= ${now} and attempts < ${MAX_ATTEMPTS}
      and (status = 'scheduled' or scheduled_for + (interval '10 minutes') * attempts <= ${now}) order by scheduled_for limit ${max} for update skip locked)
    returning id, user_id, artist_id, event_id`);
  const rows = ((claimed as unknown as { rows?: unknown[] }).rows ?? (claimed as unknown as unknown[])) as { id: string; user_id: string; artist_id: string; event_id: string }[];
  let placed = 0;
  for (const r of rows) {
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, r.user_id));
    const ev = await loadEventCard(db, r.event_id);
    const go = ev?.saleOpensAt ? new Date(ev.saleOpensAt) : null;
    if (!u?.phoneE164 || !u.phoneConsentAt || !ev || (go && go.getTime() < Date.now() - 3600_000)) {
      await db.update(schema.callReminders).set({ status: "cancelled" }).where(eq(schema.callReminders.id, r.id));
      continue;
    }
    const res = await placeCall(u.phoneE164, {
      first_name: (u.name ?? "there").split(" ")[0],
      artist: ev.artistName,
      city: ev.city ?? "India",
      show_date: showDay(ev.date),
      go_live: go ? new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(go) : "soon",
    });
    await db.update(schema.callReminders).set(res.ok ? { providerCallId: res.callId ?? null, status: "calling" } : { status: "failed", outcome: { error: res.error } }).where(eq(schema.callReminders.id, r.id));
    if (res.ok) placed++;
  }
  return { placed };
}

export const REMINDER_STATUSES = ["scheduled", "calling", "done", "failed", "cancelled", "no_answer"] as const;
