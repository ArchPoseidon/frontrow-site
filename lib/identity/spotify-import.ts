import { schema, type Db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { addUserArtists, upsertSpotifyArtists } from "./artists";
import { fetchFollowedArtists, fetchTopArtists, getUserAccessToken, SpotifyError } from "./spotify";

export type ImportResult =
  | { ok: true; followed: number; top: number; newArtistIds: string[]; warnings: string[] }
  | { ok: false; reason: "not_connected" | "broken" | "forbidden" | "error"; message: string };

// One-click import of followed + top artists. Every Spotify-sourced artist is `verified`.
export async function importFromSpotify(db: Db, userId: string): Promise<ImportResult> {
  const token = await getUserAccessToken(db, userId);
  if (!token) {
    const [c] = await db.select().from(schema.spotifyConnections).where(eq(schema.spotifyConnections.userId, userId));
    return c?.broken
      ? { ok: false, reason: "broken", message: "Your Spotify connection needs to be reconnected." }
      : { ok: false, reason: "not_connected", message: "Connect Spotify first." };
  }
  const warnings: string[] = [];
  let followed: Awaited<ReturnType<typeof fetchFollowedArtists>> = [];
  let top: Awaited<ReturnType<typeof fetchTopArtists>> = [];
  try {
    followed = await fetchFollowedArtists(token);
  } catch (e) {
    if (e instanceof SpotifyError && e.status === 403) return { ok: false, reason: "forbidden", message: "Spotify import is invite-only during beta." };
    warnings.push("Couldn't read followed artists from Spotify.");
  }
  try {
    top = await fetchTopArtists(token);
  } catch (e) {
    if (e instanceof SpotifyError && e.status === 403) return { ok: false, reason: "forbidden", message: "Spotify import is invite-only during beta." };
    warnings.push("Couldn't read top artists from Spotify.");
  }
  if (!followed.length && !top.length && warnings.length) return { ok: false, reason: "error", message: warnings.join(" ") };

  const upserted = await upsertSpotifyArtists(db, [...followed, ...top]);
  const idOf = (c: { spotifyId?: string }) => upserted.get(c.spotifyId!)!.artist.id;
  await addUserArtists(db, userId, followed.map(idOf), "spotify_followed");
  await addUserArtists(db, userId, top.map(idOf), "spotify_top");
  const newArtistIds = [...upserted.values()].filter((u) => u.isNew).map((u) => u.artist.id);
  return { ok: true, followed: followed.length, top: top.length, newArtistIds, warnings };
}
