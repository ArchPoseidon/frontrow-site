"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Health = {
  checkedAt: string;
  sources: { name: string; enabled: boolean | null; lastRunAt: string | null; lastOkAt: string | null; lastError: string | null; consecutiveFailures: number | null; intervalMinutes: number | null }[];
  jobs: { job: string; startedAt: string | null; finishedAt: string | null }[];
  spotify: { connected: boolean; broken: boolean };
};

const ago = (iso: string | null) => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
};

function dot(s: Health["sources"][number]) {
  if (!s.enabled) return { c: "bg-surface-border", t: "Disabled" };
  if ((s.consecutiveFailures ?? 0) > 0 || s.lastError) return { c: "bg-urgency-red", t: s.lastError ?? "Failing" };
  if (!s.lastOkAt) return { c: "bg-urgency-info", t: "Not run yet" };
  const stale = s.intervalMinutes ? Date.now() - Date.parse(s.lastOkAt) > s.intervalMinutes * 60000 * 3 : false;
  return stale ? { c: "bg-urgency-amber", t: "Running late" } : { c: "bg-[var(--tier-open)]", t: "OK" };
}

// Dot per source, last scan time, Scan now with a live log console. Reads /api/health every 30 s.
export function SystemPulse({ demo }: { demo?: boolean }) {
  const [h, setH] = useState<Health | null>(null);
  const [err, setErr] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const box = useRef<HTMLUListElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/health", { cache: "no-store" });
      if (!r.ok) throw new Error();
      setH(await r.json());
      setErr(false);
    } catch {
      setErr(true);
    }
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [log]);

  async function scan() {
    setScanning(true);
    setNotice(null);
    setLog([]);
    try {
      const res = await fetch(`/api/scan-now${demo ? "?demo=1" : ""}`, { method: "POST" });
      if (res.status === 429 || res.status === 401 || !res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? "Couldn't start the scan");
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = /^event: (.*)$/m.exec(chunk)?.[1];
          const data = /^data: (.*)$/m.exec(chunk)?.[1];
          if (!ev || !data) continue;
          const d = JSON.parse(data);
          if (ev === "log") setLog((l) => [...l, d.text]);
          if (ev === "error") throw new Error(d.message);
          if (ev === "done" && d.newEvents) setNotice("New shows found. Refresh to see them on your radar.");
        }
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanning(false);
      load();
    }
  }

  const last = h?.jobs.map((j) => j.startedAt).filter(Boolean).sort().pop() ?? null;
  const red = h?.sources.filter((s) => (s.consecutiveFailures ?? 0) > 0 || s.lastError).length ?? 0;
  return (
    <section aria-labelledby="pulse" className="space-y-3 rounded-card border border-surface-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="pulse" className="text-lg font-semibold">System pulse</h2>
          <p className="text-sm text-muted">
            {err ? "Couldn't reach the server. Retrying…" : !h ? "Loading…" : `Last scan ${ago(last)} · ${h.sources.length} sources${red ? ` · ${red} failing` : ""}`}
          </p>
        </div>
        <button onClick={scan} disabled={scanning} className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50">
          {scanning ? "Scanning…" : "Scan now"}
        </button>
      </div>
      {h ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
          {h.sources.map((s) => {
            const d = dot(s);
            return (
              <li key={s.name} className="flex items-center gap-1.5" title={`${s.name}: ${d.t}`}>
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${d.c}`} aria-hidden />
                <span className="max-w-[16rem] truncate">{s.name.replace("Google News · ", "News: ")}</span>
                <span className="sr-only">{d.t}</span>
              </li>
            );
          })}
          {h.spotify.connected && (
            <li className="flex items-center gap-1.5">
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${h.spotify.broken ? "bg-urgency-red" : "bg-[var(--tier-open)]"}`} aria-hidden />
              Spotify{h.spotify.broken ? " (broken)" : ""}
            </li>
          )}
        </ul>
      ) : (
        <div className="h-5 w-2/3 animate-pulse rounded bg-surface-border" />
      )}
      {(log.length > 0 || scanning) && (
        <ul ref={box} className="max-h-40 space-y-1 overflow-y-auto rounded-lg bg-background p-3 font-mono text-xs text-muted" aria-live="polite">
          {log.length === 0 && <li>Starting…</li>}
          {log.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
      {notice && <p role="status" className="text-sm">{notice}</p>}
    </section>
  );
}
