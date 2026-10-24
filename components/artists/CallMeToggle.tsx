"use client";

import Link from "next/link";
import { useState } from "react";

// "Call me when tickets drop" for one artist. The phone number and consent live on the radar's Call me section.
export function CallMeToggle({ artistId, initial }: { artistId: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  async function flip() {
    const next = !on;
    setOn(next);
    const r = await fetch(`/api/artists/${artistId}/call`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ callMe: next }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) {
      setOn(!next);
      setMsg(j.error ?? "Couldn't change that.");
    } else setMsg(next ? (j.needsPhone ? "Add your phone number and consent in the Call me section on your radar to start calls." : "We'll call you when tickets for this artist go live.") : null);
  }
  return (
    <div className="space-y-1">
      <button onClick={flip} aria-pressed={on} className={`rounded-card border px-4 py-2 text-sm font-bold ${on ? "border-accent bg-accent text-accent-foreground" : "border-surface-border"}`}>
        {on ? "📞 Call me: on" : "📞 Call me when tickets drop"}
      </button>
      {msg && <p role="status" className="text-xs text-muted">{msg} <Link href="/radar#call-me" className="underline">Open Call me</Link></p>}
    </div>
  );
}
