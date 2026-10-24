import { eq } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";
import { firecrawlScrape, jinaScrape } from "@/lib/firecrawl";
import { scrapeDo } from "@/lib/scrapedo";
import { sha256 } from "@/lib/util/hash";
import { insertRawItem, markSource } from "./shared";

const MAX_FAILS = 3;

export type ListingResult = { skipped?: "unchanged" | "budget" | "disabled" | "not_due"; rawItemId?: string | null; credits: number; error?: string };

// Page text that changes on every load (timestamps, counters) must not defeat the "unchanged" check:
// hash only the event links and headings.
const fingerprint = (md: string) =>
  sha256(
    md
      .split("\n")
      .filter((l) => /\]\(https?:\/\/[^)]*(event|events|e\/|tickets|buy)/i.test(l) || /^#{1,4}\s/.test(l))
      .join("\n") || md,
  );

// Firecrawl scrape of one listing page. Unchanged page -> stop. Changed -> store one raw item for the extractor.
// Firecrawl error or no credits -> Jina Reader. Three failures in a row -> auto-disabled, retried once a day.
export async function collectListing(db: Db, source: typeof schema.sources.$inferSelect, opts: { creditsLeft: number; force?: boolean }): Promise<ListingResult> {
  const cfg = (source.config ?? {}) as { autoDisabled?: boolean };
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  if (!source.enabled && !(cfg.autoDisabled && (!source.lastRunAt || source.lastRunAt.getTime() < dayAgo))) return { skipped: "disabled", credits: 0 };
  const due = !source.lastRunAt || Date.now() - source.lastRunAt.getTime() >= (source.intervalMinutes ?? 360) * 60_000;
  if (!due && !opts.force) return { skipped: "not_due", credits: 0 };
  if (!source.url) return { skipped: "disabled", credits: 0 };

  let credits = 0;
  let scraped = opts.creditsLeft > 0 ? await firecrawlScrape(source.url) : null;
  if (scraped) credits = 1;
  // Firecrawl, then Scrape.do (plain, then with a real browser if the page needs JavaScript), then Jina.
  if (!scraped?.ok) {
    let d = await scrapeDo(source.url);
    if (d.ok && d.markdown.length < 1500) {
      const rendered = await scrapeDo(source.url, { render: true });
      if (rendered.ok) d = rendered;
    }
    scraped = d.ok ? d : null;
  }
  if (!scraped?.ok) scraped = await jinaScrape(source.url);
  if (!scraped.ok || scraped.markdown.length < 300) {
    const fails = (source.consecutiveFailures ?? 0) + 1;
    await markSource(db, source.id, { ok: false, error: scraped.error ?? "page came back empty", config: { ...cfg, autoDisabled: fails >= MAX_FAILS } });
    if (fails >= MAX_FAILS) await db.update(schema.sources).set({ enabled: false }).where(eq(schema.sources.id, source.id));
    return { credits, error: scraped.error ?? "empty page" };
  }
  // Recovered after an auto-disable: switch it back on.
  if (!source.enabled) await db.update(schema.sources).set({ enabled: true }).where(eq(schema.sources.id, source.id));
  const hash = fingerprint(scraped.markdown);
  if (hash === source.lastContentHash) {
    await markSource(db, source.id, { ok: true, config: { ...cfg, autoDisabled: false } });
    return { skipped: "unchanged", credits };
  }
  const id = await insertRawItem(db, {
    sourceId: source.id,
    url: source.url,
    title: `Listing: ${source.name}`,
    content: `Kind: listing\nListing: ${source.name}\n\n${scraped.markdown.slice(0, 80_000)}`,
    hashSeed: `listing|${source.id}|${hash}`,
  });
  await db.update(schema.sources).set({ lastContentHash: hash }).where(eq(schema.sources.id, source.id));
  await markSource(db, source.id, { ok: true, config: { ...cfg, autoDisabled: false } });
  return { rawItemId: id, credits };
}
