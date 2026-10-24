"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { EventCard } from "@/components/event-card/EventCard";
import { ToastView, useEventActions } from "@/components/event-card/useEventActions";
import type { EventView } from "@/components/event-card/types";
import { CityChips, SearchBox, cityLabel, matchesQuery } from "./filters";

const DOT: Record<string, string> = { live: "bg-stage-live", soon: "bg-stage-soon", announced: "bg-stage-announced", soldout: "bg-stage-soldout", rumor: "bg-urgency-info" };
const pad = (n: number) => String(n).padStart(2, "0");

type Filter = "all" | "fav" | "added" | "going" | "saved";
const FILTERS: { k: Filter; label: string }[] = [
  { k: "all", label: "All shows" },
  { k: "fav", label: "My favourites" },
  { k: "added", label: "In calendar" },
  { k: "going", label: "Going" },
  { k: "saved", label: "Saved" },
];
const EMPTY: Record<Filter, string> = {
  all: "No dated shows yet.",
  fav: "No shows yet for your must-see artists. Mark artists as must-see in Your artists.",
  added: "Nothing in your calendar yet. Tap Add to calendar on a show.",
  going: "No Going shows yet. Tap Going on a show to put it here.",
  saved: "No saved shows yet. Tap the bookmark on a show to keep it here.",
};

