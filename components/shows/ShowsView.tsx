"use client";

import Link from "next/link";
import { useState } from "react";
import { EventCard } from "@/components/event-card/EventCard";
import { ToastView, useEventActions } from "@/components/event-card/useEventActions";
import type { EventView } from "@/components/event-card/types";

// Going (bought or planning) and Saved (keep an eye on), each a stack of flip tickets.
export function ShowsView({ events: initial }: { events: EventView[] }) {
  const { events, mark, toggleCalendar, toast, clearToast } = useEventActions(initial, { returnTo: "/shows" });
  const [tab, setTab] = useState<"going" | "saved">("going");
  const going = events.filter((e) => e.mine === "going");
  const saved = events.filter((e) => e.mine === "saved");
  const list = tab === "going" ? going : saved;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-1 rounded-card border border-surface-border bg-surface/80 p-1.5 backdrop-blur" role="tablist" aria-label="My shows">
        {([["going", "Going", going.length], ["saved", "Saved", saved.length]] as const).map(([k, label, n]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`font-display flex-1 rounded-md px-2 py-3.5 text-2xl leading-none font-extrabold sm:text-3xl ${tab === k ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground"}`}>
            {label} <span className="ml-1 text-base font-bold opacity-70">{n}</span>
          </button>
        ))}
        <Link href="/calendar" className="font-display flex-1 rounded-md px-2 py-3.5 text-center text-2xl leading-none font-extrabold text-muted hover:text-foreground sm:text-3xl">Calendar</Link>
      </div>
      {list.length === 0 ? (
        <div className="rounded-card border border-dashed border-surface-border p-10 text-center">
          <p className="font-display text-3xl font-extrabold">{tab === "going" ? "Nothing booked yet" : "Nothing saved yet"}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            {tab === "going" ? "Tap Going on a show when you've bought tickets or plan to be there. It lands here and on your calendar." : "Tap Save on shows you're thinking about. They wait here until you decide."}
          </p>
          <Link href="/radar" className="mt-4 inline-block rounded-card bg-accent px-4 py-2 text-sm font-bold text-accent-foreground">Browse the radar</Link>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {list.map((e) => (
            <li key={e.id}>
              <EventCard ev={e} onMark={mark} onCalendar={toggleCalendar} auto />
            </li>
          ))}
        </ul>
      )}
      <ToastView toast={toast} onClose={clearToast} />
    </div>
  );
}
