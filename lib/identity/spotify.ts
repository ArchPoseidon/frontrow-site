import { eq } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";
import { sleep } from "@/lib/util/retry";
import { normalizeName } from "./normalize";
import type { Candidate } from "./types";

const API = "https://api.spotify.com/v1";
const ACCOUNTS = "https://accounts.spotify.com";

export class SpotifyError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: string, // Spotify's own error message (never a token), kept for diagnostics
  ) {
    super(message);
  }
}

function basicAuth() {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) throw new SpotifyError("Spotify credentials are not configured", 500);
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

/* App-level token (client credentials): used for search and artist lookups so
   they keep working even if the owner's personal connection breaks. */
let appToken: { token: string; exp: number } | null = null;

async function getAppToken(): Promise<string> {
  if (appToken && appToken.exp > Date.now() + 60_000) return appToken.token;
  const r = await fetch(`${ACCOUNTS}/api/token`, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!r.ok) throw new SpotifyError(`Spotify app token failed (${r.status})`, r.status);
  const j = (await r.json()) as { access_token: string; expires_in: number };
  appToken = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return appToken.token;
}

async function spFetch<T>(path: string, token: string): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(API + path, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (r.status === 429) {
      const wait = Number(r.headers.get("retry-after") ?? 1);
      if (wait > 8) throw new SpotifyError("Spotify is rate limiting us, try again shortly", 429);
      await sleep((wait + 0.2) * 1000);
      continue;
    }
    if (!r.ok) throw new SpotifyError(`Spotify ${path.split("?")[0]} failed (${r.status})`, r.status, (await r.text().catch(() => "")).slice(0, 240));
    return (await r.json()) as T;
  }
  throw new SpotifyError("Spotify request kept failing", 429);
}

type SpArtist = {
  id: string;
  name: string;
  images?: { url: string; width?: number }[];
  genres?: string[];
};

export function toCandidate(a: SpArtist): Candidate {
  // Prefer the ~320px image; fall back to whatever exists.
  const img = a.images?.find((i) => i.width && i.width <= 400 && i.width >= 200) ?? a.images?.[1] ?? a.images?.[0];
  return {
    source: "spotify",
    spotifyId: a.id,
    name: a.name,
    imageUrl: img?.url ?? null,
    genres: (a.genres ?? []).slice(0, 4),
  };
}

// Exact normalized-name matches first, then Spotify's own order. Never uses popularity/followers.
export function rankCandidates(cands: Candidate[], query: string): Candidate[] {
  const q = normalizeName(query);
  const exact = cands.filter((c) => normalizeName(c.name) === q);
  return [...exact, ...cands.filter((c) => !exact.includes(c))];
}

export async function searchArtists(query: string): Promise<Candidate[]> {
  const token = await getAppToken();
  const j = await spFetch<{ artists: { items: SpArtist[] } }>(
    `/search?type=artist&limit=10&q=${encodeURIComponent(query)}`,
    token,
  );
  return rankCandidates(j.artists.items.filter(Boolean).map(toCandidate), query);
}

export async function getArtist(id: string): Promise<Candidate | null> {
  const token = await getAppToken();
  try {
    return toCandidate(await spFetch<SpArtist>(`/artists/${id}`, token));
  } catch (e) {
    if (e instanceof SpotifyError && (e.status === 404 || e.status === 400)) return null;
    throw e;
  }
}

/* ---------- Per-user connection (owner and allowlisted users) ---------- */

export const SPOTIFY_SCOPES = "user-follow-read user-top-read";

export function authorizeUrl(state: string): string {
  const p = new URLSearchParams({
    response_type: "code",
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    scope: SPOTIFY_SCOPES,
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
    state,
    // Always show Spotify's own screen (with its "Not you?" link) instead of silently re-using whichever Spotify
    // account is already logged in on this browser. Without it, a second person on the same browser gets the first
    // person's artists.
    show_dialog: "true",
  });
  return `${ACCOUNTS}/authorize?${p}`;
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number };

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const r = await fetch(`${ACCOUNTS}/api/token`, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
    }),
    cache: "no-store",
  });
  if (!r.ok) throw new SpotifyError(`Spotify code exchange failed (${r.status})`, r.status, (await r.text().catch(() => "")).slice(0, 240));
  return (await r.json()) as TokenResponse;
}

export async function getMe(accessToken: string): Promise<{ id: string; display_name?: string | null }> {
  return spFetch<{ id: string; display_name?: string | null }>("/me", accessToken);
}

// Returns a valid access token, refreshing when within 5 minutes of expiry.
// On refresh failure the connection is marked broken and null is returned.
export async function getUserAccessToken(db: Db, userId: string): Promise<string | null> {
  const [c] = await db.select().from(schema.spotifyConnections).where(eq(schema.spotifyConnections.userId, userId));
  if (!c || c.broken || !c.refreshToken) return null;
  if (c.accessToken && c.expiresAt && c.expiresAt.getTime() - Date.now() > 5 * 60_000) return c.accessToken;
  const r = await fetch(`${ACCOUNTS}/api/token`, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: c.refreshToken }),
    cache: "no-store",
  });
  if (!r.ok) {
    await db.update(schema.spotifyConnections).set({ broken: true }).where(eq(schema.spotifyConnections.userId, userId));
    return null;
  }
  const j = (await r.json()) as TokenResponse;
  await db
    .update(schema.spotifyConnections)
    .set({
      accessToken: j.access_token,
      refreshToken: j.refresh_token ?? c.refreshToken,
      expiresAt: new Date(Date.now() + j.expires_in * 1000),
    })
    .where(eq(schema.spotifyConnections.userId, userId));
  return j.access_token;
}

export async function fetchFollowedArtists(token: string, max = 100): Promise<Candidate[]> {
  const out: Candidate[] = [];
  let after: string | undefined;
  while (out.length < max) {
    const j = await spFetch<{ artists: { items: SpArtist[]; cursors?: { after?: string } } }>(
      `/me/following?type=artist&limit=50${after ? `&after=${after}` : ""}`,
      token,
    );
    out.push(...j.artists.items.map(toCandidate));
    after = j.artists.cursors?.after;
    if (!after || j.artists.items.length === 0) break;
  }
  return out.slice(0, max);
}

// Spotify's "top artists" depends on recent listening: medium_term (about 6 months) can be nearly empty for a light or
// new listener, while long_term still has plenty. Read all three windows and merge them, longest history first.
export async function fetchTopArtists(token: string, max = 100): Promise<Candidate[]> {
  const ranges = ["long_term", "medium_term", "short_term"] as const;
  const lists = await Promise.all(
    ranges.map((range) =>
      spFetch<{ items: SpArtist[] }>(`/me/top/artists?limit=50&time_range=${range}`, token)
        .then((j) => j.items.map(toCandidate))
        .catch((e) => {
          if (e instanceof SpotifyError && e.status === 403) throw e;
          return [] as Candidate[]; // one window failing must not lose the others
        }),
    ),
  );
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const c of lists.flat()) if (c.spotifyId && !seen.has(c.spotifyId)) (seen.add(c.spotifyId), out.push(c));
  return out.slice(0, max);
}
