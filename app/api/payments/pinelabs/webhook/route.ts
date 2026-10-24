import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { verifyWebhook } from "@/lib/pinelabs";

// Pine Labs payment result. Verified by signature, idempotent by event id. Does nothing unless payments are enabled and configured.
export async function POST(req: Request) {
  if (process.env.PAYMENTS_ENABLED !== "true") return Response.json({ ok: true, ignored: true });
  const raw = await req.text();
  if (!verifyWebhook(raw, req.headers.get("x-verify") ?? req.headers.get("x-signature"))) return Response.json({ error: "Forbidden" }, { status: 401 });
  const b = JSON.parse(raw || "{}") as { event_id?: string; id?: string; order_id?: string; merchant_order_reference?: string; status?: string };
  const eventId = b.event_id ?? b.id ?? `${b.order_id}:${b.status}`;
  const db = getDb();
  const ins = await db.insert(schema.paymentEvents).values({ provider: "pinelabs", eventId, payload: b }).onConflictDoNothing().returning();
  if (!ins.length) return Response.json({ ok: true, duplicate: true });
  const paid = /paid|success|captured|processed/i.test(b.status ?? "");
  const ref = b.merchant_order_reference;
  if (ref) {
    const [sub] = await db.update(schema.subscriptions).set({ status: paid ? "active" : "failed", currentPeriodEnd: paid ? new Date(Date.now() + 30 * 24 * 3600 * 1000) : null }).where(eq(schema.subscriptions.id, ref)).returning();
    if (sub && paid) await db.update(schema.users).set({ plan: sub.plan }).where(eq(schema.users.id, sub.userId));
  }
  return Response.json({ ok: true });
}
