import { cacheLife, cacheTag } from "next/cache";
import { eq, max, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getPublicCounters } from "./radar";
import { loadRadarPage } from "./page";

// Shared reads (the same for every visitor) are cached so pages stop hitting Neon on every view.
// Anything per-user stays live. Jobs call revalidateTag("shared") if a fresher value is ever needed.

/** Landing-page counters. */
export async function getCachedCounters() {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  cacheTag("shared", "counters");
  return getPublicCounters(getDb());
}

/** Source count and last scan time shown on every radar. */
export async function getCachedScanInfo() {
  "use cache";
  cacheLife({ stale: 30, revalidate: 60, expire: 600 });
  cacheTag("shared", "scan-info");
  const db = getDb();
  const [[src], [last]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(schema.sources).where(eq(schema.sources.enabled, true)),
    db.select({ t: max(schema.runs.startedAt) }).from(schema.runs),
  ]);
  return { sourceCount: src.n, lastScanAt: last.t?.toISOString() ?? null };
}

/** The public /demo radar (the owner's, read-only). */
export async function getCachedDemo() {
  "use cache";
  cacheLife({ stale: 60, revalidate: 120, expire: 3600 });
  cacheTag("shared", "demo");
  const db = getDb();
  const [owner] = await db.select().from(schema.users).where(eq(schema.users.isOwner, true));
  if (!owner) return null;
  const d = await loadRadarPage(db, owner, { history: false });
  return { d, ownerName: owner.name, homeCity: owner.homeCity };
}
