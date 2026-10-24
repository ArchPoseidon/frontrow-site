import { normalizeName } from "@/lib/identity/normalize";
import { firecrawlScrape, jinaScrape } from "@/lib/firecrawl";
import { scrapeDo } from "@/lib/scrapedo";
import { canonicalize, decodeGoogleNews, isGenericUrl } from "./url";
import { normalizeCity } from "@/lib/util/city";

// mismatch = a real page for the artist, but for another city/date (e.g. the Delhi page for a Mumbai show)
export type LinkStatus = "exact" | "ok" | "generic" | "broken" | "blocked" | "mismatch";

export type LinkResult = {
  status: LinkStatus;
  httpStatus: number | null;
  finalUrl: string | null; // canonical, after redirects
  title: string | null;
  text: string; // page text, for tier extraction (may be empty)
  credits: number; // Firecrawl credits spent
  via: "fetch" | "firecrawl" | "scrapedo" | "jina" | "none";
};

const UA = "Mozilla/5.0 (compatible; FrontRowBot/1.0; personal non-commercial concert alerts)";
const BOT_WALL = /Just a moment|Attention Required|Performing security verification|Access denied|Pardon Our Interruption|are you a robot|captcha/i;
const SOFT_404 = /\b(404|page not found|not found|no longer available|event (has )?(ended|expired)|doesn.?t exist|couldn.?t find)\b/i;

const stripHtml = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#?\w+;/g, " ")
    .replace(/\s+/g, " ");

function mentions(text: string, title: string | null, names: string[]) {
  const hay = ` ${normalizeName(`${title ?? ""} ${text.slice(0, 200_000)}`)} `;
  return names.some((n) => {
    const x = normalizeName(n);
    return x.length >= 3 && hay.includes(` ${x} `);
  });
}

export type EventCtx = { city?: string | null; date?: string | null };

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const CITY_VARIANTS: Record<string, string[]> = { bengaluru: ["bengaluru", "bangalore"], mumbai: ["mumbai", "bombay"], delhi: ["delhi", "new delhi", "ncr"], gurugram: ["gurugram", "gurgaon"], kolkata: ["kolkata", "calcutta"], chennai: ["chennai", "madras"], pune: ["pune", "poona"] };

// Does this page belong to THIS show (city and/or date), not another stop of the same tour?
export function matchesEvent(url: string, title: string | null, text: string, ev: EventCtx): boolean {
  const head = `${url} ${title ?? ""}`.toLowerCase();
  const body = `${head} ${text.slice(0, 60_000)}`.toLowerCase();
  const city = normalizeCity(ev.city);
  const variants = city ? (CITY_VARIANTS[city] ?? [city]) : [];
  const cityHead = variants.some((v) => head.includes(v));
  const cityBody = variants.some((v) => body.includes(v));
  let dateHit = false;
  if (ev.date) {
    const [y, m, d] = ev.date.split("-").map(Number);
    const mon = MONTHS[m - 1];
    const full = new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en", { month: "long", timeZone: "UTC" }).toLowerCase();
    const pats = [ev.date, `${d} ${mon}`, `${d}${["th", "st", "nd", "rd"][d % 10 > 3 || [11, 12, 13].includes(d) ? 0 : d % 10]} ${mon}`, `${mon} ${d}`, `${d} ${full}`, `${full} ${d}`, `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`, `${String(d).padStart(2, "0")}-${String(m).padStart(2, "0")}-${y}`];
    dateHit = pats.some((p) => body.includes(p));
  }
  if (!city && !ev.date) return true;
  // The page must be for this city AND this date (another stop or another year of the same tour is a mismatch).
  if (city && ev.date) return (cityHead || cityBody) && dateHit;
  return city ? cityHead || cityBody : dateHit;
}

function classify(finalUrl: string, httpStatus: number, title: string | null, text: string, names: string[], ev?: EventCtx): LinkStatus {
  if (httpStatus === 404 || httpStatus === 410 || httpStatus >= 500) return "broken";
  if (isGenericUrl(finalUrl)) return "generic"; // e.g. redirected to the homepage because the event page is gone
  if (title && SOFT_404.test(title) && !mentions(text, null, names)) return "broken";
  if (ev && !matchesEvent(finalUrl, title, text, ev)) return "mismatch";
  return mentions(text, title, names) ? "exact" : "ok";
}

// Verifies that a URL loads, lands on a specific page (not a homepage/listing/profile) and names the artist.
// Free fetch first; Firecrawl only when a bot wall blocks it (and only when allowed); Jina as a free last try.
export async function checkUrl(rawUrl: string, ctx: { names: string[]; allowFirecrawl?: boolean; event?: EventCtx }): Promise<LinkResult> {
  const fail = (status: LinkStatus, httpStatus: number | null = null, credits = 0): LinkResult => ({ status, httpStatus, finalUrl: null, title: null, text: "", credits, via: "none" });
  let url = canonicalize(rawUrl);
  if (!url) return fail("broken");
  const decoded = await decodeGoogleNews(url);
  if (decoded) url = decoded;
  else if (/news\.google\.com/.test(url)) return { ...fail("ok"), finalUrl: url }; // could not decode: still a working link for people
  if (isGenericUrl(url)) return { ...fail("generic"), finalUrl: url };

  let credits = 0;
  try {
    const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(12_000), headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en-IN,en;q=0.8" } });
    const finalUrl = canonicalize(r.url) ?? url;
    const html = (await r.text()).slice(0, 600_000);
    const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.replace(/\s+/g, " ").trim() ?? null;
    const walled = [401, 403, 429, 503].includes(r.status) || (title ? BOT_WALL.test(title) : false);
    if (!walled) {
      const text = stripHtml(html);
      return { status: classify(finalUrl, r.status, title, text, ctx.names, ctx.event), httpStatus: r.status, finalUrl, title, text, credits, via: "fetch" };
    }
  } catch (e) {
    // DNS failures, resets and timeouts: the link does not load for us.
    const msg = e instanceof Error ? `${e.message} ${(e as { cause?: { code?: string } }).cause?.code ?? ""}` : "";
    if (/ENOTFOUND|ECONNREFUSED|certificate|CERT_/i.test(msg)) return fail("broken");
    // timeouts fall through to the scraper
  }

  // Bot wall: use a real scraper.
  // Firecrawl while its daily budget lasts, then Scrape.do (1 credit, gets past BookMyShow), then Jina.
  const attempts = [ctx.allowFirecrawl ? firecrawlScrape : null, (u: string) => scrapeDo(u), jinaScrape].filter(Boolean) as ((u: string) => Promise<Awaited<ReturnType<typeof firecrawlScrape>>>)[];
  for (const scrape of attempts) {
    const s = await scrape(url);
    if (scrape === firecrawlScrape) credits += 1;
    if (!s.ok) continue;
    const finalUrl = canonicalize(s.finalUrl ?? url) ?? url;
    return { status: classify(finalUrl, s.statusCode ?? 200, s.title, s.markdown, ctx.names, ctx.event), httpStatus: s.statusCode ?? 200, finalUrl, title: s.title, text: s.markdown, credits, via: s.via };
  }
  return { ...fail("blocked", null, credits), finalUrl: url };
}
