import { eq, inArray } from "drizzle-orm";
import { schema } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/session";
import * as spotify from "@/lib/identity/spotify";
import * as mb from "@/lib/identity/musicbrainz";

// Spotify first (photos, genres); MusicBrainz only when Spotify finds nothing.
export async function GET(req: Request) {
  const ctx = await requireUser();
  if (!ctx) return unauthorized();
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return Response.json({ candidates: [] });

  try {
    let candidates = await spotify.searchArtists(q);
    let source: "spotify" | "musicbrainz" = "spotify";
    if (!candidates.length && q.length >= 3) {
      candidates = (await mb.searchArtists(q)).map(({ score: _s, ...c }) => c);
      source = "musicbrainz";
    }
    const mine = await ctx.db
      .select({ spotifyId: schema.artists.spotifyId, mbid: schema.artists.mbid })
      .from(schema.userArtists)
      .innerJoin(schema.artists, eq(schema.artists.id, schema.userArtists.artistId))
      .where(eq(schema.userArtists.userId, ctx.user.id));
    const have = new Set(mine.flatMap((m) => [m.spotifyId, m.mbid]).filter(Boolean));
    return Response.json({
      source,
      candidates: candidates.map((c) => ({ ...c, alreadyAdded: have.has(c.spotifyId ?? c.mbid ?? "") })),
    });
  } catch {
    return Response.json({ error: "Search is having trouble right now. Try again, or paste your artists instead." }, { status: 502 });
  }
}
