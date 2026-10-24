import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/session";
import { track } from "@/lib/track";

export async function GET() {
  const u = await requireUser();
  if (!u) return unauthorized();
  const rows = await u.db.select({ qty: schema.cartItems.qty }).from(schema.cartItems).where(eq(schema.cartItems.userId, u.user.id));
  return Response.json({ count: rows.reduce((n, r) => n + r.qty, 0) });
}

const Add = z.object({ variantId: z.string().uuid(), qty: z.number().int().min(1).max(10).default(1) });

export async function POST(req: Request) {
  const u = await requireUser();
  if (!u) return unauthorized();
  const b = Add.safeParse(await req.json().catch(() => null));
  if (!b.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const [v] = await u.db.select().from(schema.merchVariants).where(eq(schema.merchVariants.id, b.data.variantId));
  if (!v || (v.stock ?? 0) < 1) return Response.json({ error: "That size is out of stock" }, { status: 409 });
  await u.db
    .insert(schema.cartItems)
    .values({ userId: u.user.id, variantId: v.id, qty: b.data.qty })
    .onConflictDoUpdate({ target: [schema.cartItems.userId, schema.cartItems.variantId], set: { qty: Math.min(10, b.data.qty) } });
  await track(u.db, "cart_add", u.user.id, { product: v.productId });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const u = await requireUser();
  if (!u) return unauthorized();
  const id = z.string().uuid().safeParse(new URL(req.url).searchParams.get("variantId"));
  if (!id.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  await u.db.delete(schema.cartItems).where(and(eq(schema.cartItems.userId, u.user.id), eq(schema.cartItems.variantId, id.data)));
  return Response.json({ ok: true });
}

// "Checkout opens soon": records interest only. No payment happens until PAYMENTS_ENABLED is on.
export async function PUT() {
  const u = await requireUser();
  if (!u) return unauthorized();
  await track(u.db, "checkout_interest", u.user.id);
  return Response.json({ ok: true, paymentsEnabled: process.env.PAYMENTS_ENABLED === "true" });
}
