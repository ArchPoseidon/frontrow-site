"use client";

import { useCallback, useEffect, useState } from "react";
import type { EventView } from "./types";

export type Toast = { text: string; tone?: "ok" | "error"; action?: { label: string; href: string; external?: boolean } } | null;

// Going / Saved / Not for me / Add to calendar, shared by every screen that lists shows.
export function useEventActions(initial: EventView[], opts: { returnTo: string }) {
  const [events, setEvents] = useState(initial);
  const [toast, setToast] = useState<Toast>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.action ? 9000 : 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const patch = useCallback((id: string, p: Partial<EventView>) => setEvents((es) => es.map((e) => (e.id === id ? { ...e, ...p } : e))), []);

  const send = async (id: string, action: "going" | "saved" | "dismissed" | "clear") => {
    const r = await fetch(`/api/events/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    if (!r.ok) throw new Error();
  };

  const mark = async (id: string, m: "going" | "saved" | null) => {
    const prev = events;
    patch(id, { mine: m });
    try {
      await send(id, m ?? "clear");
      setToast({ text: m === "going" ? "Marked as going" : m === "saved" ? "Saved. Find it under My shows and the calendar's Saved view." : "Removed", tone: "ok" });
    } catch {
      setEvents(prev);
      setToast({ text: "Couldn't save that. Try again.", tone: "error" });
    }
  };

  const dismiss = async (id: string) => {
    const prev = events;
    setEvents((es) => es.filter((e) => e.id !== id));
    try {
      await send(id, "dismissed");
    } catch {
      setEvents(prev);
      setToast({ text: "Couldn't save that. Try again.", tone: "error" });
    }
  };

  const toggleCalendar = async (id: string, forceAdd = false) => {
    const ev = events.find((e) => e.id === id);
    const adding = forceAdd || !ev?.inCalendar;
    try {
      const r = await fetch(`/api/events/${id}/calendar`, { method: adding ? "POST" : "DELETE" });
      const j = (await r.json().catch(() => ({}))) as { error?: string; google?: boolean; needsConnect?: boolean; googleError?: boolean; templateUrl?: string | null };
      if (!r.ok) throw new Error(j.error ?? "Couldn't update your calendar");
      patch(id, { inCalendar: adding });
      if (!adding) setToast({ text: "Removed from your calendar", tone: "ok" });
      else if (j.google) setToast({ text: "Added to your Google Calendar and your FrontRow calendar", tone: "ok" });
      else if (j.templateUrl) setToast({ text: "Added to your FrontRow calendar. Tap to add it to Google Calendar too.", tone: "ok", action: { label: "Add to Google", href: j.templateUrl, external: true } });
      else if (j.needsConnect) setToast({ text: "Added to your FrontRow calendar. Connect Google Calendar to add it there too.", tone: "ok", action: { label: "Connect Google Calendar", href: `/api/gcal/connect?return=${encodeURIComponent(`${opts.returnTo}${opts.returnTo.includes("?") ? "&" : "?"}add=${id}`)}` } });
      else setToast({ text: "Added to your FrontRow calendar. Google Calendar didn't respond, so try the button again in a minute.", tone: "ok" });
    } catch (e) {
      setToast({ text: e instanceof Error ? e.message : "Couldn't update your calendar", tone: "error" });
    }
  };

  const notify = (text: string, tone: "ok" | "error" = "ok") => setToast({ text, tone });
  return { events, setEvents, mark, dismiss, toggleCalendar, notify, toast, clearToast: () => setToast(null) };
}

export function ToastView({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  if (!toast) return null;
  return (
    <div role="status" aria-live="polite" className="fixed inset-x-4 bottom-20 z-40 mx-auto flex max-w-md items-center gap-3 rounded-card border border-surface-border bg-[var(--paper)] px-4 py-3 text-sm text-[var(--paper-ink)] shadow-lg sm:bottom-6">
      <span className={`h-2 w-2 shrink-0 rounded-full ${toast.tone === "error" ? "bg-urgency-red" : "bg-[var(--tier-open)]"}`} />
      <span className="flex-1 font-medium">{toast.text}</span>
      {toast.action && (
        <a href={toast.action.href} {...(toast.action.external ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="shrink-0 rounded-md bg-[var(--paper-ink)] px-3 py-1.5 text-xs font-bold text-[var(--paper)]">{toast.action.label}</a>
      )}
      <button onClick={onClose} aria-label="Dismiss" className="shrink-0 text-lg leading-none opacity-60">×</button>
    </div>
  );
}
