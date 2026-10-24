"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArtistPhoto } from "@/components/artist/ArtistPhoto";

type Suggestion = { artistId: string; name: string; imageUrl: string | null; next: { city: string | null; date: string | null; status: string | null } };

const fmt = (d: string | null) => (d ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`)) : "date TBA");

// "Touring India now": real, already-found upcoming shows, as a side-scrolling carousel.
// The whole card is one big tap target; added cards stay in place with a tick so the row never jumps.
export function TouringNow({ onAdded }: { onAdded: () => void }) {
  const [items, setItems] = useState<Suggestion[] | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const rail = useRef<HTMLUListElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/artists/suggested");
      if (!r.ok) throw new Error();
      setItems((await r.json()).suggestions);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function add(id: string) {
    if (added.has(id) || busy) return;
    setBusy(id);
    try {
      const r = await fetch("/api/artists/suggested", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ artistId: id }) });
      if (!r.ok) throw new Error();
      setAdded((a) => new Set(a).add(id));
      onAdded();
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  }

  async function addAll() {
    for (const s of items ?? []) if (!added.has(s.artistId)) await add(s.artistId);
  }

  const scroll = (dir: 1 | -1) => rail.current?.scrollBy({ left: dir * 340, behavior: "smooth" });

  if (items === null && !error) return <div className="h-24 animate-pulse rounded-card bg-surface-border" aria-label="Loading suggestions" />;
  if (error && !items) return <p className="text-sm text-muted">Couldn&apos;t load shows touring right now. <button onClick={load} className="underline underline-offset-2">Try again</button></p>;
  if (!items?.length) return null;
  const left = items.filter((s) => !added.has(s.artistId)).length;
  return (
    <section className="space-y-3" aria-label="Touring India now">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl font-extrabold">Touring India now</h2>
          <p className="text-sm text-muted">Swipe sideways, tap an artist to add them. Real upcoming shows we&apos;ve already found.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {left > 1 && <button onClick={addAll} className="rounded-full border border-surface-border px-3 py-1.5 text-xs font-bold">Add all {left}</button>}
          <button onClick={() => scroll(-1)} aria-label="Scroll left" className="hidden h-8 w-8 rounded-full border border-surface-border sm:block">‹</button>
          <button onClick={() => scroll(1)} aria-label="Scroll right" className="hidden h-8 w-8 rounded-full border border-surface-border sm:block">›</button>
        </div>
      </div>
      <div className="relative">
        <ul ref={rail} className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-4 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((s) => {
            const on = added.has(s.artistId);
            return (
              <li key={s.artistId} className="w-40 shrink-0 snap-start sm:w-44">
                <button onClick={() => add(s.artistId)} disabled={busy === s.artistId} aria-pressed={on} aria-label={`${on ? "Added" : "Add"} ${s.name}`} className={`relative block w-full overflow-hidden rounded-card border-2 text-left transition ${on ? "border-accent" : "border-surface-border"}`}>
                  <div className="relative aspect-[4/5]">
                    <ArtistPhoto name={s.name} imageUrl={s.imageUrl} rounded={false} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
                    {on && <span className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-sm font-black text-accent-foreground">✓</span>}
                    <div className="absolute inset-x-0 bottom-0 p-2.5">
                      <p className="font-display truncate text-2xl leading-none font-extrabold">{s.name}</p>
                      <p className="truncate text-[11px] text-white/75">{s.next.city ?? "India"} · {fmt(s.next.date)}</p>
                    </div>
                  </div>
                  <span className={`block py-2 text-center text-sm font-bold ${on ? "bg-accent/20 text-accent" : "bg-accent text-accent-foreground"}`}>{busy === s.artistId ? "Adding…" : on ? "Added" : "+ Add"}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-black/40 to-transparent" aria-hidden />
      </div>
    </section>
  );
}
