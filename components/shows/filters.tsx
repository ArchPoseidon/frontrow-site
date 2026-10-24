"use client";

import type { EventView } from "@/components/event-card/types";

// Shared by the radar and the calendar: a search box (artist, city, venue) and city tags with counts.
export const matchesQuery = (e: EventView, q: string) => {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return [e.artistName, e.city, e.venue, e.title, ...(e.lineup ?? [])].some((v) => v && v.toLowerCase().includes(s));
};

export const cityLabel = (e: EventView) => e.city ?? "City TBA";

export function citiesWithCounts(events: EventView[]) {
  const m = new Map<string, number>();
  for (const e of events) m.set(cityLabel(e), (m.get(cityLabel(e)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function SearchBox({ value, onChange, placeholder = "Search artist, city or venue" }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-card border border-surface-border bg-surface/80 px-4 py-2.5 pr-10 text-sm backdrop-blur"
      />
      {value && (
        <button onClick={() => onChange("")} aria-label="Clear search" className="absolute top-1/2 right-3 -translate-y-1/2 text-muted">✕</button>
      )}
    </div>
  );
}

export function CityChips({ events, value, onChange }: { events: EventView[]; value: string | null; onChange: (c: string | null) => void }) {
  const cities = citiesWithCounts(events);
  if (cities.length < 2) return null;
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filter by city">
      <button onClick={() => onChange(null)} aria-pressed={value === null} className={`shrink-0 rounded-full border px-3 py-1 text-sm ${value === null ? "border-accent bg-accent font-bold text-accent-foreground" : "border-surface-border"}`}>
        All cities <span className="opacity-70">{events.length}</span>
      </button>
      {cities.map(([c, n]) => (
        <button key={c} onClick={() => onChange(value === c ? null : c)} aria-pressed={value === c} className={`shrink-0 rounded-full border px-3 py-1 text-sm ${value === c ? "border-accent bg-accent font-bold text-accent-foreground" : "border-surface-border"}`}>
          {c} <span className="opacity-70">{n}</span>
        </button>
      ))}
    </div>
  );
}
