import { eq } from "drizzle-orm";
import { schema } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/session";

// "Use a different Spotify account": forget this user's Spotify link. Artists already imported stay on their list.
export async function POST() {
  const ctx = await requireUser();
  if (!ctx) return unauthorized();
  await ctx.db.delete(schema.spotifyConnections).where(eq(schema.spotifyConnections.userId, ctx.user.id));
  return Response.json({ ok: true });
}
