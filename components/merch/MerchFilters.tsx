"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

const SIZES = ["S", "M", "L", "XL", "Free"];

// Artist, price and size filters. State lives in the URL so a filtered view can be shared and survives a refresh.
export function MerchFilters({ artists, bounds }: { artists: { id: string; name: string }[]; bounds: { lo: number; hi: number } }) {
  const router = useRouter();
  const sp = useSearchParams();
  const selArtists = (sp.get("artist") ?? "").split(",").filter(Boolean);
  const selSizes = (sp.get("size") ?? "").split(",").filter(Boolean);
  const [min, setMin] = useState(sp.get("min") ?? "");
  const [max, setMax] = useState(sp.get("max") ?? "");
  const [aq, setAq] = useState("");

  const push = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) (v ? p.set(k, v) : p.delete(k));
    router.replace(`/merch${p.toString() ? `?${p}` : ""}`, { scroll: false });
  };
  const toggle = (key: "artist" | "size", cur: string[], v: string) => push({ [key]: (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]).join(",") || null });
  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-sm ${on ? "border-accent bg-accent font-bold text-accent-foreground" : "border-surface-border"}`;
  const any = selArtists.length || selSizes.length || sp.get("min") || sp.get("max");

  return (
    <aside className="space-y-4 rounded-card border border-surface-border bg-surface/80 p-4 backdrop-blur" aria-label="Filters">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-extrabold">Filters</h2>
        {any && <button onClick={() => { setMin(""); setMax(""); router.replace("/merch"); }} className="text-xs text-muted underline underline-offset-2">Clear all</button>}
      </div>
      <section className="space-y-2">
        <h3 className="text-xs font-bold tracking-widest text-muted uppercase">Artist</h3>
        <input value={aq} onChange={(e) => setAq(e.target.value)} placeholder="Search artists" aria-label="Search artists" className="w-full rounded-card border border-surface-border bg-surface px-3 py-2 text-sm" />
        <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
          {artists.filter((a) => a.name.toLowerCase().includes(aq.toLowerCase())).map((a) => (
            <button key={a.id} onClick={() => toggle("artist", selArtists, a.id)} aria-pressed={selArtists.includes(a.id)} className={chip(selArtists.includes(a.id))}>{a.name}</button>
          ))}
          {artists.length === 0 && <p className="text-sm text-muted">No artists with merch yet.</p>}
        </div>
      </section>
      <section className="space-y-2">
        <h3 className="text-xs font-bold tracking-widest text-muted uppercase">Price (₹{bounds.lo.toLocaleString("en-IN")} to ₹{bounds.hi.toLocaleString("en-IN")})</h3>
        <div className="flex items-center gap-2">
          <input inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ""))} onBlur={() => push({ min: min || null })} placeholder="Min" aria-label="Minimum price" className="w-full rounded-card border border-surface-border bg-surface px-3 py-2 text-sm" />
          <span className="text-muted">to</span>
          <input inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ""))} onBlur={() => push({ max: max || null })} placeholder="Max" aria-label="Maximum price" className="w-full rounded-card border border-surface-border bg-surface px-3 py-2 text-sm" />
        </div>
      </section>
      <section className="space-y-2">
        <h3 className="text-xs font-bold tracking-widest text-muted uppercase">Size</h3>
        <div className="flex flex-wrap gap-2">
          {SIZES.map((s) => (
            <button key={s} onClick={() => toggle("size", selSizes, s)} aria-pressed={selSizes.includes(s)} className={chip(selSizes.includes(s))}>{s === "Free" ? "Free size" : s}</button>
          ))}
        </div>
      </section>
      <section className="space-y-2">
        <h3 className="text-xs font-bold tracking-widest text-muted uppercase">Sort</h3>
        <select value={sp.get("sort") ?? "new"} onChange={(e) => push({ sort: e.target.value === "new" ? null : e.target.value })} aria-label="Sort" className="w-full rounded-card border border-surface-border bg-surface px-3 py-2 text-sm">
          <option value="new">Newest</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
        </select>
      </section>
    </aside>
  );
}
