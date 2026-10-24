import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { getProduct } from "@/lib/data/merch";
import { AppHeader } from "@/components/AppHeader";
import { AddToCart } from "@/components/merch/AddToCart";
import { ProductImage, inr } from "@/components/merch/ProductCard";
import { track } from "@/lib/track";

async function Loaded({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const db = getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, session.user.id));
  if (!u) redirect("/");
  const { id } = await params;
  const p = await getProduct(db, id);
  if (!p) notFound();
  await track(db, "merch_viewed", u.id, { product: p.id });
  return (
    <>
      <AppHeader name={u.name} image={u.image} />
      <main className="mx-auto w-full max-w-4xl px-4 pt-6 pb-28 sm:pb-12">
        <Link href="/merch" className="text-sm text-muted underline underline-offset-2">← All merch</Link>
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <div className="aspect-square overflow-hidden rounded-card border border-surface-border"><ProductImage p={p} /></div>
          <div className="space-y-4">
            {p.artistId && <Link href={`/artists/${p.artistId}`} className="text-xs font-bold tracking-widest text-muted uppercase underline-offset-2 hover:underline">{p.artistName}</Link>}
            <h1 className="font-display text-5xl leading-[0.95] font-black">{p.name}</h1>
            <p className="font-display text-4xl font-extrabold">{inr(p.priceInr)}</p>
            {p.description && <p className="text-sm text-muted">{p.description}</p>}
            {p.isDemo && <p className="rounded-card border border-dashed border-surface-border px-3 py-2 text-xs text-muted">Demo item: this shows how artist merch will work. Checkout opens soon.</p>}
            <AddToCart variants={p.variants} />
          </div>
        </div>
      </main>
    </>
  );
}

export default function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-4xl px-4 py-6"><div className="h-72 animate-pulse rounded-card bg-surface-border" /></main>}>
      <Loaded params={params} />
    </Suspense>
  );
}
