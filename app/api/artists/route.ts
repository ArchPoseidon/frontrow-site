import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/session";
import { readCandidates, reopenArtist } from "@/lib/identity/resolve";

// The user's watchlist plus any open "Which one?" choices.
export async function GET() {
  const ctx = await requireUser();
  if (!ctx) return unauthorized();
  const [list, open] = await Promise.all([
    ctx.db
      .select({
        id: schema.artists.id,
        name: schema.artists.name,
        imageUrl: schema.artists.imageUrl,
        genres: schema.artists.genres,
        origin: schema.artists.origin,
        identityStatus: schema.artists.identityStatus,
        lastIndiaShow: schema.artists.lastIndiaShow,
        lastCheckedAt: schema.artists.lastCheckedAt,
        upcomingCount: schema.artists.upcomingCount,
        priority: schema.userArtists.priority,
        addedVia: schema.userArtists.addedVia,
      })
      .from(schema.userArtists)
      .innerJoin(schema.artists, eq(schema.artists.id, schema.userArtists.artistId))
      .where(eq(schema.userArtists.userId, ctx.user.id))
      .orderBy(schema.artists.name),
    ctx.db
      .select()
      .from(schema.artistCandidates)
      .where(and(eq(schema.artistCandidates.userId, ctx.user.id), eq(schema.artistCandidates.status, "open"))),
  ]);
  return Response.json({
    artists: list,
    review: open.map((o) => ({ candidateId: o.id, inputText: o.inputText, candidates: readCandidates(o.candidates).items })),
  });
}

const Patch = z.union([
  z.object({ artistId: z.string().uuid(), priority: z.enum(["must_see", "follow", "muted"]) }),
  z.object({ artistId: z.string().uuid(), reopen: z.literal(true) }),
]);

export async function PATCH(req: Request) {
  const ctx = await requireUser();
  if (!ctx) return unauthorized();
  const body = Patch.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const b = body.data;
  if ("reopen" in b) {
    const r = await reopenArtist(ctx.db, ctx.user.id, b.artistId);
    if (!r || !r.candidateId) return Response.json({ error: "No other matches found for this artist" }, { status: 404 });
    return Response.json({ review: r });
  }
  const rows = await ctx.db
    .update(schema.userArtists)
    .set({ priority: b.priority })
    .where(and(eq(schema.userArtists.userId, ctx.user.id), eq(schema.userArtists.artistId, b.artistId)))
    .returning();
  if (!rows.length) return Response.json({ error: "Artist not on your list" }, { status: 404 });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const ctx = await requireUser();
  if (!ctx) return unauthorized();
  const artistId = z.string().uuid().safeParse(new URL(req.url).searchParams.get("artistId"));
  if (!artistId.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  await ctx.db
    .delete(schema.userArtists)
    .where(and(eq(schema.userArtists.userId, ctx.user.id), eq(schema.userArtists.artistId, artistId.data)));
  return Response.json({ ok: true });
}
