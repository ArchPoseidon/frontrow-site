import { and, eq } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";
import { mapLimit } from "@/lib/util/retry";
import { normalizeName } from "./normalize";
import * as spotify from "./spotify";
import * as mb from "./musicbrainz";
import {
  addUserArtists,
  upsertMusicBrainzArtist,
  upsertSpotifyArtists,
  upsertUnverifiedArtist,
  type ArtistRow,
} from "./artists";
import type { Candidate } from "./types";

const LINK_RE = /(?:https?:\/\/)?open\.spotify\.com\/(?:intl-[a-z]{2}\/)?artist\/([A-Za-z0-9]{22})\S*|spotify:artist:([A-Za-z0-9]{22})/g;
const MAX_INPUTS = 60;

export type ParsedInput = { text: string; spotifyId?: string };

export function parseInputs(raw: string | string[]): ParsedInput[] {
  const text = Array.isArray(raw) ? raw.join("\n") : raw;
  const out: ParsedInput[] = [];
  const seenIds = new Set<string>();
  for (const m of text.matchAll(LINK_RE)) {
    const id = m[1] ?? m[2];
    if (!seenIds.has(id)) {
      seenIds.add(id);
      out.push({ text: m[0], spotifyId: id });
    }
  }
  const rest = text.replace(LINK_RE, "\n");
  let parts = rest.split(/[\n;•]+/).map((s) => s.trim().replace(/^(?:[-*•]\s+|\d{1,2}[.)]\s+)/, "").trim()).filter(Boolean);
  if (parts.length === 1 && parts[0].includes(",")) parts = parts[0].split(",").map((s) => s.trim()).filter(Boolean);
  for (const p of parts) {
    if (/^[A-Za-z0-9]{22}$/.test(p) && /\d/.test(p) && /[a-z]/.test(p) && /[A-Z]/.test(p)) {
      if (!seenIds.has(p)) {
        seenIds.add(p);
        out.push({ text: p, spotifyId: p }); // bare Spotify artist ID
      }
    } else out.push({ text: p });
  }
  const seen = new Set<string>();
  return out
    .filter((i) => {
      const key = i.spotifyId ?? normalizeName(i.text);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_INPUTS);
}

export type ResolvedItem = { inputText: string; artist: ArtistRow; isNew: boolean; alreadyAdded: boolean };
export type ReviewItem = { candidateId: string; inputText: string; candidates: Candidate[] };
export type FailedItem = { inputText: string; reason: string };
export type ResolveResult = {
  resolved: ResolvedItem[];
  needsReview: ReviewItem[];
  unverified: ResolvedItem[];
  failed: FailedItem[];
  newArtistIds: string[];
};

type Outcome =
  | { kind: "verified"; input: ParsedInput; cand: Candidate }
  | { kind: "review"; input: ParsedInput; cands: Candidate[] }
  | { kind: "unverified"; input: ParsedInput }
  | { kind: "failed"; input: ParsedInput; reason: string };

async function classify(input: ParsedInput): Promise<Outcome> {
  try {
    if (input.spotifyId) {
      const cand = await spotify.getArtist(input.spotifyId);
      if (cand) return { kind: "verified", input, cand };
      if (input.text.includes("spotify")) return { kind: "failed", input, reason: "Couldn't find that Spotify artist" };
      // a bare 22-char string that isn't an artist ID: treat as a name
    }
    const q = normalizeName(input.text);
    const sp = await spotify.searchArtists(input.text);
    const exact = sp.filter((c) => normalizeName(c.name) === q);
    if (exact.length === 1) return { kind: "verified", input, cand: exact[0] }; // one exact match only
    if (sp.length) return { kind: "review", input, cands: exact.length > 1 ? exact : sp };
    const mbHits = await mb.searchArtists(input.text);
    if (mbHits.length) return { kind: "review", input, cands: mbHits.map(({ score: _s, ...c }) => c) };
    return { kind: "unverified", input };
  } catch (e) {
    return { kind: "failed", input, reason: e instanceof Error ? e.message : "Lookup failed" };
  }
}

export async function resolveInputs(
  db: Db,
  userId: string,
  raw: string | string[],
  opts: { forceVia?: "search" | "paste" } = {},
): Promise<ResolveResult> {
  const inputs = parseInputs(raw);
  const outcomes = await mapLimit(inputs, 4, classify);
  const result: ResolveResult = { resolved: [], needsReview: [], unverified: [], failed: [], newArtistIds: [] };

  // Verified (Spotify): one bulk upsert, then add to the user's list by how it arrived.
  const verified = outcomes.filter((o): o is Extract<Outcome, { kind: "verified" }> => o.kind === "verified");
  const upserted = await upsertSpotifyArtists(db, verified.map((o) => o.cand));
  for (const via of ["spotify_link", "paste"] as const) {
    const group = verified.filter((o) => (o.input.spotifyId && o.input.text.includes("spotify") ? "spotify_link" : "paste") === via);
    const ids = group.map((o) => upserted.get(o.cand.spotifyId!)!.artist.id);
    const added = await addUserArtists(db, userId, ids, opts.forceVia ?? via);
    for (const o of group) {
      const u = upserted.get(o.cand.spotifyId!)!;
      result.resolved.push({ inputText: o.input.text, artist: u.artist, isNew: u.isNew, alreadyAdded: !added.has(u.artist.id) });
      if (u.isNew) result.newArtistIds.push(u.artist.id);
    }
  }

  for (const o of outcomes) {
    if (o.kind === "failed") result.failed.push({ inputText: o.input.text, reason: o.reason });
    else if (o.kind === "unverified") {
      const u = await upsertUnverifiedArtist(db, o.input.text);
      const added = await addUserArtists(db, userId, [u.artist.id], "paste");
      result.unverified.push({ inputText: o.input.text, artist: u.artist, isNew: u.isNew, alreadyAdded: !added.has(u.artist.id) });
    } else if (o.kind === "review") {
      result.needsReview.push(await saveReview(db, userId, o.input.text, o.cands));
    }
  }
  return result;
}