// Month grid. Each show is a dot in its stage colour. Green ring = going, magenta ring = saved, tick = in your calendar.
export function CalendarView({ events: initial, today }: { events: EventView[]; today: string }) {
  const { events, mark, toggleCalendar, toast, clearToast } = useEventActions(initial, { returnTo: "/calendar" });
  const [ty, tm] = today.split("-").map(Number);
  const [ym, setYm] = useState<[number, number]>([ty, tm]);
  const [sel, setSel] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [city, setCity] = useState<string | null>(null);

  // Coming back from "Connect Google Calendar": finish adding the show that started it.
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const id = new URLSearchParams(window.location.search).get("add");
    if (id) {
      toggleCalendar(id, true);
      window.history.replaceState(null, "", "/calendar");
    }
  }, [toggleCalendar]);

  const shown = useMemo(
    () => events.filter((e) => e.date && matchesQuery(e, query) && (!city || cityLabel(e) === city) && (filter === "all" || (filter === "fav" && e.priority === "must_see") || (filter === "added" && e.inCalendar) || (filter === "going" && e.mine === "going") || (filter === "saved" && e.mine === "saved"))),
    [events, filter, query, city],
  );
  const byDay = useMemo(() => {
    const m = new Map<string, EventView[]>();
    for (const e of shown) m.set(e.date!, [...(m.get(e.date!) ?? []), e]);
    return m;
  }, [shown]);

  // Jump to the first month that has something for this filter.
  useEffect(() => {
    const first = shown.map((e) => e.date!).sort()[0];
    if (!first) return;
    const key = `${ym[0]}-${pad(ym[1])}`;
    if (!shown.some((e) => e.date!.startsWith(key))) setYm([Number(first.slice(0, 4)), Number(first.slice(5, 7))]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const counts: Record<Filter, number> = {
    all: events.filter((e) => e.date).length,
    fav: events.filter((e) => e.date && e.priority === "must_see").length,
    added: events.filter((e) => e.date && e.inCalendar).length,
    going: events.filter((e) => e.date && e.mine === "going").length,
    saved: events.filter((e) => e.date && e.mine === "saved").length,
  };

  const [y, mo] = ym;
  const firstDow = (new Date(Date.UTC(y, mo - 1, 1)).getUTCDay() + 6) % 7; // Monday first
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const label = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, mo - 1, 1)));
  const go = (d: number) => {
    const t = new Date(Date.UTC(y, mo - 1 + d, 1));
    setYm([t.getUTCFullYear(), t.getUTCMonth() + 1]);
    setSel(null);
  };
  const monthPrefix = `${y}-${pad(mo)}`;
  const inMonth = shown.filter((e) => e.date!.startsWith(monthPrefix)).length;
  const dayList = sel ? byDay.get(sel) ?? [] : [];

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-1 rounded-card border border-surface-border bg-surface/80 p-1.5 backdrop-blur sm:grid-cols-5" role="group" aria-label="Which shows to show">
        {FILTERS.map((f) => (
          <button key={f.k} onClick={() => { setFilter(f.k); setSel(null); }} aria-pressed={filter === f.k} className={`font-display rounded-md px-2 py-3.5 text-xl leading-none font-extrabold sm:text-2xl ${filter === f.k ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground"}`}>
            {f.label} <span className="ml-1 text-base font-bold opacity-70">{counts[f.k]}</span>
          </button>
        ))}
      </div>

      <SearchBox value={query} onChange={(v) => { setQuery(v); setSel(null); }} placeholder="Search artist, city or venue" />
      <CityChips events={events.filter((e) => e.date)} value={city} onChange={(c) => { setCity(c); setSel(null); }} />

      <div className="flex items-center gap-2">
        <button onClick={() => go(-1)} aria-label="Previous month" className="rounded-card border border-surface-border px-3 py-1.5">‹</button>
        <h2 className="font-display min-w-44 text-center text-3xl font-extrabold">{label}</h2>
        <button onClick={() => go(1)} aria-label="Next month" className="rounded-card border border-surface-border px-3 py-1.5">›</button>
        <span className="ml-auto text-sm text-muted">{inMonth} show{inMonth === 1 ? "" : "s"}</span>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center" role="grid" aria-label={label}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="py-1 text-[11px] tracking-wider text-muted uppercase">{d}</div>
        ))}
        {Array.from({ length: firstDow }).map((_, i) => <div key={`p${i}`} />)}
        {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
          const key = `${monthPrefix}-${pad(d)}`;
          const list = byDay.get(key) ?? [];
          const going = list.some((e) => e.mine === "going");
          const saved = list.some((e) => e.mine === "saved");
          const added = list.some((e) => e.inCalendar);
          const isSel = sel === key;
          return (
            <button
              key={key}
              onClick={() => setSel(isSel ? null : key)}
              disabled={!list.length}
              aria-pressed={isSel}
              aria-label={`${d} ${label}${list.length ? `, ${list.length} show${list.length === 1 ? "" : "s"}${going ? ", going" : ""}${saved ? ", saved" : ""}${added ? ", in your calendar" : ""}` : ""}`}
              className={`relative flex aspect-square flex-col items-center justify-center gap-1 rounded-md border text-sm ${isSel ? "border-accent bg-accent text-accent-foreground" : list.length ? "border-surface-border bg-surface" : "border-transparent text-muted"} ${key === today ? "underline decoration-2 underline-offset-4" : ""} ${going && !isSel ? "ring-2 ring-[var(--tier-open)]" : saved && !isSel ? "ring-2 ring-[var(--magenta)]" : ""}`}
            >
              <span className={list.length ? "font-bold" : ""}>{d}</span>
              {list.length > 0 && (
                <span className="flex gap-0.5">
                  {list.slice(0, 3).map((e) => <i key={e.id} className={`h-1.5 w-1.5 rounded-full ${DOT[e.stage]}`} />)}
                </span>
              )}
              {added && <span className="absolute top-0.5 right-1 text-[10px] leading-none text-[var(--tier-open)]" aria-hidden>✓</span>}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-muted">
        <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-stage-live" />Tickets live</span>
        <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-stage-soon" />Go-live date announced</span>
        <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-stage-announced" />Announced</span>
        <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full ring-2 ring-[var(--tier-open)]" />Going</span>
        <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full ring-2 ring-[var(--magenta)]" />Saved</span>
        <span><span className="mr-1.5 text-[var(--tier-open)]">✓</span>In your calendar</span>
      </div>

      {sel ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {dayList.map((e) => <li key={e.id}><EventCard ev={e} onMark={mark} onCalendar={toggleCalendar} auto /></li>)}
        </ul>
      ) : shown.length === 0 ? (
        <p className="rounded-card border border-dashed border-surface-border p-6 text-center text-sm text-muted">
          {EMPTY[filter]} <Link href="/radar" className="underline">Browse the radar</Link>
        </p>
      ) : (
        <p className="text-sm text-muted">Pick a day with a dot to see its tickets.</p>
      )}
      <ToastView toast={toast} onClose={clearToast} />
    </div>
  );
}
