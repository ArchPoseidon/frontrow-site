"use client";

import { EventCard } from "./EventCard";
import { ToastView, useEventActions } from "./useEventActions";
import type { EventView } from "./types";

// A single editable card (event page): Going, bookmark and Add to calendar work for a signed-in viewer.
export function EventCardLive({ ev, size = "full" }: { ev: EventView; size?: "compact" | "full" }) {
  const { events, mark, toggleCalendar, toast, clearToast } = useEventActions([ev], { returnTo: `/event/${ev.id}` });
  return (
    <>
      <EventCard ev={events[0] ?? ev} size={size} onMark={mark} onCalendar={toggleCalendar} />
      <ToastView toast={toast} onClose={clearToast} />
    </>
  );
}
