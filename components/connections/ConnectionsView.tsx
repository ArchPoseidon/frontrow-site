"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { GoogleCalendarMark, TelegramMark, Tick } from "@/components/icons/BrandIcons";
import { ConnectSpotifyButton } from "@/components/spotify/ConnectSpotify";
import { SpotifyMark } from "@/components/spotify/SpotifyMark";
import type { Connections } from "@/lib/data/connections";

type TgLink = { linked: boolean; url?: string | null; configured?: boolean };
type Msg = { tone: "ok" | "error"; text: string } | null;

function Logo({ children, ok }: { children: React.ReactNode; ok: boolean }) {
  return (
    <span className="relative shrink-0">
      {children}
      {ok && <Tick className="absolute -right-1 -bottom-1" />}
    </span>
  );
}

function Status({ ok, warn, on = "Connected", off = "Not connected" }: { ok: boolean; warn?: string; on?: string; off?: string }) {
  if (warn) return <p className="text-sm font-bold text-urgency-amber">{warn}</p>;
  return ok ? (
    <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--tier-open)]"><span aria-hidden>✓</span>{on}</p>
  ) : (
    <p className="text-sm text-muted">{off}</p>
  );
}

const card = "flex flex-col gap-4 rounded-card border border-surface-border bg-surface/90 p-4 backdrop-blur";
const btn = "rounded-card border border-surface-border px-4 py-2 text-sm font-bold hover:bg-white/5 disabled:opacity-50";

