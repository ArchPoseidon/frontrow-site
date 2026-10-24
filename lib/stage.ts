// The look of a show follows where it is in its ticket life:
//   live      tickets can be bought now                         red
//   soon      confirmed show, ticket go-live date announced     purple
//   announced announced, unconfirmed, or no tickets live yet    orange
// (sold out and rumours keep their own neutral look).
export type Stage = "live" | "soon" | "announced" | "soldout" | "rumor";

type D = Date | string | null | undefined;
const ms = (d: D) => (d ? new Date(d).getTime() : NaN);

export function stageOf(
  e: { status: string | null; saleOpensAt: D; tiers: { status: string | null; opensAt?: D }[]; confirmed: boolean },
  now = Date.now(),
): Stage {
  if (e.status === "rumored") return "rumor";
  if (e.status === "sold_out") return "soldout";
  if (e.status === "early_bird" || e.status === "on_sale" || e.tiers.some((t) => t.status === "open")) return "live";
  const futureSale = ms(e.saleOpensAt) > now;
  const upcomingTier = e.tiers.some((t) => t.status === "upcoming" && ms(t.opensAt) > now);
  if (e.confirmed && (e.status === "sale_soon" || futureSale || upcomingTier)) return "soon";
  return "announced";
}

// Same rule as the "Confirmed" line on the card: high confidence or two independent sources.
export const isConfirmed = (confidence: number | null | undefined, distinctSources: number) => (confidence ?? 0) >= 0.9 || distinctSources >= 2;

export const STAGE_EMOJI: Record<Stage, string> = { live: "🔴", soon: "🟣", announced: "🟠", soldout: "⚫", rumor: "⚪" };
export const STAGE_HEX: Record<Stage, string> = { live: "#e11d48", soon: "#8b5cf6", announced: "#f59e0b", soldout: "#57534e", rumor: "#64748b" };
export const STAGE_LABEL: Record<Stage, string> = {
  live: "Tickets live",
  soon: "Tickets go live soon",
  announced: "Announced, tickets not live",
  soldout: "Sold out",
  rumor: "Rumour",
};
