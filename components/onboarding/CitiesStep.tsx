"use client";

import { useEffect, useState } from "react";

type Settings = { homeCity: string; watchCities: string[]; p1Cities: string[]; p2Cities: string[]; watchAllIndia: boolean; cities: string[] };

// City priorities: P1 = alert me instantly, P2 = also tell me, plus an "All India" tick for everything else (digest).
export function CitiesStep({ onBack, onNext, embedded }: { onBack?: () => void; onNext?: () => void; embedded?: boolean }) {
  const [s, setS] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: Settings) => {
        // First time here: start with the old home city as P1 so nobody lands on an empty page.
        setS(j.p1Cities.length || j.p2Cities.length ? j : { ...j, p1Cities: j.homeCity ? [j.homeCity] : [] });
      })
      .catch(() => setError("Couldn't load your settings"));
  }, []);

  const save = async (patch: Partial<Pick<Settings, "p1Cities" | "p2Cities" | "watchAllIndia">>) => {
    if (!s) return;
    const prev = s;
    const next = { ...s, ...patch };
    setS(next);
    try {
      const r = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ p1Cities: next.p1Cities, p2Cities: next.p2Cities, watchAllIndia: next.watchAllIndia }) });
      if (!r.ok) throw new Error();
      setError(null);
    } catch {
      setS(prev);
      setError("Couldn't save that. Try again.");
    }
  };

  if (!s) return error ? <p role="alert" className="text-sm">{error}</p> : <div className="h-40 animate-pulse rounded-card bg-surface-border" />;

  // Base city = instant alerts (P1). Alternate city = also tell me (P2). Any extra cities set earlier are kept.
  const base = s.p1Cities[0] ?? "";
  const alt = s.p2Cities[0] ?? "";
  const setBase = (c: string) => {
    const rest = s.p1Cities.slice(1).filter((x) => x !== c);
    save({ p1Cities: c ? [c, ...rest] : rest, p2Cities: s.p2Cities.filter((x) => x !== c) });
  };
  const setAlt = (c: string) => {
    const rest = s.p2Cities.slice(1).filter((x) => x !== c);
    save({ p2Cities: c ? [c, ...rest] : rest });
  };
  const field = "w-full appearance-none rounded-card border border-surface-border bg-surface bg-[length:1rem] bg-[position:right_0.9rem_center] bg-no-repeat px-3 py-3 pr-10 text-base text-foreground outline-none focus:border-magenta";
  const arrow = { backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%23a093ad'%3E%3Cpath d='M5 7l5 6 5-6z'/%3E%3C/svg%3E\")" };

  return (
    <div className="flex flex-col gap-6">
      {error && <p role="alert" className="rounded-card border border-urgency-red/60 px-4 py-3 text-sm">{error}</p>}
      <section className="space-y-4">
        <label className="block space-y-1.5">
          <span className="font-semibold">Base city</span>
          <span className="block text-xs text-muted">Instant alerts the moment tickets open here.</span>
          <select value={base} onChange={(e) => setBase(e.target.value)} className={field} style={arrow}>
            <option value="">Choose your city</option>
            {s.cities.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="font-semibold">Alternate city <span className="font-normal text-muted">(optional)</span></span>
          <span className="block text-xs text-muted">A second city you would travel to. We tell you too, a little less loudly.</span>
          <select value={alt} onChange={(e) => setAlt(e.target.value)} className={field} style={arrow}>
            <option value="">None</option>
            {s.cities.filter((c) => c !== base).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </section>
      <label className="flex items-center gap-3 rounded-card border border-surface-border bg-surface px-4 py-3">
        <input type="checkbox" checked={s.watchAllIndia} onChange={() => save({ watchAllIndia: !s.watchAllIndia })} className="h-4 w-4 accent-[var(--accent)]" />
        <span>
          <span className="font-medium">All India</span>
          <span className="block text-xs text-muted">Also include every other city in your daily digest (quiet, no instant pings)</span>
        </span>
      </label>
      {!embedded && <footer className="flex items-center justify-between border-t border-surface-border pt-4">
        <button onClick={onBack} className="text-sm text-muted underline underline-offset-2">Back</button>
        <button onClick={onNext} disabled={!s.p1Cities.length} className="rounded-card bg-accent px-5 py-2.5 font-medium text-accent-foreground disabled:opacity-50">
          Next: alerts
        </button>
      </footer>}
    </div>
  );
}
