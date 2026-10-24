"use client";

import { useCallback, useEffect, useState } from "react";
import { ArtistPhoto } from "@/components/artist/ArtistPhoto";
import type { ArtistView } from "@/components/event-card/types";

type Settings = {
  phone: string | null;
  consent: boolean;
  enabled: boolean;
  artists: { id: string; name: string; imageUrl: string | null; leadMinutes: number | null }[];
  reminders: { id: string; status: string | null; scheduledFor: string | null; artist: string; city: string | null; date: string | null }[];
};
const MAX = 5;
const LEADS = [{ m: 15, l: "15 min before" }, { m: 60, l: "1 hour before" }, { m: 1440, l: "1 day before" }];
const STATUS: Record<string, string> = { scheduled: "Scheduled", calling: "Calling", done: "Done", failed: "Failed", cancelled: "Cancelled", no_answer: "No answer" };
const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(iso)) : "");

// "Call me" list on the radar: the artists (up to 5) the user wants a phone call for when tickets go live.
export function CallMeSection({ artists }: { artists: ArtistView[] }) {
  const [s, setS] = useState<Settings | null>(null);
  const [phone, setPhone] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/calls/settings").catch(() => null);
    if (r?.ok) setS(await r.json());
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const put = async (body: { phone?: string; consent?: boolean }) => {
    setErr(null);
    const r = await fetch("/api/calls/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) return setErr(j.error ?? "Couldn't save that.");
    setS(j);
    if (body.phone !== undefined) setPhone("");
  };
  const toggle = async (id: string, on: boolean, leadMinutes?: number) => {
    setErr(null);
    const r = await fetch(`/api/artists/${id}/call`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ callMe: on, ...(leadMinutes ? { leadMinutes } : {}) }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) return setErr(j.error ?? "Couldn't change that.");
    await load();
  };

  if (!s) return null;
  const chosen = new Set(s.artists.map((a) => a.id));
  const candidates = artists.filter((a) => !chosen.has(a.id) && a.priority !== "muted").sort((a, b) => Number(b.priority === "must_see") - Number(a.priority === "must_see"));
  const ready = !!s.phone && s.consent;

  return (
    <section id="call-me" aria-labelledby="callme" className="space-y-3 rounded-card border border-surface-border bg-surface/80 p-4 backdrop-blur">
      <div>
        <h2 id="callme" className="font-display text-3xl font-extrabold">📞 Call me</h2>
        <p className="text-sm text-muted">Pick up to {MAX} artists. We&apos;ll phone you before their tickets go live, with the date and time. Calls only between 9 am and 9 pm IST.</p>
        {!s.enabled && <p className="mt-1 rounded-card border border-dashed border-surface-border px-3 py-2 text-xs text-muted">Voice calls switch on soon. You can set up your list now and we&apos;ll start calling when it&apos;s live.</p>}
      </div>
      {err && <p role="alert" className="text-sm text-urgency-red">{err}</p>}

      <div className="space-y-2">
        <p className="text-sm font-medium">Your number {s.phone && <span className="text-muted">({s.phone})</span>}</p>
        <div className="flex gap-2">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder={s.phone ? "Change number" : "+91 98765 43210"} aria-label="Mobile number" className="w-full rounded-card border border-surface-border bg-surface px-3 py-2 text-sm" />
          <button onClick={() => put({ phone })} disabled={!phone.trim()} className="rounded-card border border-surface-border px-4 text-sm font-bold disabled:opacity-40">Save</button>
        </div>
        <label className="flex items-start gap-2 text-xs text-muted">
          <input type="checkbox" checked={s.consent} disabled={!s.phone} onChange={(e) => put({ consent: e.target.checked })} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
          <span>I agree FrontRow may call this number about ticket launches for the artists I choose. I can turn this off any time.</span>
        </label>
      </div>

      <ul className="space-y-2">
        {s.artists.map((a) => (
          <li key={a.id} className="flex items-center gap-3 rounded-card border border-surface-border p-2">
            <span className="h-10 w-10 shrink-0 overflow-hidden rounded-full"><ArtistPhoto name={a.name} imageUrl={a.imageUrl} rounded={false} /></span>
            <span className="min-w-0 flex-1 truncate font-medium">{a.name}</span>
            <select value={a.leadMinutes ?? 60} onChange={(e) => toggle(a.id, true, Number(e.target.value))} aria-label={`When to call about ${a.name}`} className="rounded-card border border-surface-border bg-surface px-2 py-1 text-xs">
              {LEADS.map((l) => <option key={l.m} value={l.m}>{l.l}</option>)}
            </select>
            <button onClick={() => toggle(a.id, false)} aria-label={`Remove ${a.name}`} className="text-muted">✕</button>
          </li>
        ))}
      </ul>
      {s.artists.length < MAX && (
        <div>
          <button onClick={() => setAdding((v) => !v)} className="rounded-card border border-surface-border px-4 py-2 text-sm font-bold">{adding ? "Done" : `+ Add artist (${s.artists.length} of ${MAX})`}</button>
          {adding && (
            <ul className="mt-2 flex max-h-56 flex-wrap gap-2 overflow-y-auto">
              {candidates.slice(0, 40).map((a) => (
                <li key={a.id}><button onClick={() => toggle(a.id, true)} className="rounded-full border border-surface-border px-3 py-1 text-sm">{a.name}</button></li>
              ))}
              {candidates.length === 0 && <li className="text-sm text-muted">No more artists to add.</li>}
            </ul>
          )}
        </div>
      )}
      {s.artists.length > 0 && !ready && <p className="text-xs text-urgency-amber">Add your number and tick the consent box so we can call you.</p>}

      {s.reminders.length > 0 && (
        <div className="space-y-1 border-t border-surface-border pt-3">
          <p className="text-xs font-bold tracking-widest text-muted uppercase">Upcoming calls</p>
          <ul className="space-y-1 text-sm">
            {s.reminders.filter((r) => r.status !== "cancelled").slice(0, 6).map((r) => (
              <li key={r.id} className="flex justify-between gap-3"><span className="truncate">{r.artist}{r.city ? ` · ${r.city}` : ""}</span><span className="shrink-0 text-muted">{when(r.scheduledFor)} · {STATUS[r.status ?? "scheduled"]}</span></li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
