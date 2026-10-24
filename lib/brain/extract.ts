import { z } from "zod";
import { generateJson } from "./gemini";
import { todayIST } from "@/lib/util/ist";

export const Tier = z.object({
  name: z.string(),
  price_inr: z.number().nullable(),
  status: z.enum(["upcoming", "open", "sold_out", "closed"]),
  opens_at: z.string().nullable(),
  closes_at: z.string().nullable(),
});

export const ExtractedEvent = z.object({
  artist_names: z.array(z.string()),
  event_title: z.string(),
  is_festival: z.boolean(),
  venue: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string(),
  date: z.string().nullable(),
  time: z.string().nullable(),
  ticket_url: z.string().nullable(),
  platform: z.string().nullable(),
  announcement_type: z.enum(["new", "update", "lineup", "rumor", "not_an_event"]),
  sale_opens_at: z.string().nullable(),
  tiers: z.array(Tier),
  is_tribute_or_cover: z.boolean(),
  evidence_quote: z.string(),
  confidence: z.number(),
});
export type ExtractedEvent = z.infer<typeof ExtractedEvent>;

const Extraction = z.object({ events: z.array(ExtractedEvent) });

const RULES = `Extract live-music events (concerts, tours, festivals) from the text below.
Rules:
- Only events in India. Skip everything else.
- Never invent fields; use null when the text does not say.
- Convert Indian date formats (e.g. "14th Feb", "14/02/2027") to ISO YYYY-MM-DD. Use IST (+05:30) for any datetime.
- Today is ${"{TODAY}"} (IST). Treat events dated before today as announcement_type "not_an_event".
- Flag tribute nights, cover sets and "music of X" nights with is_tribute_or_cover = true.
- A festival lists every performing artist in artist_names. A headline show lists the performing artist(s).
- ticket_url must be a URL that appears in the text; otherwise null.
- tiers: only ones the text states (early bird, phase, presale, general). Name them as written.
- evidence_quote: a verbatim quote of under 20 words that supports the event.
- confidence is 0 to 1: how sure you are this is a real, upcoming India show.
- Return {"events": []} when unsure or when the text is not about a show.`;

export async function extractEvents(input: { title: string | null; content: string; url: string | null; artistHint?: string }) {
  const hint = input.artistHint ? `\nThe text is about the artist "${input.artistHint}".` : "";
  const prompt = `${RULES.replace("{TODAY}", todayIST())}${hint}

Source URL: ${input.url ?? "unknown"}
Title: ${input.title ?? ""}
Text:
"""
${input.content.slice(0, 12000)}
"""`;
  const out = await generateJson(prompt, Extraction);
  return out.events;
}

const TierPage = z.object({
  is_event_page: z.boolean(),
  sold_out: z.boolean(),
  sale_opens_at: z.string().nullable(),
  tiers: z.array(Tier),
});

// Ticket tiers from a ticketing page's text. Only what the page states; empty when it lists none.
export async function extractTiers(text: string, artist: string) {
  const prompt = `This is the text of a ticketing page for a live show by "${artist}" in India. Extract the ticket tiers.
Rules:
- tiers: one per ticket category/phase the page states (e.g. "Early Bird", "Phase 1", "General", "VIP"), in the order sold. status is "open" only if it can be bought now, "sold_out" if marked sold out/unavailable, "upcoming" if not on sale yet, "closed" if the sale ended.
- price_inr: the lowest price for that tier in rupees as a number, or null. Never invent prices.
- opens_at / closes_at: ISO datetimes in IST (+05:30) only if the page states them, else null. Today is ${new Date().toISOString().slice(0, 10)}.
- sale_opens_at: when general sales start, if stated and still in the future.
- sold_out: true only when the whole event is sold out.
- is_event_page: false if this is a homepage, listing or error page.
- Return no tiers when the page lists none.

"""
${text.slice(0, 14000)}
"""`;
  return generateJson(prompt, TierPage);
}
