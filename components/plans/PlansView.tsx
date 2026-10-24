"use client";

import Link from "next/link";
import { useState } from "react";
import type { Plan } from "@/lib/plans";

// Plans page. Free is always available; Plus is a waitlist until payments are switched on.
export function PlansView({ plans, current, paymentsOn, onboarding }: { plans: Plan[]; current: string; paymentsOn: boolean; onboarding?: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [plan, setPlan] = useState(current);

  async function choose(id: Plan["id"]) {
    setBusy(id);
    setMsg(null);
    const r = await fetch("/api/plans/choose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: id }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(null);
    if (!r?.ok) return setMsg(j.error ?? "Couldn't do that right now.");
    if (j.checkoutUrl) return void window.location.assign(j.checkoutUrl);
    if (id === "free") {
      setPlan("free");
      if (onboarding) return void window.location.assign("/radar?welcome=1");
    }
    setMsg(j.message ?? "Saved.");
  }

  return (
    <div className="space-y-5">
      <ul className="grid gap-4 sm:grid-cols-2">
        {plans.map((p) => (
          <li key={p.id} className={`flex flex-col gap-3 rounded-card border-2 p-5 ${plan === p.id ? "border-accent" : "border-surface-border"} bg-surface/80`}>
            <div>
              <h2 className="font-display text-4xl font-extrabold">{p.name}</h2>
              <p className="text-sm text-muted">{p.blurb}</p>
            </div>
            <p className="font-display text-3xl font-extrabold">{p.priceInr === 0 ? "Free" : paymentsOn ? `₹${p.priceInr}/month` : "Coming soon"}</p>
            <ul className="flex-1 space-y-1 text-sm">{p.features.map((f) => <li key={f}>✓ {f}</li>)}</ul>
            <button onClick={() => choose(p.id)} disabled={busy === p.id || (p.id === "free" && plan === "free" && !onboarding)} className="rounded-card bg-accent px-4 py-2.5 font-bold text-accent-foreground disabled:opacity-50">
              {p.id === "free" ? (onboarding ? "Continue free" : plan === "free" ? "Your plan" : "Switch to Free") : paymentsOn ? "Choose Plus" : "Join the waitlist"}
            </button>
          </li>
        ))}
      </ul>
      {msg && <p role="status" className="rounded-card border border-surface-border px-4 py-3 text-sm">{msg}</p>}
      {onboarding && <p className="text-center text-sm text-muted">You can change this any time under <Link href="/profile" className="underline">Profile</Link>.</p>}
    </div>
  );
}
