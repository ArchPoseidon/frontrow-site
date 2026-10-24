import { and, eq, inArray, ne } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";
import { normalizeName } from "@/lib/identity/normalize";
import { yesNo } from "./gemini";

export type Watched = {
  id: string;
  name: string;
  identityStatus: string | null;
  names: string[]; // normalized name + normalized aliases
};

// Same measure as pg_trgm similarity(): shared trigrams over all trigrams, words padded "  w ".
function trigrams(s: string) {
  const set = new Set<string>();
  for (const w of s.split(/\s+/).filter(Boolean)) {
    const p = `  ${w} `;
    for (let i = 0; i < p.length - 2; i++) set.add(p.slice(i, i + 3));
  }
  return set;
}
export function similarity(a: string, b: string) {
  const A = trigrams(a);
  const B = trigrams(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const t of A) if (B.has(t)) shared++;
  return shared / (A.size + B.size - shared);
}

// Every artist that at least one user watches and has not muted.
export async function loadWatched(db: Db, onlyIds?: string[]): Promise<Watched[]> {
  const ids = (
    await db
      .selectDistinct({ id: schema.userArtists.artistId })
      .from(schema.userArtists)
      .where(ne(schema.userArtists.priority, "muted"))
  ).map((r) => r.id);
  const wanted = onlyIds ? ids.filter((i) => onlyIds.includes(i)) : ids;
  if (!wanted.length) return [];
  const rows = await db.select().from(schema.artists).where(and(inArray(schema.artists.id, wanted), eq(schema.artists.isDeceased, false)));
  return rows.map((a) => ({
    id: a.id,
    name: a.name,
    identityStatus: a.identityStatus,
    names: [...new Set([a.normalizedName, ...(a.aliases ?? []).map(normalizeName)])].filter(Boolean),
  }));
}

export type MatchResult = { artist: Watched; how: "exact" | "fuzzy" | "llm" } | null;

// Exact normalized match, then trigram >= 0.85 (>= 0.92 for name-only artists),
// then a Gemini yes/no for the 0.7-0.85 band. Tribute/cover is rejected by the caller.
export async function matchName(raw: string, watched: Watched[], evidence: string): Promise<MatchResult> {
  const n = normalizeName(raw);
  if (!n) return null;
  let best: { a: Watched; score: number } | null = null;
  for (const a of watched) {
    if (a.names.includes(n)) return { artist: a, how: "exact" };
    const score = Math.max(...a.names.map((x) => similarity(n, x)));
    if (!best || score > best.score) best = { a, score };
  }
  if (!best) return null;
  const strict = best.a.identityStatus === "unverified";
  if (best.score >= (strict ? 0.92 : 0.85)) return { artist: best.a, how: "fuzzy" };
  if (!strict && best.score >= 0.7) {
    try {
      const same = await yesNo(
        `Is the performer "${raw}" in this text the same artist as "${best.a.name}"? Answer true only if they are clearly the same act, not a similarly named one or a tribute.\nText: "${evidence}"`,
      );
      if (same) return { artist: best.a, how: "llm" };
    } catch {
      // unsure: drop rather than guess
    }
  }
  return null;
}

