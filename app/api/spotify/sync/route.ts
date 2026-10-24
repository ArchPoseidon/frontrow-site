import { after } from "next/server";
import { requireUser, unauthorized } from "@/lib/session";
import { importFromSpotify } from "@/lib/identity/spotify-import";
import { enrichArtists } from "@/lib/identity/artists";
import { startBackgroundScan } from "@/lib/brain/scan";

export const maxDuration = 60;

export async function POST() {
  const ctx = await requireUser();
  if (!ctx) return unauthorized();
  const r = await importFromSpotify(ctx.db, ctx.user.id);
  if (!r.ok) return Response.json({ error: r.message, reason: r.reason }, { status: r.reason === "forbidden" ? 403 : 400 });
  after(async () => {
    await startBackgroundScan(ctx.db, ctx.user.id).catch((e) => console.error("background scan", e));
    await enrichArtists(ctx.db, r.newArtistIds);
  });
  return Response.json({ followed: r.followed, top: r.top, warnings: r.warnings });
}
