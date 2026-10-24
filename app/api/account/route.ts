import { eq } from "drizzle-orm";
import { schema } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/session";

// Delete account: user row and everything that cascades from it (artists list, alerts, sessions, Spotify link).
export async function DELETE(req: Request) {
  const ctx = await requireUser();
  if (!ctx) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as { confirm?: string };
  if (body.confirm !== "DELETE") return Response.json({ error: "Type DELETE to confirm" }, { status: 400 });
  if (ctx.user.isOwner) return Response.json({ error: "The owner account can't be deleted here" }, { status: 403 });
  await ctx.db.delete(schema.users).where(eq(schema.users.id, ctx.user.id));
  return Response.json({ ok: true });
}
