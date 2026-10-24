"use client";

import Link from "next/link";
import { useState } from "react";
import { ArtistPhoto } from "@/components/artist/ArtistPhoto";
import type { ArtistView } from "@/components/event-card/types";

const NEXT = { follow: "must_see", must_see: "muted", muted: "follow" } as const;
const LABEL = { follow: "Follow", must_see: "Must-see", muted: "Muted" } as const;

// Every artist as a photo card. Tap to cycle Follow, Must-see, Muted.
export function ProfileArtists({ artists: initial }: { artists: ArtistView[] }) {
  const [artists, setArtists] = useState(initial);
  const [all, setAll] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const shown = all ? artists : artists.slice(0, 12);

  async function cycle(a: ArtistView) {
    const next = NEXT[a.priority];
    setArtists((as) => as.map((x) => (x.id === a.id ? { ...x, priority: next } : x)));
    const r = await fetch("/api/artists", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ artistId: a.id, priority: next }) }).catch(() => null);
    if (!r?.ok) {
      setArtists((as) => as.map((x) => (x.id === a.id ? { ...x, priority: a.priority } : x)));
      setErr("Couldn't change that artist. Try again.");
    }
  }

  return (
    <div className="space-y-3">
      {err && <p role="alert" className="rounded-card border border-urgency-red/60 px-3 py-2 text-sm">{err}</p>}
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {shown.map((a) => (
          <li key={a.id}>
            <button onClick={() => cycle(a)} aria-label={`${a.name}: ${LABEL[a.priority]}. Tap to change.`} className={`group relative block aspect-square w-full overflow-hidden rounded-card border-2 ${a.priority === "must_see" ? "border-accent" : "border-transparent"} ${a.priority === "muted" ? "opacity-40" : ""}`}>
              <ArtistPhoto name={a.name} imageUrl={a.imageUrl} rounded={false} />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-1.5 pt-6 pb-1.5 text-left">
                <span className="block truncate text-[11px] font-bold">{a.name}</span>
                <span className="block text-[10px] text-white/70">{a.priority === "must_see" ? "Must-see" : a.priority === "muted" ? "Muted" : a.upcomingCount > 0 ? `${a.upcomingCount} upcoming` : "Following"}</span>
              </span>
              {a.identityStatus === "unverified" && <span className="absolute top-1 left-1 rounded bg-black/70 px-1 text-[9px]">Name only</span>}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between">
        {artists.length > 12 ? (
          <button onClick={() => setAll((v) => !v)} className="text-sm text-muted underline underline-offset-2">{all ? "Show fewer" : `Show all ${artists.length}`}</button>
        ) : <span />}
        <Link href="/onboarding?manage=1" className="rounded-card bg-accent px-4 py-2 text-sm font-bold text-accent-foreground">+ Add more artists</Link>
      </div>
    </div>
  );
}
