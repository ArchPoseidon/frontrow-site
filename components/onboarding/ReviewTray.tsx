"use client";

import { useState } from "react";
import { ArtistAvatar } from "@/components/artist/ArtistAvatar";
import type { Candidate, ReviewItem } from "@/components/artist/types";

type Props = {
  items: ReviewItem[];
  onPick: (item: ReviewItem, c: Candidate) => Promise<void>;
  onAsTyped: (item: ReviewItem) => Promise<void>;
  onRemove: (item: ReviewItem) => Promise<void>;
};

// "Which one?" picker. Onboarding can't finish while this tray has items.
export function ReviewTray({ items, onPick, onAsTyped, onRemove }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!items.length) return null;

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-label="Confirm these artists" className="rounded-card border border-urgency-amber/60 bg-surface p-4">
      <h2 className="text-lg font-semibold">Confirm these {items.length}</h2>
      <p className="mb-4 text-sm text-muted">We found more than one match. Pick the right artist so your alerts are accurate.</p>
      <ul className="flex flex-col gap-6">
        {items.map((item) => (
          <li key={item.candidateId} className="flex flex-col gap-3">
            <p className="text-sm">
              You entered <span className="font-medium">“{item.inputText}”</span>. Which one?
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {item.candidates.slice(0, 6).map((c) => {
                const key = `${item.candidateId}:${c.spotifyId ?? c.mbid}`;
                return (
                  <button
                    key={key}
                    disabled={busy !== null}
                    onClick={() => run(key, () => onPick(item, c))}
                    className="flex items-center gap-3 rounded-card border border-surface-border p-2 text-left transition hover:border-accent disabled:opacity-50"
                  >
                    <ArtistAvatar name={c.name} imageUrl={c.imageUrl} size={48} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{c.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {c.genres?.length ? c.genres.slice(0, 3).join(", ") : c.hint ?? (c.source === "musicbrainz" ? "From MusicBrainz" : "No genre info")}
                      </span>
                    </span>
                    {busy === key && <span className="ml-auto text-xs text-muted">Adding…</span>}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-4 text-sm">
              <button disabled={busy !== null} onClick={() => run(`${item.candidateId}:typed`, () => onAsTyped(item))} className="text-muted underline underline-offset-2 hover:text-foreground disabled:opacity-50">
                None of these, add as typed
              </button>
              <button disabled={busy !== null} onClick={() => run(`${item.candidateId}:rm`, () => onRemove(item))} className="text-muted underline underline-offset-2 hover:text-foreground disabled:opacity-50">
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
