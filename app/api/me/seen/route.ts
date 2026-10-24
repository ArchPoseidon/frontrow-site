import { and, eq, isNull, lt, or } from "drizzle-orm";
import { schema } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/session";

// "Last seen" for the admin's active-user counts. Touched at most once per 10 minutes per user.
export async function POST() {
  const u = await requireUser();
  if (!u) return unauthorized();
  await u.db.update(schema.users).set({ lastSeenAt: new Date() }).where(and(eq(schema.users.id, u.user.id), or(isNull(schema.users.lastSeenAt), lt(schema.users.lastSeenAt, new Date(Date.now() - 10 * 60_000)))));
  return Response.json({ ok: true });
}
