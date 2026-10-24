import { Suspense } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { listProducts, merchArtists, priceBounds, type MerchFilters as F } from "@/lib/data/merch";
import { AppHeader } from "@/components/AppHeader";
import { MerchFilters } from "@/components/merch/MerchFilters";
import { ProductCard } from "@/components/merch/ProductCard";
import Link from "next/link";

type SP = Promise<{ artist?: string; min?: string; max?: string; size?: string; sort?: string }>;
const num = (s?: string) => (s && /^\d+$/.test(s) ? Number(s) : undefined);

async function Loaded({ searchParams }: { searchParams: SP }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const db = getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, session.user.id));
  if (!u) redirect("/");
  const sp = await searchParams;
  const f: F = {
    artistIds: (sp.artist ?? "").split(",").filter((x) => /^[0-9a-f-]{36}$/i.test(x)),
    min: num(sp.min),
    max: num(sp.max),
    sizes: (sp.size ?? "").split(",").filter((s) => ["S", "M", "L", "XL", "Free"].includes(s)),
    sort: sp.sort === "price_asc" || sp.sort === "price_desc" ? sp.sort : "new",
  };
  const [products, artists, bounds] = await Promise.all([listProducts(db, f), merchArtists(db), priceBounds(db)]);
  return (
    <>
      <AppHeader name={u.name} image={u.image} />
      <main className="mx-auto w-full max-w-5xl px-4 pt-6 pb-28 sm:pb-12">
        <div className="mb-5 flex items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-6xl leading-[0.9] font-black">Merch</h1>
            <p className="text-sm text-muted">Demo store: items below are samples to show how artist merch will work.</p>
          </div>
          <Link href="/cart" className="rounded-card border border-surface-border px-4 py-2 text-sm font-bold">Cart</Link>
        </div>
        <div className="grid gap-5 md:grid-cols-[16rem_1fr]">
          <Suspense fallback={<div className="h-64 animate-pulse rounded-card bg-surface-border" />}>
            <MerchFilters artists={artists} bounds={bounds} />
          </Suspense>
          <section aria-live="polite">
            <p className="mb-3 text-sm text-muted">{products.length} item{products.length === 1 ? "" : "s"}</p>
            {products.length === 0 ? (
              <p className="rounded-card border border-dashed border-surface-border p-10 text-center text-sm text-muted">Nothing matches those filters. Try clearing one.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3">{products.map((p) => <li key={p.id}><ProductCard p={p} /></li>)}</ul>
            )}
          </section>
        </div>
      </main>
    </>
  );
}

export default function Merch({ searchParams }: { searchParams: SP }) {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-5xl px-4 py-6"><div className="h-72 animate-pulse rounded-card bg-surface-border" /></main>}>
      <Loaded searchParams={searchParams} />
    </Suspense>
  );
}
