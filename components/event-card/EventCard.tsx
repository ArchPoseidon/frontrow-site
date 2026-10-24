"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArtistPhoto } from "@/components/artist/ArtistPhoto";
import Image from "next/image";
import { cardConcert } from "@/lib/concert";
import { formatShowTime } from "@/lib/util/ist";
import { STAGE_LABEL, type Stage } from "@/lib/stage";
import { Countdown } from "./Countdown";
import { TierLadder } from "./TierLadder";
import type { EventView } from "./types";

const BAND: Record<Stage, string> = { live: "bg-stage-live text-white", soon: "bg-stage-soon text-white", announced: "bg-stage-announced text-black", soldout: "bg-stage-soldout text-white", rumor: "bg-urgency-info text-white" };
const BORDER: Record<Stage, string> = { live: "border-stage-live", soon: "border-stage-soon", announced: "border-stage-announced", soldout: "border-stage-soldout", rumor: "border-muted" };

function dateParts(d: string | null) {
  if (!d) return { dow: "TBA", day: "?", mon: "" };
  const dt = new Date(`${d}T00:00:00Z`);
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", ...o }).format(dt);
  return { dow: f({ weekday: "short" }), day: f({ day: "numeric" }), mon: f({ month: "short" }) };
}

export function confidenceLine(ev: Pick<EventView, "confidence" | "sources">) {
  const names = [...new Set(ev.sources.map((s) => s.platform ?? new URL(s.url).hostname.replace(/^www\./, "")))];
  const confirmed = (ev.confidence ?? 0) >= 0.9 || names.length >= 2;
  return confirmed ? `Confirmed · ${names.slice(0, 3).join(", ")}` : `Unconfirmed · ${names.length || 1} source${names.length === 1 ? "" : "s"}`;
}

type Mark = "going" | "saved" | null;
const FACES = ["show", "photo", "concert", "details"] as const;

