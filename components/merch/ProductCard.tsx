import Link from "next/link";
import type { Product } from "@/lib/data/merch";

export const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export function ProductImage({ p, className = "" }: { p: Pick<Product, "name" | "imageUrl">; className?: string }) {
  if (p.imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={p.imageUrl} alt={p.name} loading="lazy" className={`h-full w-full object-cover ${className}`} />;
  }
  return <div aria-label={p.name} className={`flex h-full w-full items-center justify-center bg-surface-border font-display text-5xl font-extrabold text-muted ${className}`}>{p.name.slice(0, 1)}</div>;
}

export function ProductCard({ p }: { p: Product }) {
  const inStock = p.variants.some((v) => v.stock > 0);
  return (
    <Link href={`/merch/${p.id}`} className="group block overflow-hidden rounded-card border border-surface-border bg-surface/80">
      <div className="relative aspect-square">
        <ProductImage p={p} />
        {p.isDemo && <span className="absolute top-2 left-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold uppercase">Demo</span>}
        {!inStock && <span className="absolute top-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold uppercase">Sold out</span>}
      </div>
      <div className="p-3">
        <p className="truncate text-[11px] tracking-wider text-muted uppercase">{p.artistName ?? "FrontRow"}</p>
        <p className="truncate font-medium">{p.name}</p>
        <p className="font-display text-2xl leading-none font-extrabold">{inr(p.priceInr)}</p>
      </div>
    </Link>
  );
}
