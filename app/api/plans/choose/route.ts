import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/session";
import { PLANS, paymentsEnabled } from "@/lib/plans";
import { createOrder } from "@/lib/pinelabs";
import { track } from "@/lib/track";

const Body = z.object({ plan: z.enum(["free", "plus"]) });

// Choose a plan. Free is instant. Plus is a waitlist entry while payments are off; with payments on it starts a Pine Labs order.
export async function POST(req: Request) {
  const u = await requireUser();
  if (!u) return unauthorized();
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const plan = PLANS.find((p) => p.id === b.data.plan)!;
  if (plan.id === "free") {
    await u.db.update(schema.users).set({ plan: "free" }).where(eq(schema.users.id, u.user.id));
    await track(u.db, "plan_chosen", u.user.id, { plan: "free" });
    return Response.json({ ok: true, plan: "free" });
  }
  const [existing] = await u.db.select().from(schema.subscriptions).where(and(eq(schema.subscriptions.userId, u.user.id), eq(schema.subscriptions.plan, "plus"), eq(schema.subscriptions.status, "pending")));
  if (!paymentsEnabled()) {
    if (!existing) await u.db.insert(schema.subscriptions).values({ userId: u.user.id, plan: "plus", status: "pending", amountInr: plan.priceInr });
    await track(u.db, "plan_interest", u.user.id, { plan: "plus" });
    return Response.json({ ok: true, waitlist: true, message: "You're on the Plus waitlist. Nothing is charged." });
  }
  const sub = existing ?? (await u.db.insert(schema.subscriptions).values({ userId: u.user.id, plan: "plus", status: "pending", amountInr: plan.priceInr }).returning())[0];
  const order = await createOrder({ merchantOrderRef: sub.id, amountInr: plan.priceInr, returnUrl: `${process.env.APP_URL ?? ""}/plans?paid=1`, customerEmail: u.user.email });
  if (!order.ok) return Response.json({ error: order.error }, { status: 503 });
  await u.db.update(schema.subscriptions).set({ pinelabsOrderId: order.orderId }).where(eq(schema.subscriptions.id, sub.id));
  return Response.json({ ok: true, checkoutUrl: order.checkoutUrl });
}
