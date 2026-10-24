import { and, eq } from "drizzle-orm";
import { schema } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/session";

// Disconnect Google Calendar: revoke the grant at Google (best effort) and forget the tokens.
// Shows already added stay in the FrontRow calendar and in Google Calendar.
export async function POST() {
  const u = await requireUser();
  if (!u) return unauthorized();
  const [a] = await u.db.select().from(schema.accounts).where(and(eq(schema.accounts.userId, u.user.id), eq(schema.accounts.provider, "google")));
  const token = a?.refresh_token ?? a?.access_token;
  if (token) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST", signal: AbortSignal.timeout(8000) }).catch(() => {});
  if (a) await u.db.update(schema.accounts).set({ scope: "openid email profile", access_token: null, refresh_token: null, expires_at: null }).where(and(eq(schema.accounts.provider, "google"), eq(schema.accounts.providerAccountId, a.providerAccountId)));
  return Response.json({ ok: true });
}