// artist_candidates keeps unresolved "Which one?" choices so a refresh keeps them.
async function saveReview(db: Db, userId: string, inputText: string, cands: Candidate[], replacesArtistId?: string) {
  const [open] = await db
    .select()
    .from(schema.artistCandidates)
    .where(and(eq(schema.artistCandidates.userId, userId), eq(schema.artistCandidates.inputText, inputText), eq(schema.artistCandidates.status, "open")));
  if (open) return { candidateId: open.id, inputText, candidates: readCandidates(open.candidates).items };
  const [row] = await db
    .insert(schema.artistCandidates)
    .values({ userId, inputText, candidates: { items: cands, replacesArtistId }, status: "open" })
    .returning();
  return { candidateId: row.id, inputText, candidates: cands };
}

export function readCandidates(json: unknown): { items: Candidate[]; replacesArtistId?: string } {
  const j = json as { items?: Candidate[]; replacesArtistId?: string } | null;
  return { items: j?.items ?? [], replacesArtistId: j?.replacesArtistId };
}

export type Pick = { spotifyId?: string; mbid?: string };

// Resolves one "Which one?" choice.
export async function confirmCandidate(
  db: Db,
  userId: string,
  candidateId: string,
  action: { pick: Pick } | { asTyped: true } | { remove: true },
) {
  const [row] = await db
    .select()
    .from(schema.artistCandidates)
    .where(and(eq(schema.artistCandidates.id, candidateId), eq(schema.artistCandidates.userId, userId)));
  if (!row || row.status !== "open") return { ok: false as const, error: "That choice is no longer open" };
  const { items, replacesArtistId } = readCandidates(row.candidates);
  let artist: ArtistRow | null = null;

  if ("remove" in action) {
    await db.update(schema.artistCandidates).set({ status: "removed" }).where(eq(schema.artistCandidates.id, candidateId));
    return { ok: true as const, artist: null };
  }
  if ("asTyped" in action) {
    artist = (await upsertUnverifiedArtist(db, row.inputText)).artist;
  } else {
    // Only accept picks that were actually offered, so the client can't forge identities.
    const offered = items.find((c) => (action.pick.spotifyId && c.spotifyId === action.pick.spotifyId) || (action.pick.mbid && c.mbid === action.pick.mbid));
    if (!offered) return { ok: false as const, error: "That artist wasn't one of the options" };
    artist = offered.spotifyId
      ? [...(await upsertSpotifyArtists(db, [offered])).values()][0].artist
      : (await upsertMusicBrainzArtist(db, offered)).artist;
  }

  let priority: string | null = null;
  if (replacesArtistId) {
    const [old] = await db
      .delete(schema.userArtists)
      .where(and(eq(schema.userArtists.userId, userId), eq(schema.userArtists.artistId, replacesArtistId)))
      .returning();
    priority = old?.priority ?? null;
  }
  await addUserArtists(db, userId, [artist.id], "paste");
  if (priority) {
    await db
      .update(schema.userArtists)
      .set({ priority })
      .where(and(eq(schema.userArtists.userId, userId), eq(schema.userArtists.artistId, artist.id)));
  }
  await db.update(schema.artistCandidates).set({ status: "resolved" }).where(eq(schema.artistCandidates.id, candidateId));
  return { ok: true as const, artist };
}

// A typed-search pick: re-fetch from the source so the client never supplies identity data.
export async function addFromSearchPick(db: Db, userId: string, pick: Pick) {
  let cand: Candidate | null = null;
  if (pick.spotifyId) cand = await spotify.getArtist(pick.spotifyId);
  else if (pick.mbid) cand = await mb.getArtistById(pick.mbid);
  if (!cand) return null;
  const { artist, isNew } = cand.spotifyId
    ? [...(await upsertSpotifyArtists(db, [cand])).values()][0]
    : await upsertMusicBrainzArtist(db, cand);
  const added = await addUserArtists(db, userId, [artist.id], "search");
  return { artist, isNew, alreadyAdded: !added.has(artist.id) };
}

// "Is this the right artist?": reopen the picker for an existing artist.
export async function reopenArtist(db: Db, userId: string, artistId: string) {
  const [a] = await db.select().from(schema.artists).where(eq(schema.artists.id, artistId));
  if (!a) return null;
  let cands = await spotify.searchArtists(a.name);
  if (!cands.length) cands = (await mb.searchArtists(a.name)).map(({ score: _s, ...c }) => c);
  cands = cands.filter((c) => c.spotifyId !== a.spotifyId);
  if (!cands.length) return { candidateId: null, inputText: a.name, candidates: [] as Candidate[] };
  return saveReview(db, userId, a.name, cands, a.id);
}
