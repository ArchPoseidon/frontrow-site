"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { EventCard } from "@/components/event-card/EventCard";
import { ToastView, useEventActions } from "@/components/event-card/useEventActions";
import type { EventView } from "@/components/event-card/types";
import { SystemPulse } from "./SystemPulse";
import { CardRail } from "./CardRail";
import { CallMeSection } from "./CallMeSection";
import type { ArtistView } from "@/components/event-card/types";
import { CityChips, SearchBox, matchesQuery, cityLabel } from "@/components/shows/filters";

type Chip = "home" | "india" | "festivals" | "rumors";

const ago = (iso: string | null) => {
  if (!iso) return null;
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
};
const monthKey = (d: string | null) => (d ? d.slice(0, 7) : "tbd");
const monthLabel = (k: string) => (k === "tbd" ? "Date to be announced" : new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${k}-01T00:00:00Z`)));

// Shared by the dashboard (editable) and /demo (read-only).
export function RadarView({ events: initial, liveElsewhere = [], artists = [], homeCity, readOnly, sourceCount, lastScanAt, hasArtists = true }: { events: EventView[]; liveElsewhere?: EventView[]; artists?: ArtistView[]; homeCity: string; readOnly?: boolean; sourceCount: number; lastScanAt: string | null; hasArtists?: boolean }) {
  const { events, mark, dismiss, toggleCalendar, notify, toast, clearToast } = useEventActions(initial, { returnTo: "/radar" });
  const [chip, setChip] = useState<Chip>("india");
  const [limit, setLimit] = useState(12);
  const [query, setQuery] = useState("");
  const [city, setCity] = useState<string | null>(null);

  const act = events.filter((e) => e.stage === "live").slice(0, 8);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const mineIds = new Set(events.map((e) => e.id));
  const elsewhere = liveElsewhere.filter((e) => !mineIds.has(e.id) && !followed.has(e.artistId)).slice(0, 6);

  async function follow(artistId: string) {
    const r = await fetch("/api/artists/suggested", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ artistId }) }).catch(() => null);
    if (r?.ok) {
      setFollowed((f) => new Set(f).add(artistId));
      notify("Following. Their shows will show up on your radar and in your alerts.");
    } else notify("Couldn't follow that artist. Try again.", "error");
  }
  const filtered = useMemo(() => events.filter((e) => (chip === "home" ? e.inHomeCity : chip === "festivals" ? e.isFestival : chip === "rumors" ? e.status === "rumored" : true) && matchesQuery(e, query) && (!city || cityLabel(e) === city)), [events, chip, query, city]);
  const groups = useMemo(() => {
    const m = new Map<string, EventView[]>();
    for (const e of filtered.slice(0, limit)) m.set(monthKey(e.date), [...(m.get(monthKey(e.date)) ?? []), e]);
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered, limit]);

  const chips: { k: Chip; label: string; n: number }[] = [
    { k: "home", label: homeCity, n: events.filter((e) => e.inHomeCity).length },
    { k: "india", label: "All India", n: events.length },
    { k: "festivals", label: "Festivals", n: events.filter((e) => e.isFestival).length },
    { k: "rumors", label: "Rumours", n: events.filter((e) => e.status === "rumored").length },
  ];

  return (
    <div className="flex flex-col gap-10">
      {!hasArtists ? (
        <section className="rounded-card border border-dashed border-surface-border p-8 text-center">
          <h2 className="font-display text-3xl font-extrabold">No artists yet</h2>
          <p className="mt-1 text-sm text-muted">Add the artists you love and we&apos;ll watch for their India shows.</p>
          {!readOnly && <Link href="/onboarding?manage=1" className="mt-4 inline-block rounded-card bg-accent px-4 py-2 text-sm font-bold text-accent-foreground">Add artists</Link>}
        </section>
      ) : (
        <>
          <section aria-labelledby="act" className="space-y-3">
            <h2 id="act" className="font-display text-3xl font-extrabold"><span className="text-stage-live">●</span> On sale now</h2>
            {act.length > 0 && (
              <>
                {elsewhere.length > 0 && <p className="text-sm text-muted">From your artists</p>}
                <CardRail label="Your artists on sale now">
                  {act.map((e) => (
                    <EventCard key={e.id} ev={e} onDismiss={dismiss} onMark={mark} onCalendar={toggleCalendar} readOnly={readOnly} auto />
                  ))}
                </CardRail>
              </>
            )}
            {act.length === 0 && <p className="rounded-card border border-dashed border-surface-border p-4 text-sm text-muted">None of your artists has tickets on sale right now. We&apos;ll alert you the moment one does.{elsewhere.length > 0 ? " Meanwhile, here is what is live across India." : ""}</p>}
            {elsewhere.length > 0 && (
              <>
                {act.length > 0 && <p className="pt-2 text-sm text-muted">Also on sale across India</p>}
                <CardRail label="On sale across India">
                  {elsewhere.map((e) => (
                    <EventCard key={e.id} ev={e} onCalendar={toggleCalendar} onFollow={follow} readOnly={readOnly} auto />
                  ))}
                </CardRail>
              </>
            )}
          </section>

          <section aria-labelledby="timeline" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="timeline" className="font-display text-3xl font-extrabold">On the board</h2>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filter shows">
                {chips.map((c) => (
                  <button
                    key={c.k}
                    onClick={() => {
                      setChip(c.k);
                      setLimit(12);
                    }}
                    aria-pressed={chip === c.k}
                    className={`rounded-full border px-3 py-1 text-sm ${chip === c.k ? "border-accent bg-accent font-bold text-accent-foreground" : "border-surface-border"}`}
                  >
                    {c.label} <span className="opacity-70">{c.n}</span>
                  </button>
                ))}
              </div>
            </div>
            <SearchBox value={query} onChange={(v) => { setQuery(v); setLimit(12); }} placeholder="Search your artists, shows, cities or venues" />
            <CityChips events={events} value={city} onChange={(c) => { setCity(c); setLimit(12); }} />
            {groups.length === 0 ? (
              <div className="rounded-card border border-dashed border-surface-border p-8 text-center">
                <p className="font-display text-2xl font-extrabold">{events.length === 0 ? "All quiet." : query || city ? "No shows match that." : "Nothing in this view."}</p>
                <p className="mt-1 text-sm text-muted">
                  {events.length === 0 ? `We're watching ${sourceCount} sources${lastScanAt ? ` (last scan ${ago(lastScanAt)})` : ""} and will alert you the moment one of your artists announces a show.` : "Try another search, city or filter."}
                </p>
              </div>
            ) : (
              groups.map(([k, list]) => (
                <div key={k} className="space-y-3">
                  <h3 className="text-sm font-bold tracking-widest text-muted uppercase">{monthLabel(k)}</h3>
                  <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {list.map((e) => (
                      <li key={e.id}>
                        <EventCard ev={e} onDismiss={dismiss} onMark={mark} onCalendar={toggleCalendar} readOnly={readOnly} auto />
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
            {filtered.length > limit && (
              <button onClick={() => setLimit((l) => l + 12)} className="w-full rounded-card border border-surface-border py-2.5 text-sm font-bold">
                Show more ({filtered.length - limit} more)
              </button>
            )}
          </section>
        </>
      )}

      {!readOnly && hasArtists && <CallMeSection artists={artists} />}

      <SystemPulse demo={readOnly} />
      <ToastView toast={toast} onClose={clearToast} />
    </div>
  );
}