// A show as a ticket. The window flips between four faces: the show (name, date, where), the artist's photo,
// a concert photo as it is (no text), and the tiers and sources. Tap the card or a dot to flip; `auto` flips on its own.
export function EventCard({
  ev,
  size = "compact",
  onDismiss,
  onMark,
  onCalendar,
  onFollow,
  readOnly,
  auto,
}: {
  ev: EventView;
  size?: "compact" | "full";
  onDismiss?: (id: string) => void;
  onMark?: (id: string, mark: Mark) => void;
  onCalendar?: (id: string) => void;
  onFollow?: (artistId: string) => void;
  readOnly?: boolean;
  auto?: boolean;
}) {
  const [f, setF] = useState(0);
  const [paused, setPaused] = useState(false); // the viewer took over by tapping
  const [hover, setHover] = useState(false);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLElement>(null);
  // Cards flip on their own while on screen, each on its own beat so a grid never flips in lockstep.
  useEffect(() => {
    if (!auto || !ref.current) return;
    const io = new IntersectionObserver(([en]) => setVisible(en.isIntersecting), { rootMargin: "120px" });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [auto]);
  useEffect(() => {
    if (!auto || paused || hover || !visible) return;
    let h = 0;
    for (const ch of ev.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      setF((x) => (x + 1) % FACES.length);
      timer = setInterval(() => setF((x) => (x + 1) % FACES.length), 3600);
    }, 600 + (h % 3000));
    return () => {
      clearTimeout(start);
      if (timer) clearInterval(timer);
    };
  }, [auto, paused, hover, visible, ev.id]);

  const p = dateParts(ev.date);
  const rumor = ev.status === "rumored";
  const full = size === "full";
  const h = full ? 260 : 158;
  const others = ev.lineup.filter((n) => n.toLowerCase() !== ev.artistName.toLowerCase());
  const pos = (i: number) => (i === f ? "on" : i < f ? "prev" : "next");
  const img = ev.concertImage ?? cardConcert(ev.id);
  const next = () => {
    setPaused(true);
    setF((x) => (x + 1) % FACES.length);
  };

  return (
    <article ref={ref} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} className={`flex flex-col overflow-hidden rounded-card border-2 bg-surface ${BORDER[ev.stage]} ${rumor ? "border-dashed" : ""}`} aria-label={`${ev.artistName}${ev.city ? `, ${ev.city}` : ""}`}>
      <div className={`flex flex-wrap items-center justify-between gap-x-3 px-3 py-1.5 text-xs font-bold tracking-wide uppercase ${BAND[ev.stage]}`}>
        <span>{ev.isSample ? "Sample · " : ""}{STAGE_LABEL[ev.stage]}</span>
        {!(ev.stage === "announced" && /^Announced/.test(ev.reason)) && <span className="font-semibold normal-case">{ev.reason}</span>}
      </div>

      <div className="flip" style={{ height: h }}>
        {/* Face 1: the show, plain */}
        <div className="flip-face flex flex-col justify-between bg-gradient-to-br from-[#241833] via-surface to-[#150d1d] p-3" data-pos={pos(0)} aria-hidden={f !== 0}>
          <div className="flex items-start gap-3">
            <div className="flex w-14 shrink-0 flex-col items-center rounded-md border border-white/20 bg-black/30 py-1.5 leading-none">
              <span className="text-[10px] tracking-wider text-white/70 uppercase">{p.dow}</span>
              <span className="font-display my-0.5 text-3xl font-extrabold">{p.day}</span>
              <span className="text-[10px] font-bold uppercase">{p.mon}</span>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-display truncate text-3xl leading-none font-extrabold">{ev.artistName}</h3>
              <p className="mt-1 truncate text-sm text-white/80">{[ev.venue, formatShowTime(ev.time)].filter(Boolean).join(" · ") || "Venue to be announced"}</p>
            </div>
            {/* The artist's picture (the Spotify photo we pulled), always visible on the front */}
            <div className="h-[76px] w-[76px] shrink-0 overflow-hidden rounded-md border border-white/20">
              <ArtistPhoto name={ev.artistName} imageUrl={ev.artistImage} rounded={false} />
            </div>
          </div>
          <div className="space-y-2">
            {ev.countdown && <Countdown to={ev.countdown.to} label={ev.countdown.label} />}
            <p className="flex flex-wrap items-center gap-1.5 text-xs">
              {ev.city && <span className={`rounded-full border px-2 py-0.5 ${ev.inHomeCity ? "border-white bg-white text-black" : "border-white/40 text-white/80"}`}>{ev.inHomeCity ? `Your city · ${ev.city}` : `${ev.city} · worth the trip`}</span>}
              {ev.isFestival && <span className="rounded-full border border-white/40 px-2 py-0.5 text-white/80">Festival</span>}
              {ev.isSample && <span className="rounded-full bg-urgency-info px-2 py-0.5 text-white">Sample</span>}
            </p>
          </div>
        </div>

        {/* Face 2: the artist */}
        <div className="flip-face" data-pos={pos(1)} aria-hidden={f !== 1}>
          <div className="relative h-full w-full">
            <ArtistPhoto name={ev.artistName} imageUrl={ev.artistImage} rounded={false} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/30" />
            <div className="absolute inset-x-0 bottom-0 p-3">
              <p className="font-display text-4xl leading-none font-extrabold">{ev.artistName}</p>
              <p className="mt-1 text-sm text-white/80">{ev.city ? `Live in ${ev.city}` : "Live in India"}</p>
            </div>
          </div>
        </div>

        {/* Face 3: a concert photo, as it is */}
        <div className="flip-face" data-pos={pos(2)} aria-hidden={f !== 2}>
          <div className="relative h-full w-full overflow-hidden">
            <Image src={img} alt="" fill sizes="(max-width: 640px) 90vw, 420px" quality={75} className="object-cover" style={{ filter: "saturate(0.85) brightness(0.92)" }} />
            <div className="absolute inset-0 bg-black/15" />
          </div>
        </div>

        {/* Face 4: tiers and sources, on paper */}
        <div className="flip-face ticket-paper overflow-y-auto p-3" data-pos={pos(3)} aria-hidden={f !== 3}>
          <TierLadder tiers={ev.tiers} paper />
          {ev.tiers.length === 0 && <p className="text-sm text-black/60">No ticket tiers listed yet.</p>}
          {ev.isFestival && others.length > 0 && <p className="mt-2 text-xs text-black/70"><b>Also on the lineup:</b> {others.slice(0, full ? 40 : 8).join(", ")}</p>}
          <div className="perf my-2" />
          <p className="text-xs font-semibold text-black/70">{confidenceLine(ev)}</p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {ev.sources.slice(0, full ? 12 : 4).map((s) => (
              <li key={s.url} className="truncate">
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{s.platform ?? new URL(s.url).hostname.replace(/^www\./, "")}</a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-3 pt-2">
        <button onClick={next} className="flex items-center gap-1.5 text-xs text-muted" aria-label="Flip the card">
          {FACES.map((n, i) => (
            <span key={n} className={`h-1.5 rounded-full transition-all ${i === f ? "w-5 bg-foreground" : "w-1.5 bg-surface-border"}`} />
          ))}
          <span className="ml-1">Flip</span>
        </button>
        {!full && <Link href={`/event/${ev.id}`} className="text-xs text-muted underline underline-offset-2">Details</Link>}
      </div>

      <div className="flex flex-wrap items-center gap-2 p-3 pt-2">
        {!rumor && ev.ticketUrl && (
          <a href={ev.ticketUrl} target="_blank" rel="noopener noreferrer" className="rounded-card bg-accent px-4 py-2 text-sm font-bold text-accent-foreground">
            Get tickets
          </a>
        )}
        {!rumor && !ev.ticketUrl && <span className="text-xs text-muted">Ticket page not confirmed yet</span>}
        {ev.notFollowed && !readOnly && onFollow && (
          <button onClick={() => onFollow(ev.artistId)} className="rounded-card border border-[var(--magenta)] px-3 py-2 text-sm font-bold text-[var(--magenta)]">+ Follow {ev.artistName}</button>
        )}
        {!readOnly && onMark && !ev.notFollowed && (
          <>
            <button onClick={() => onMark(ev.id, ev.mine === "going" ? null : "going")} aria-pressed={ev.mine === "going"} className={`rounded-card border px-3 py-2 text-sm ${ev.mine === "going" ? "border-[var(--tier-open)] bg-[var(--tier-open)] font-bold text-black" : "border-surface-border"}`}>
              {ev.mine === "going" ? "Going ✓" : "Going"}
            </button>
            <button onClick={() => onMark(ev.id, ev.mine === "saved" ? null : "saved")} aria-pressed={ev.mine === "saved"} aria-label={ev.mine === "saved" ? "Remove bookmark" : "Bookmark this show"} title={ev.mine === "saved" ? "Saved. Tap to remove" : "Bookmark for later"} className={`flex items-center gap-1.5 rounded-card border px-3 py-2 text-sm ${ev.mine === "saved" ? "border-[var(--magenta)] font-bold text-[var(--magenta)]" : "border-surface-border"}`}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill={ev.mine === "saved" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden><path d="M6 4h12v17l-6-4-6 4z" /></svg>
              {ev.mine === "saved" ? "Saved" : "Save"}
            </button>
          </>
        )}
        {ev.date && (!readOnly && onCalendar ? (
          <button onClick={() => onCalendar(ev.id)} aria-pressed={!!ev.inCalendar} title={ev.inCalendar ? "In your calendar. Tap to remove" : "Add to your calendar"} className={`flex items-center gap-1.5 rounded-card border px-3 py-2 text-sm ${ev.inCalendar ? "border-[var(--tier-open)] font-bold text-[var(--tier-open)]" : "border-surface-border"}`}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" />{ev.inCalendar && <path d="M9 15l2 2 4-4" />}</svg>
            {ev.inCalendar ? "In calendar" : "Add to calendar"}
          </button>
        ) : (
          <a href={`/api/ics/${ev.id}`} aria-label="Download calendar file" title="Download calendar file" className="rounded-card border border-surface-border px-3 py-2 text-sm">📅</a>
        ))}
        {!readOnly && onDismiss && (
          <button onClick={() => onDismiss(ev.id)} aria-label="Not for me" title="Not for me" className="rounded-card border border-surface-border px-3 py-2 text-sm text-muted">
            ✕
          </button>
        )}
      </div>
    </article>
  );
}
