import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";
import { derivedAliases, normalizeName } from "./normalize";
import { getDetails, inactiveReason, mbidForExactName, mbidForSpotifyId, originFromCountry } from "./musicbrainz";
import type { Candidate } from "./types";

export type ArtistRow = typeof schema.artists.$inferSelect;
export type AddedVia = "spotify_followed" | "spotify_top" | "spotify_link" | "search" | "paste" | "suggested";

// One shared row per Spotify ID: never create a duplicate for an ID that already exists.
export async function upsertSpotifyArtists(db: Db, cands: Candidate[]) {
  const byId = new Map<string, Candidate>();
  for (const c of cands) if (c.spotifyId && !byId.has(c.spotifyId)) byId.set(c.spotifyId, c);
  const ids = [...byId.keys()];
  const result = new Map<string, { artist: ArtistRow; isNew: boolean }>();
  if (ids.length === 0) return result;

  const existing = await db.select().from(schema.artists).where(inArray(schema.artists.spotifyId, ids));
  const existingIds = new Set(existing.map((a) => a.spotifyId));
  const fresh = ids.filter((id) => !existingIds.has(id));
  let inserted: ArtistRow[] = [];
  if (fresh.length) {
    await db
      .insert(schema.artists)
      .values(
        fresh.map((id) => {
          const c = byId.get(id)!;
          return {
            name: c.name,
            normalizedName: normalizeName(c.name),
            aliases: derivedAliases(c.name),
            spotifyId: id,
            imageUrl: c.imageUrl ?? null,
            genres: c.genres ?? [],
            identityStatus: "verified",
          };
        }),
      )
      .onConflictDoNothing({ target: schema.artists.spotifyId });
    inserted = await db.select().from(schema.artists).where(inArray(schema.artists.spotifyId, fresh));
  }
  for (const a of existing) result.set(a.spotifyId!, { artist: a, isNew: false });
  for (const a of inserted) result.set(a.spotifyId!, { artist: a, isNew: true });
  return result;
}

// A MusicBrainz-only artist the user picked (no Spotify match).
export async function upsertMusicBrainzArtist(db: Db, c: Candidate) {
  const [existing] = await db.select().from(schema.artists).where(eq(schema.artists.mbid, c.mbid!));
  if (existing) return { artist: existing, isNew: false };
  await db
    .insert(schema.artists)
    .values({
      name: c.name,
      normalizedName: normalizeName(c.name),
      aliases: derivedAliases(c.name),
      mbid: c.mbid,
      origin: originFromCountry(c.country),
      identityStatus: "verified",
    })
    .onConflictDoNothing({ target: schema.artists.mbid });
  const [row] = await db.select().from(schema.artists).where(eq(schema.artists.mbid, c.mbid!));
  return { artist: row, isNew: true };
}

// "Add as typed": no external identity, matched later at a higher threshold.
export async function upsertUnverifiedArtist(db: Db, name: string) {
  const norm = normalizeName(name);
  const [existing] = await db
    .select()
    .from(schema.artists)
    .where(
      and(
        eq(schema.artists.normalizedName, norm),
        eq(schema.artists.identityStatus, "unverified"),
        isNull(schema.artists.spotifyId),
        isNull(schema.artists.mbid),
      ),
    );
  if (existing) return { artist: existing, isNew: false };
  const [row] = await db
    .insert(schema.artists)
    .values({
      name: name.trim(),
      normalizedName: norm,
      aliases: derivedAliases(name),
      identityStatus: "unverified",
    })
    .returning();
  return { artist: row, isNew: true };
}

// Adds to the user's watchlist without overriding an existing priority.
// Returns the artist ids that were newly added for this user.
export async function addUserArtists(db: Db, userId: string, artistIds: string[], via: AddedVia) {
  const ids = [...new Set(artistIds)];
  if (!ids.length) return new Set<string>();
  const rows = await db
    .insert(schema.userArtists)
    .values(ids.map((artistId) => ({ userId, artistId, priority: "follow", addedVia: via })))
    .onConflictDoNothing()
    .returning({ artistId: schema.userArtists.artistId });
  return new Set(rows.map((r) => r.artistId));
}

// Sets the "do not show" flags from MusicBrainz life-span data (deceased solo artists, disbanded groups).
export function inactiveFields(d: { type: string | null; ended: boolean }) {
  const reason = inactiveReason(d);
  return { isDeceased: reason !== null, inactiveReason: reason, deceasedCheckedAt: new Date() };
}

/* Alias enrichment: MusicBrainz aliases + origin, best effort, never from an LLM.
   Runs after the response is sent; MusicBrainz is rate limited to 1 req/s. */
export async function enrichArtists(db: Db, artistIds: string[], budgetMs = 40_000) {
  const started = Date.now();
  if (!artistIds.length) return;
  const rows = await db.select().from(schema.artists).where(inArray(schema.artists.id, artistIds));
  for (const a of rows) {
    if (Date.now() - started > budgetMs) break; // MusicBrainz is slow; stay inside the function limit
    try {
      let mbid = a.mbid;
      if (!mbid && a.spotifyId) mbid = await mbidForSpotifyId(a.spotifyId);
      if (!mbid && a.spotifyId) mbid = await mbidForExactName(a.name);
      if (!mbid) continue;
      const d = await getDetails(mbid);
      if (!d) continue;
      const aliases = [...new Set([...(a.aliases ?? []), ...derivedAliases(a.name), ...d.aliases])]
        .filter((x) => x.trim() && x !== a.name)
        .slice(0, 25);
      const [taken] = a.mbid
        ? []
        : await db.select({ id: schema.artists.id }).from(schema.artists).where(eq(schema.artists.mbid, mbid));
      await db
        .update(schema.artists)
        .set({
          aliases,
          ...(taken || a.mbid ? {} : { mbid }),
          ...(a.origin === "unknown" ? { origin: originFromCountry(d.country) } : {}),
          ...inactiveFields(d),
        })
        .where(eq(schema.artists.id, a.id));
    } catch (e) {
      console.error("enrich failed", a.name, e);
    }
  }
}

export async function countUserArtists(db: Db, userId: string) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.userArtists)
    .where(eq(schema.userArtists.userId, userId));
  return r.n;
}
