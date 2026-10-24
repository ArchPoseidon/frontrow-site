import { getDb } from "@/lib/db";
import { loadEventCard } from "@/lib/notify/content";

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

// Public calendar file for one event (all-day on the show date).
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const ev = await loadEventCard(getDb(), id).catch(() => null);
  if (!ev || !ev.date) return new Response("No date for this event yet", { status: 404 });
  const d = ev.date.replace(/-/g, "");
  const next = new Date(Date.parse(`${ev.date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10).replace(/-/g, "");
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FrontRow//EN",
    "BEGIN:VEVENT",
    `UID:${ev.id}@frontrow`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${d}`,
    `DTEND;VALUE=DATE:${next}`,
    `SUMMARY:${esc(`${ev.artistName}${ev.title && ev.title !== ev.artistName ? ` – ${ev.title}` : ""}`)}`,
    `LOCATION:${esc([ev.venue, ev.city].filter(Boolean).join(", "))}`,
    ev.ticketUrl ? `DESCRIPTION:${esc(`Tickets: ${ev.ticketUrl}`)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
  return new Response(body, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="show.ics"` } });
}
