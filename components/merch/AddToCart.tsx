"use client";

import Link from "next/link";
import { useState } from "react";
import type { Variant } from "@/lib/data/merch";

export function AddToCart({ variants }: { variants: Variant[] }) {
  const first = variants.find((v) => v.stock > 0)?.id ?? null;
  const [sel, setSel] = useState<string | null>(first);
  const [state, setState] = useState<"idle" | "busy" | "added" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function add() {
    if (!sel) return;
    setState("busy");
    const r = await fetch("/api/cart", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ variantId: sel, qty: 1 }) }).catch(() => null);
    if (r?.ok) setState("added");
    else {
      setState("error");
      setMsg((await r?.json().catch(() => ({})))?.error ?? "Couldn't add that. Try again.");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Size">
        {variants.map((v) => (
          <button key={v.id} onClick={() => setSel(v.id)} disabled={v.stock < 1} aria-pressed={sel === v.id} className={`min-w-12 rounded-card border px-3 py-2 text-sm ${v.stock < 1 ? "line-through opacity-40" : sel === v.id ? "border-accent bg-accent font-bold text-accent-foreground" : "border-surface-border"}`}>
            {v.size === "Free" ? "Free size" : v.size ?? "One size"}
          </button>
        ))}
      </div>
      <button onClick={add} disabled={!sel || state === "busy"} className="w-full rounded-card bg-accent px-5 py-3 font-bold text-accent-foreground disabled:opacity-50">
        {state === "busy" ? "Adding…" : !first ? "Sold out" : "Add to cart"}
      </button>
      {state === "added" && <p role="status" className="text-sm">Added. <Link href="/cart" className="underline">View cart</Link></p>}
      {state === "error" && <p role="alert" className="text-sm text-urgency-red">{msg}</p>}
    </div>
  );
}
