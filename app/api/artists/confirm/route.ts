import { after } from "next/server";
import { z } from "zod";
import { requireUser, unauthorized } from "@/lib/session";
import { addFromSearchPick, confirmCandidate } from "@/lib/identity/resolve";
import { enrichArtists } from "@/lib/identity/artists";

export const maxDuration = 60;

const Pick = z.object({ spotifyId: z.string().max(40).optional(), mbid: z.string().max(40).optional() }).refine((p) => p.spotifyId || p.mbid);
const Body = z.union([
  z.object({ candidateId: z.string().uuid(), pick: Pick }),
  z.object({ candidateId: z.string().uuid(), asTyped: z.literal(true) }),
  z.object({ candidateId: z.string().uuid(), remove: z.literal(true) }),
  z.object({ pick: Pick, via: z.literal("search") }), // a pick straight from typed search
]);

export async function POST(req: Request) {
  const ctx = await requireUser();
  if (!ctx) return unauthorized();
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const b = body.data;

  if ("via" in b) {
    const r = await addFromSearchPick(ctx.db, ctx.user.id, b.pick);
    if (!r) return Response.json({ error: "Couldn't find that artist" }, { status: 404 });
    if (r.isNew) after(() => enrichArtists(ctx.db, [r.artist.id]));
    return Response.json(r);
  }
  const action = "pick" in b ? { pick: b.pick } : "asTyped" in b ? { asTyped: true as const } : { remove: true as const };
  const r = await confirmCandidate(ctx.db, ctx.user.id, b.candidateId, action);
  if (!r.ok) return Response.json({ error: r.error }, { status: 409 });
  if (r.artist) after(() => enrichArtists(ctx.db, [r.artist!.id]));
  return Response.json({ artist: r.artist });
}
