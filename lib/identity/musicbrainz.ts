import { sleep } from "@/lib/util/retry";
import { normalizeName } from "./normalize";
import type { Candidate } from "./types";

const BASE = "https://musicbrainz.org/ws/2";

// All MusicBrainz calls go through one queue with a 1.1s gap (their limit is 1 req/s).
let chain: Promise<unknown> = Promise.resolve();
let lastCall = 0;

function mbFetch<T>(path: string): Promise<T | null> {
  const run = chain.then(async () => {
    const wait = lastCall + 1100 - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    const r = await fetch(`${BASE}${path}${path.includes("?") ? "&" : "?"}fmt=json`, {
      headers: { "User-Agent": process.env.MUSICBRAINZ_USER_AGENT ?? "FrontRow/0.1" },
      cache: "no-store",
    });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`MusicBrainz ${r.status}`);
    return (await r.json()) as T;
  });
  chain = run.catch(() => undefined);
  return run as Promise<T | null>;
}

type MbArtist = {
  id: string;
  name: string;
  score?: number;
  country?: string;
  disambiguation?: string;
  type?: string;
  aliases?: { name: string }[];
  "life-span"?: { begin?: string | null; end?: string | null; ended?: boolean | null };
};

function hint(a: MbArtist) {
  return [a.disambiguation, a.type, a.country].filter(Boolean).join(" · ") || undefined;
}

export async function searchArtists(name: string): Promise<(Candidate & { score: number })[]> {
  const q = encodeURIComponent(`artist:"${name.replace(/"/g, "")}"`);
  const j = await mbFetch<{ artists: MbArtist[] }>(`/artist?query=${q}&limit=5`);
  return (j?.artists ?? []).map((a) => ({
    source: "musicbrainz" as const,
    mbid: a.id,
    name: a.name,
    hint: hint(a),
    country: a.country ?? null,
    score: a.score ?? 0,
  }));
}

export async function getArtistById(mbid: string): Promise<Candidate | null> {
  const a = await mbFetch<MbArtist>(`/artist/${mbid}`);
  return a ? { source: "musicbrainz", mbid: a.id, name: a.name, hint: hint(a), country: a.country ?? null } : null;
}

// Spotify artist -> MusicBrainz id via the Spotify URL relation (reliable, no guessing).
export async function mbidForSpotifyId(spotifyId: string): Promise<string | null> {
  const res = encodeURIComponent(`https://open.spotify.com/artist/${spotifyId}`);
  const j = await mbFetch<{ relations?: { artist?: { id: string } }[] }>(`/url?resource=${res}&inc=artist-rels`);
  return j?.relations?.find((r) => r.artist)?.artist?.id ?? null;
}

// Only accept a name-search hit when it is a single, perfect, exact-name match.
export async function mbidForExactName(name: string): Promise<string | null> {
  const hits = await searchArtists(name);
  const exact = hits.filter((h) => h.score >= 100 && normalizeName(h.name) === normalizeName(name));
  return exact.length === 1 ? exact[0].mbid! : null;
}

export async function getDetails(mbid: string): Promise<{ aliases: string[]; country: string | null; type: string | null; ended: boolean } | null> {
  const a = await mbFetch<MbArtist>(`/artist/${mbid}?inc=aliases`);
  if (!a) return null;
  return { aliases: (a.aliases ?? []).map((x) => x.name), country: a.country ?? null, type: a.type ?? null, ended: a["life-span"]?.ended === true };
}

// A solo artist (type Person) whose life-span has ended has died; a Group whose life-span ended has disbanded.
// A band that lost a member is not "ended", so it stays. Plain data, never an AI guess.
export function inactiveReason(d: { type: string | null; ended: boolean }): "deceased" | "disbanded" | null {
  if (!d.ended) return null;
  if (d.type === "Person") return "deceased";
  if (d.type === "Group" || d.type === "Orchestra" || d.type === "Choir") return "disbanded";
  return null;
}

export function originFromCountry(country: string | null | undefined): "india" | "international" | "unknown" {
  if (!country) return "unknown";
  return country.toUpperCase() === "IN" ? "india" : "international";
}
