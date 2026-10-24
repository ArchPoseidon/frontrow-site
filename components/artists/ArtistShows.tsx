"use client";

import { EventCard } from "@/components/event-card/EventCard";
import { ToastView, useEventActions } from "@/components/event-card/useEventActions";
import type { EventView } from "@/components/event-card/types";

export function ArtistShows({ events: initial, artistId }: { events: EventView[]; artistId: string }) {
  const { events, mark, dismiss, toggleCalendar, toast, clearToast } = useEventActions(initial, { returnTo: `/artists/${artistId}` });
  if (!events.length) return <p className="rounded-card border border-dashed border-surface-border p-6 text-sm text-muted">No India shows announced yet. We&apos;re watching and will message you the moment one lands.</p>;
  return (
    <>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {events.map((e) => (
          <li key={e.id}>
            <EventCard ev={e} onMark={mark} onDismiss={dismiss} onCalendar={toggleCalendar} auto />
          </li>
        ))}
      </ul>
      <ToastView toast={toast} onClose={clearToast} />
    </>
  );
}
