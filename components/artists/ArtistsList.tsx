"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArtistPhoto } from "@/components/artist/ArtistPhoto";
import type { ArtistView } from "@/components/event-card/types";
import { SearchBox } from "@/components/shows/filters";

const LABEL = { must_see: "Must-see", follow: "Following", muted: "Muted" } as const;

// "Your artists": everyone the user follows, searchable; each card opens the artist's page (news, shows, merch).
export function ArtistsList({ artists }: { artists: ArtistView[] }) {
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<"all" | "must_see" | "upcoming">("all");
  const shown = useMemo(
    () => artists.filter((a) => a.name.toLowerCase().includes(q.trim().toLowerCase()) && (only === "all" || (only === "must_see" ? a.priority === "must_see" : a.upcomingCount > 0))),
    [artists, q, only],
  );
  return (
    <div className="flex flex-col gap-4">
      <SearchBox value={q} onChange={setQ} placeholder="Search your artists" />
      <div className="flex gap-2" role="group" aria-label="Filter artists">
        {([["all", `All ${artists.length}`], ["must_see", "Must-see"], ["upcoming", "With shows"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setOnly(k)} aria-pressed={only === k} className={`rounded-full border px-3 py-1 text-sm ${only === k ? "border-accent bg-accent font-bold text-accent-foreground" : "border-surface-border"}`}>{label}</button>
        ))}
        <Link href="/onboarding?manage=1" className="ml-auto rounded-full bg-accent px-3 py-1 text-sm font-bold text-accent-foreground">+ Add</Link>
      </div>
      {shown.length === 0 ? (
        <p className="rounded-card border border-dashed border-surface-border p-8 text-center text-sm text-muted">{artists.length ? "No artists match that." : "You don't follow anyone yet."}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {shown.map((a) => (
            <li key={a.id}>
              <Link href={`/artists/${a.id}`} className={`group relative block aspect-square overflow-hidden rounded-card border-2 ${a.priority === "must_see" ? "border-accent" : "border-transparent"} ${a.priority === "muted" ? "opacity-50" : ""}`}>
                <ArtistPhoto name={a.name} imageUrl={a.imageUrl} rounded={false} />
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-2 pt-8 pb-2">
                  <span className="font-display block truncate text-xl leading-none font-extrabold">{a.name}</span>
                  <span className="block text-[11px] text-white/75">{a.upcomingCount > 0 ? `${a.upcomingCount} upcoming in India` : LABEL[a.priority]}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
