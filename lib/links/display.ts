// What people are allowed to see. Ticket buttons only for verified pages; sources only if they load on a specific page.
// Only "exact" (page names the artist and matches this show's city and date) gets a ticket button.
// "ok" (specific page, artist name not found) is shown as a source only: it is the likeliest to be the wrong page.
const TICKET_OK = new Set(["exact"]);
const SOURCE_OK = new Set(["exact", "ok", "blocked"]); // blocked = bot wall for us, but a specific page that works in a browser

export const ticketLinkOf = (e: { ticketUrl: string | null; ticketStatus: string | null }) => (e.ticketUrl && TICKET_OK.has(e.ticketStatus ?? "") ? e.ticketUrl : null);

export type SourceRow = { url: string; platform: string | null; status: string | null; finalUrl: string | null };
export const visibleSources = <T extends SourceRow>(rows: T[]) =>
  rows
    .filter((s) => SOURCE_OK.has(s.status ?? ""))
    .map((s) => ({ ...s, url: s.finalUrl ?? s.url }))
    .filter((s, i, arr) => arr.findIndex((x) => x.url === s.url) === i);
