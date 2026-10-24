import { gte, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { crawlersPaused, type Scraped } from "@/lib/firecrawl";

// Second-line crawler (Scrape.do). A plain request is 1 credit and already gets past BookMyShow-style bot walls;
// `render` (a real browser, 5 credits) is only for pages that need JavaScript. The free plan has 1,000 credits a month.
export const monthlyCap = () => Number(process.env.SCRAPEDO_MONTHLY_CAP ?? 900);
export const dailyCap = () => Number(process.env.SCRAPEDO_DAILY_CAP ?? 40);

export async function scrapedoUsed(): Promise<{ month: number; day: number }> {
  const db = getDb();
  const [m] = await db.select({ n: sql<number>`coalesce(sum(${schema.runs.scrapedoCredits}), 0)::int` }).from(schema.runs).where(gte(schema.runs.startedAt, new Date(Date.now() - 30 * 24 * 3600 * 1000)));
  const [d] = await db.select({ n: sql<number>`coalesce(sum(${schema.runs.scrapedoCredits}), 0)::int` }).from(schema.runs).where(gte(schema.runs.startedAt, new Date(Date.now() - 24 * 3600 * 1000)));
  return { month: m.n, day: d.n };
}

async function record(cost: number) {
  try {
    await getDb().insert(schema.runs).values({ job: "scrapedo", finishedAt: new Date(), scrapedoCredits: cost });
  } catch {}
}

// Anchors become [text](url) so extractors still see event links; everything else is stripped to text.
export function htmlToMarkdown(html: string, base: string): string {
  const abs = (h: string) => {
    try {
      return new URL(h, base).toString();
    } catch {
      return h;
    }
  };
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<a\s[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, inner: string) => {
      const text = inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      return text ? ` [${text}](${abs(href)}) ` : " ";
    })
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#?\w+;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

export async function scrapeDo(url: string, opts: { render?: boolean } = {}): Promise<Scraped & { credits: number }> {
  const token = process.env.CRAWLER_API_KEY;
  const fail = (error: string, statusCode: number | null = null): Scraped & { credits: number } => ({ ok: false, markdown: "", title: null, statusCode, finalUrl: null, via: "scrapedo", error, credits: 0 });
  if (await crawlersPaused()) return fail("crawlers paused");
  if (!token) return fail("no Scrape.do key");
  const used = await scrapedoUsed().catch(() => ({ month: 0, day: 0 }));
  if (used.month >= monthlyCap() || used.day >= dailyCap()) return fail("Scrape.do budget used up");
  try {
    const r = await fetch(`https://api.scrape.do/?token=${token}&url=${encodeURIComponent(url)}${opts.render ? "&render=true" : ""}`, { signal: AbortSignal.timeout(45_000) });
    const cost = Number(r.headers.get("scrape.do-request-cost") ?? (opts.render ? 5 : 1)) || 1;
    await record(cost);
    const html = await r.text();
    const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.replace(/\s+/g, " ").trim() ?? null;
    const walled = /Just a moment|Attention Required|Performing security verification|Access denied/i.test(title ?? "");
    if (!r.ok || walled) return { ...fail(walled ? "blocked by site" : `Scrape.do ${r.status}`, r.status), credits: cost };
    return { ok: true, markdown: htmlToMarkdown(html, url), title, statusCode: r.status, finalUrl: url, via: "scrapedo", credits: cost };
  } catch (e) {
    return fail(e instanceof Error ? e.message.slice(0, 100) : "Scrape.do failed");
  }
}
