import { normalizeCity } from "@/lib/util/city";

export type Urgency = "red" | "amber" | "info";

export type UrgencyEvent = {
  city: string | null;
  status: string | null;
  confidence: number | null;
  isFestival: boolean | null;
  ticketUrl: string | null;
  saleOpensAt: Date | null;
  sourceCount: number;
  tiers: { status: string | null; closesAt: Date | null }[];
};
export type UrgencyUser = { homeCity: string | null; watchCities: string[] | null; priority: string | null; p1Cities?: string[] | null; p2Cities?: string[] | null };

const DAY = 24 * 3600 * 1000;

// Returns null when the event is in a city this user does not watch.
export function computeUrgency(ev: UrgencyEvent, user: UrgencyUser, now = Date.now()): Urgency | null {
  const city = normalizeCity(ev.city);
  if (user.p1Cities?.length || user.p2Cities?.length) return computeByPriority(ev, user, city, now);
  const watch = user.watchCities ?? ["ALL_INDIA"];
  const all = watch.includes("ALL_INDIA");
  const home = !!city && city === normalizeCity(user.homeCity ?? "Bengaluru");
  if (!all && !home && !watch.map(normalizeCity).includes(city)) return null;

  const anyOpen = ev.tiers.some((t) => t.status === "open") || ev.status === "early_bird" || ev.status === "on_sale";
  const saleSoon = ev.status === "sale_soon";
  const rumor = ev.status === "rumored";
  if (rumor || (ev.confidence ?? 0) < 0.6 || (ev.isFestival && !ev.ticketUrl)) return "info";

  const imminent =
    (ev.saleOpensAt && ev.saleOpensAt.getTime() > now && ev.saleOpensAt.getTime() - now <= DAY) ||
    ev.tiers.some((t) => t.status === "open" && t.closesAt && t.closesAt.getTime() > now && t.closesAt.getTime() - now <= DAY);
  const hasTierInfo = ev.tiers.length > 0 || anyOpen || saleSoon;

  if (home && (anyOpen || imminent)) {
    // No red alert without a ticket URL or two sources.
    return ev.ticketUrl || ev.sourceCount >= 2 ? "red" : "amber";
  }
  if (home && !hasTierInfo) return "amber";
  if (!home && (anyOpen || saleSoon)) return "amber";
  if (user.priority === "must_see") return "amber";
  return home ? "amber" : "info";
}

// Priority cities: P1 = alert instantly, P2 = also tell me, "All India" = everything else in the digest.
// Returns null when the city is in neither list and "All India" is off.
function computeByPriority(ev: UrgencyEvent, user: UrgencyUser, city: string, now: number): Urgency | null {
  const p1 = (user.p1Cities ?? []).map(normalizeCity).includes(city);
  const p2 = !p1 && (user.p2Cities ?? []).map(normalizeCity).includes(city);
  const all = (user.watchCities ?? []).includes("ALL_INDIA");
  if (!p1 && !p2 && !all) return null;

  const anyOpen = ev.tiers.some((t) => t.status === "open") || ev.status === "early_bird" || ev.status === "on_sale";
  const saleSoon = ev.status === "sale_soon";
  const mustSee = user.priority === "must_see";
  if (ev.status === "rumored" || (ev.confidence ?? 0) < 0.6 || (ev.isFestival && !ev.ticketUrl)) return "info";

  const imminent =
    (ev.saleOpensAt && ev.saleOpensAt.getTime() > now && ev.saleOpensAt.getTime() - now <= DAY) ||
    ev.tiers.some((t) => t.status === "open" && t.closesAt && t.closesAt.getTime() > now && t.closesAt.getTime() - now <= DAY);

  if (p1) {
    if (anyOpen || imminent) return ev.ticketUrl || ev.sourceCount >= 2 ? "red" : "amber"; // no red without a ticket URL or two sources
    return "amber";
  }
  if (p2) return anyOpen || saleSoon || imminent || mustSee ? "amber" : "info";
  return mustSee ? "amber" : "info";
}
