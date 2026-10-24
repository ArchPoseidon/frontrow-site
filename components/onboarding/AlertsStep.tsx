"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";

type Link = { linked: boolean; bot: string; url?: string | null; configured?: boolean };

export function AlertsStep({ onBack }: { onBack: () => void }) {
  const [link, setLink] = useState<Link | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [finishing, setFinishing] = useState(false);

  // Last step: mark onboarding done, start the first scan in the background and go straight to the radar.
  async function finish() {
    setFinishing(true);
    await fetch("/api/onboarding/finish", { method: "POST" }).catch(() => {});
    window.location.href = "/radar?welcome=1";
  }
  const [testResult, setTestResult] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadLink = useCallback(async () => {
    try {
      const r = await fetch("/api/telegram/link");
      if (!r.ok) throw new Error();
      setLink(await r.json());
    } catch {
      setError("Couldn't check Telegram. Try again.");
    }
  }, []);

  useEffect(() => {
    loadLink();
  }, [loadLink]);

  // Poll until the link is confirmed.
  useEffect(() => {
    if (!link || link.linked) return;
    const t = setInterval(loadLink, 2500);
    return () => clearInterval(t);
  }, [link, loadLink]);

  useEffect(() => {
    if (link?.url) QRCode.toDataURL(link.url, { margin: 1, width: 180 }).then(setQr).catch(() => setQr(null));
  }, [link?.url]);

  const sendTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch("/api/alerts/test", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? (j.failed?.length ? `Couldn't send via ${j.failed.join(", ")}` : "Couldn't send"));
      setTestResult({ tone: "ok", text: `Sent to ${j.sent.join(" and ")}: ${j.sample ? "a sample card (none of your artists has a show yet)" : `${j.artist}${j.city ? ` in ${j.city}` : ""} (a real upcoming show)`}.` });
    } catch (e) {
      setTestResult({ tone: "error", text: e instanceof Error ? e.message : "Couldn't send the test" });
    } finally {
      setTesting(false);
    }
  };

  const canTest = !!link?.linked;

  return (
    <div className="flex flex-col gap-6">
      {error && <p role="alert" className="rounded-card border border-urgency-red/60 px-4 py-3 text-sm">{error}</p>}

      <section className="space-y-3 rounded-card border border-surface-border bg-surface p-4">
        <h2 className="font-semibold">Telegram <span className="ml-1 text-xs font-normal text-muted">fastest, recommended</span></h2>
        {!link ? (
          <div className="h-24 animate-pulse rounded-card bg-surface-border" />
        ) : link.linked ? (
          <p className="font-medium text-emerald-500"><span aria-hidden>✓ </span>Telegram connected</p>
        ) : !link.configured ? (
          <p className="text-sm text-muted">Telegram isn&apos;t set up on this server yet. You can still get alerts by email.</p>
        ) : (
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="QR code to link Telegram" width={140} height={140} className="rounded-card bg-white p-1" />
            )}
            <div className="space-y-2 text-sm">
              <a href={link.url ?? "#"} target="_blank" rel="noopener noreferrer" className="inline-block rounded-card bg-accent px-4 py-2.5 font-medium text-accent-foreground">Connect Telegram</a>
              <p className="text-muted">On your phone, scan the QR code. On this device, tap the button. Then press <b>Start</b> in Telegram. This page updates by itself.</p>
              <p className="flex items-center gap-2 text-xs text-muted"><span className="inline-block h-2 w-2 animate-pulse rounded-full bg-urgency-amber" />Waiting for you to press Start…</p>
            </div>
          </div>
        )}
      </section>


      <section className="space-y-2">
        <button onClick={sendTest} disabled={testing || !canTest} className="rounded-card border border-surface-border px-4 py-2.5 font-medium disabled:opacity-50">
          {testing ? "Sending…" : "Send test alert"}
        </button>
        {!canTest && <p className="text-xs text-muted">Connect Telegram first to try a test alert.</p>}
        {testResult && (
          <p role="status" className={`rounded-card border px-4 py-3 text-sm ${testResult.tone === "ok" ? "border-emerald-500/60" : "border-urgency-red/60"}`}>{testResult.text}</p>
        )}
      </section>

      <footer className="flex items-center justify-between border-t border-surface-border pt-4">
        <button onClick={onBack} className="text-sm text-muted underline underline-offset-2">Back</button>
        <div className="flex flex-col items-end gap-1">
          <button onClick={finish} disabled={finishing} className="rounded-card bg-accent px-5 py-2.5 font-medium text-accent-foreground disabled:opacity-50">
            {finishing ? "Opening your radar…" : "Go to my radar"}
          </button>
          {!link?.linked && link?.configured && <p className="text-xs text-muted">You can connect Telegram later under Profile, then Connections.</p>}
        </div>
      </footer>
    </div>
  );
}