export function ConnectionsView({ initial }: { initial: Connections }) {
  const [c, setC] = useState(initial);
  const [tg, setTg] = useState<TgLink | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const loadTg = useCallback(async () => {
    try {
      const r = await fetch("/api/telegram/link", { cache: "no-store" });
      if (!r.ok) throw new Error();
      const j = (await r.json()) as TgLink;
      setTg(j);
      setC((x) => (x.telegram.connected === j.linked ? x : { ...x, telegram: { ...x.telegram, connected: j.linked } }));
    } catch {
      /* keep what we had */
    }
  }, []);
  useEffect(() => {
    loadTg();
  }, [loadTg]);
  // While waiting for "Start" in Telegram, poll until the link is confirmed.
  useEffect(() => {
    if (c.telegram.connected) return;
    const t = setInterval(loadTg, 2500);
    return () => clearInterval(t);
  }, [c.telegram.connected, loadTg]);
  useEffect(() => {
    if (tg?.url && !c.telegram.connected) QRCode.toDataURL(tg.url, { margin: 1, width: 168 }).then(setQr).catch(() => setQr(null));
  }, [tg?.url, c.telegram.connected]);

  const connectedCount = [c.spotify.connected, c.telegram.connected, c.calendar.connected].filter(Boolean).length;

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : "Something went wrong" });
    } finally {
      setBusy(null);
    }
  }

  const unlinkTelegram = () =>
    run("tg-unlink", async () => {
      const r = await fetch("/api/telegram/link", { method: "DELETE" });
      if (!r.ok) throw new Error("Couldn't unlink Telegram");
      setC((x) => ({ ...x, telegram: { ...x.telegram, connected: false } }));
      setTg(null);
      await loadTg();
      setMsg({ tone: "ok", text: "Telegram unlinked" });
    });

  const pauseTelegram = (on: boolean) =>
    run("tg-pause", async () => {
      const r = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ telegramEnabled: on }) });
      if (!r.ok) throw new Error("Couldn't save that");
      setC((x) => ({ ...x, telegram: { ...x.telegram, enabled: on } }));
    });

  const testAlert = () =>
    run("test", async () => {
      const r = await fetch("/api/alerts/test", { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as { error?: string; sent?: string[]; artist?: string; city?: string; sample?: boolean; failed?: string[] };
      if (!r.ok) throw new Error(j.error ?? (j.failed?.length ? `Couldn't send via ${j.failed.join(", ")}` : "Couldn't send the test"));
      setMsg({ tone: "ok", text: `Test sent to ${j.sent?.join(" and ")}: ${j.sample ? "a sample card (none of your artists has a show yet)" : `${j.artist}${j.city ? ` in ${j.city}` : ""}`}.` });
    });

  const disconnectCalendar = () =>
    run("cal", async () => {
      const r = await fetch("/api/gcal/disconnect", { method: "POST" });
      if (!r.ok) throw new Error("Couldn't disconnect Google Calendar");
      setC((x) => ({ ...x, calendar: { connected: false } }));
      setMsg({ tone: "ok", text: "Google Calendar disconnected. Shows you already added stay where they are." });
    });

  return (
    <div className="flex flex-col gap-5">
      <div className={`${card} flex-row flex-wrap items-center justify-between`}>
        <div className="flex items-center gap-4">
          <Logo ok={c.spotify.connected}><SpotifyMark size={40} /></Logo>
          <Logo ok={c.telegram.connected}><TelegramMark size={40} /></Logo>
          <Logo ok={c.calendar.connected}><GoogleCalendarMark size={40} /></Logo>
        </div>
        <p className="font-display text-3xl leading-none font-extrabold">{connectedCount} of 3 connected</p>
      </div>

      {msg && <p role="status" className={`rounded-card border px-4 py-3 text-sm ${msg.tone === "ok" ? "border-[var(--tier-open)]/60" : "border-urgency-red/60"}`}>{msg.text}</p>}

      {/* Telegram */}
      <section className={card} aria-labelledby="c-tg">
        <div className="flex items-center gap-4">
          <Logo ok={c.telegram.connected}><TelegramMark size={52} /></Logo>
          <div className="min-w-0 flex-1">
            <h2 id="c-tg" className="font-display text-3xl leading-none font-extrabold">Telegram</h2>
            <Status ok={c.telegram.connected} on={c.telegram.enabled ? "Connected · alerts on" : "Connected · alerts paused"} off={tg?.configured === false ? "Not set up on this server" : "Not connected"} />
          </div>
        </div>
        {c.telegram.connected ? (
          <>
            <p className="text-sm text-muted">New shows, ticket go-lives and your Going taps all happen in your Telegram chat with the bot{c.telegram.bot ? ` @${c.telegram.bot}` : ""}.</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={testAlert} disabled={busy === "test"} className={btn}>{busy === "test" ? "Sending…" : "Send test alert"}</button>
              <button onClick={() => pauseTelegram(!c.telegram.enabled)} disabled={busy === "tg-pause"} className={btn}>{c.telegram.enabled ? "Pause alerts" : "Resume alerts"}</button>
              <button onClick={unlinkTelegram} disabled={busy === "tg-unlink"} className={`${btn} text-muted`}>Unlink</button>
            </div>
          </>
        ) : tg === null ? (
          <div className="h-24 animate-pulse rounded-card bg-surface-border" />
        ) : tg.url ? (
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="QR code to link Telegram" width={128} height={128} className="rounded-card bg-white p-1" />
            )}
            <div className="space-y-2 text-sm">
              <a href={tg.url} target="_blank" rel="noopener noreferrer" className="inline-block rounded-card bg-[#27A7E7] px-5 py-2.5 font-bold text-white">Connect Telegram</a>
              <p className="text-muted">Scan the code with your phone, or tap the button on this device, then press <b>Start</b> in Telegram. This page updates by itself.</p>
              <p className="flex items-center gap-2 text-xs text-muted"><span className="inline-block h-2 w-2 animate-pulse rounded-full bg-urgency-amber" />Waiting for you to press Start…</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">Telegram isn&apos;t set up on this server yet.</p>
        )}
      </section>

      {/* Spotify */}
      <section className={card} aria-labelledby="c-sp">
        <div className="flex items-center gap-4">
          <Logo ok={c.spotify.connected}><SpotifyMark size={52} /></Logo>
          <div className="min-w-0 flex-1">
            <h2 id="c-sp" className="font-display text-3xl leading-none font-extrabold">Spotify</h2>
            <Status ok={c.spotify.connected} on={c.spotify.name ? `Connected as ${c.spotify.name}` : "Connected"} warn={c.spotify.broken ? "Connection lost. Reconnect to keep importing" : undefined} />
          </div>
        </div>
        <p className="text-sm text-muted">Import the artists you follow and listen to. Read-only: we never post or change anything.</p>
        <div className="flex flex-wrap gap-2">
          <ConnectSpotifyButton className={`inline-block ${c.spotify.connected ? btn : "rounded-card bg-[#1DB954] px-5 py-2.5 text-sm font-bold text-black"}`}>
            {c.spotify.connected ? "Re-import my artists" : c.spotify.broken ? "Reconnect Spotify" : "Connect Spotify"}
          </ConnectSpotifyButton>
          {c.spotify.connected && (
            <button
              onClick={async () => {
                await fetch("/api/spotify/disconnect", { method: "POST" }).catch(() => {});
                window.location.href = "/api/spotify/login";
              }}
              className={`${btn} text-muted`}
            >
              Use a different account
            </button>
          )}
        </div>
      </section>

      {/* Google Calendar */}
      <section className={card} aria-labelledby="c-cal">
        <div className="flex items-center gap-4">
          <Logo ok={c.calendar.connected}><GoogleCalendarMark size={52} /></Logo>
          <div className="min-w-0 flex-1">
            <h2 id="c-cal" className="font-display text-3xl leading-none font-extrabold">Google Calendar</h2>
            <Status ok={c.calendar.connected} />
          </div>
        </div>
        <p className="text-sm text-muted">{c.calendar.connected ? "Add to calendar on any show puts it straight into your Google Calendar." : "Connect once and Add to calendar puts shows straight into Google Calendar. We can only add events, nothing else."}</p>
        <div className="flex flex-wrap gap-2">
          <a href="/api/gcal/connect?return=/connections" className={`inline-block ${c.calendar.connected ? btn : "rounded-card bg-accent px-5 py-2.5 text-sm font-bold text-accent-foreground"}`}>{c.calendar.connected ? "Reconnect" : "Connect Google Calendar"}</a>
          {c.calendar.connected && <button onClick={disconnectCalendar} disabled={busy === "cal"} className={`${btn} text-muted`}>Disconnect</button>}
        </div>
      </section>
    </div>
  );
}
