import { eq } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";
import { sha256 } from "@/lib/util/hash";

// Collectors write raw_items and nothing else: hash the content, skip what was already seen.
export async function insertRawItem(db: Db, item: { sourceId: string | null; url: string | null; title: string; content: string; hashSeed?: string }) {
  const contentHash = sha256(item.hashSeed ?? `${item.url ?? ""}\n${item.title}\n${item.content}`);
  const rows = await db
    .insert(schema.rawItems)
    .values({ sourceId: item.sourceId, url: item.url, title: item.title, content: item.content, contentHash })
    .onConflictDoNothing({ target: schema.rawItems.contentHash })
    .returning({ id: schema.rawItems.id });
  return rows[0]?.id ?? null;
}

// Keep the sources row honest: last run, last OK, error, consecutive failures. Never throws.
export async function markSource(db: Db, sourceId: string, result: { ok: boolean; error?: string; config?: unknown }) {
  try {
    const [cur] = await db.select().from(schema.sources).where(eq(schema.sources.id, sourceId));
    if (!cur) return;
    await db
      .update(schema.sources)
      .set({
        lastRunAt: new Date(),
        ...(result.ok ? { lastOkAt: new Date(), lastError: null, consecutiveFailures: 0 } : { lastError: result.error?.slice(0, 300) ?? "error", consecutiveFailures: (cur.consecutiveFailures ?? 0) + 1 }),
        ...(result.config !== undefined ? { config: result.config } : {}),
      })
      .where(eq(schema.sources.id, sourceId));
  } catch (e) {
    console.error("markSource failed", e);
  }
}

export async function getSource(db: Db, kind: string, name: string) {
  const [s] = await db.select().from(schema.sources).where(eq(schema.sources.name, name));
  return s && s.kind === kind ? s : null;
}

export async function startRun(db: Db, job: string) {
  const [r] = await db.insert(schema.runs).values({ job }).returning({ id: schema.runs.id });
  return r.id;
}

export async function finishRun(db: Db, id: string, v: { itemsIn?: number; eventsNew?: number; alertsSent?: number; firecrawlCredits?: number; errors?: unknown }) {
  await db.update(schema.runs).set({ finishedAt: new Date(), ...v }).where(eq(schema.runs.id, id));
}
