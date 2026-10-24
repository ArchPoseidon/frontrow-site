"use client";

import Link from "next/link";
import { useState } from "react";
import { inr } from "./ProductCard";

export type CartLine = { variantId: string; productId: string; name: string; size: string | null; priceInr: number; qty: number };

export function CartView({ lines: initial }: { lines: CartLine[] }) {
  const [lines, setLines] = useState(initial);
  const [note, setNote] = useState<string | null>(null);
  const total = lines.reduce((n, l) => n + l.priceInr * l.qty, 0);

  async function remove(id: string) {
    setLines((ls) => ls.filter((l) => l.variantId !== id));
    await fetch(`/api/cart?variantId=${id}`, { method: "DELETE" }).catch(() => {});
  }
  async function checkout() {
    const r = await fetch("/api/cart", { method: "PUT" }).then((x) => x.json()).catch(() => null);
    setNote(r?.paymentsEnabled ? "Checkout is being set up." : "Checkout opens soon. We've noted your interest and will let you know.");
  }

  if (!lines.length) return <p className="rounded-card border border-dashed border-surface-border p-10 text-center text-sm text-muted">Your cart is empty. <Link href="/merch" className="underline">Browse merch</Link></p>;
  return (
    <div className="space-y-4">
      <ul className="divide-y divide-surface-border rounded-card border border-surface-border bg-surface/80">
        {lines.map((l) => (
          <li key={l.variantId} className="flex items-center gap-3 p-3">
            <div className="flex-1">
              <Link href={`/merch/${l.productId}`} className="font-medium underline-offset-2 hover:underline">{l.name}</Link>
              <p className="text-xs text-muted">{l.size === "Free" ? "Free size" : l.size ?? "One size"} · qty {l.qty}</p>
            </div>
            <span className="font-display text-xl font-extrabold">{inr(l.priceInr * l.qty)}</span>
            <button onClick={() => remove(l.variantId)} aria-label={`Remove ${l.name}`} className="text-muted">✕</button>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">Total</span>
        <span className="font-display text-3xl font-extrabold">{inr(total)}</span>
      </div>
      <button onClick={checkout} className="w-full rounded-card bg-accent px-5 py-3 font-bold text-accent-foreground">Checkout</button>
      {note && <p role="status" className="rounded-card border border-surface-border px-4 py-3 text-sm">{note}</p>}
    </div>
  );
}
