import { after } from "next/server";
import { z } from "zod";
import { requireUser, unauthorized } from "@/lib/session";
import { resolveInputs } from "@/lib/identity/resolve";
import { enrichArtists } from "@/lib/identity/artists";
import { startBackgroundScan } from "@/lib/brain/scan";

export const maxDuration = 60;

const Body = z.object({ inputs: z.union([z.string().min(1).max(8000), z.array(z.string().max(300)).max(100)]) });

// Bulk: names, Spotify links or IDs -> resolved / needsReview / unverified / failed.
export async function POST(req: Request) {
  const ctx = await requireUser();
  if (!ctx) return unauthorized();
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Paste some artist names or Spotify links" }, { status: 400 });

  const result = await resolveInputs(ctx.db, ctx.user.id, body.data.inputs);
  after(async () => {
    // A pasted list is a bulk add: start the first scan now.
    if (result.resolved.length >= 3) await startBackgroundScan(ctx.db, ctx.user.id).catch((e) => console.error("background scan", e));
    await enrichArtists(ctx.db, result.newArtistIds);
  });
  const { newArtistIds: _n, ...rest } = result;
  return Response.json(rest);
}
