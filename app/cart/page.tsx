import { Suspense } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { AppHeader } from "@/components/AppHeader";
import { CartView } from "@/components/merch/CartView";

async function Loaded() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const db = getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, session.user.id));
  if (!u) redirect("/");
  const rows = await db
    .select({ variantId: schema.cartItems.variantId, qty: schema.cartItems.qty, size: schema.merchVariants.size, productId: schema.merchProducts.id, name: schema.merchProducts.name, priceInr: schema.merchProducts.priceInr })
    .from(schema.cartItems)
    .innerJoin(schema.merchVariants, eq(schema.merchVariants.id, schema.cartItems.variantId))
    .innerJoin(schema.merchProducts, eq(schema.merchProducts.id, schema.merchVariants.productId))
    .where(eq(schema.cartItems.userId, u.id));
  return (
    <>
      <AppHeader name={u.name} image={u.image} />
      <main className="mx-auto w-full max-w-2xl px-4 pt-6 pb-28 sm:pb-12">
        <h1 className="font-display mb-5 text-6xl leading-[0.9] font-black">Cart</h1>
        <CartView lines={rows} />
      </main>
    </>
  );
}

export default function Cart() {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-2xl px-4 py-6"><div className="h-48 animate-pulse rounded-card bg-surface-border" /></main>}>
      <Loaded />
    </Suspense>
  );
}
