"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArtistPhoto } from "@/components/artist/ArtistPhoto";
import { ConnectOverlay, ConnectSpotifyButton } from "@/components/spotify/ConnectSpotify";
import { SpotifyMark } from "@/components/spotify/SpotifyMark";
import { NEXT_PRIORITY, PRIORITY_LABEL, type Candidate, type MyArtist, type Priority, type ReviewItem } from "@/components/artist/types";
import { ReviewTray } from "./ReviewTray";
import { TouringNow } from "./TouringNow";
import { CitiesStep } from "./CitiesStep";
import { AlertsStep } from "./AlertsStep";

type Notice = { tone: "info" | "error" | "ok"; text: string } | null;

const SPOTIFY_NOTICES: Record<string, Notice> = {
  invite_only: { tone: "info", text: "This Spotify account isn't on our test list yet. Send us the email you use on Spotify and we'll add it, or search / paste your artists below (about a minute)." },
  state: { tone: "info", text: "That Spotify link expired or your browser blocked a cookie. Try Connect Spotify again, or search / paste your artists instead." },
  redirect: { tone: "error", text: "Spotify rejected our return address (a setup issue on our side, not yours). Search or paste your artists for now." },
  slow: { tone: "info", text: "Spotify is slow right now. Try again in a minute, or search / paste your artists instead." },
  imported: { tone: "ok", text: "Imported your followed and top artists from Spotify." },
  denied: { tone: "info", text: "Spotify connection was cancelled. You can search or paste artists instead." },
  error: { tone: "error", text: "Couldn't connect to Spotify. Search or paste your artists instead, or try again." },
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? "Something went wrong");
  return j as T;
}

export function ArtistsStep({ initialStep, spotifyFlag, spotifyCounts, spotifyAs, spotifyShared, manage }: { initialStep: number; spotifyFlag?: string; spotifyCounts?: { followed: number; top: number }; spotifyAs?: string; spotifyShared?: boolean; manage?: boolean }) {
  // Right after Spotify sends the user back with imported artists, play the importing animation for a beat.
  const [importing, setImporting] = useState(spotifyFlag === "imported");
  useEffect(() => {
    if (!importing) return;
    const t = setTimeout(() => setImporting(false), 3600);
    return () => clearTimeout(t);
  }, [importing]);
  // Artists and their confirmation are one page now (old saved step 2 maps to 1): artists, then cities, then alerts.
  const [step, setStep] = useState(() => {
    const n = Math.min(Math.max(initialStep, 1), 4);
    return n === 2 ? 1 : n;
  });
  const [artists, setArtists] = useState<MyArtist[] | null>(null);
  const [review, setReview] = useState<ReviewItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(() => {
    if (!spotifyFlag) return null;
    if (spotifyFlag === "imported" && spotifyCounts) {
      const { followed, top } = spotifyCounts;
      const parts = [`${followed} followed`, `${top} top`].join(" and ");
      return top === 0 && followed === 0
        ? { tone: "info", text: "Spotify connected, but it returned no followed or top artists yet. New accounts have little listening history. Search or paste a few artists to get started." }
        : spotifyShared
          ? { tone: "info", text: `Imported ${parts} artists from the Spotify account${spotifyAs ? ` "${spotifyAs}"` : ""}. That Spotify account is also linked to another FrontRow account. If it isn't yours, tap "Use a different Spotify account" below and pick yours on Spotify's screen.` }
          : { tone: top === 0 ? "info" : "ok", text: `Imported ${parts} artists from Spotify${spotifyAs ? ` account "${spotifyAs}"` : ""}.${top === 0 ? " Spotify returned no top artists yet (they build up with listening history)." : ""}` };
    }
    return SPOTIFY_NOTICES[spotifyFlag] ?? null;
  });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Candidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [resolving, setResolving] = useState(false);
  const [spotify, setSpotify] = useState<{ connected: boolean; broken: boolean; name?: string | null } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<{ artists: MyArtist[]; review: ReviewItem[] }>("/api/artists");
      setArtists(d.artists);
      setReview(d.review);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load your artists");
    }
  }, []);

  const loadSpotify = useCallback(async () => {
    try {
      const me = await api<{ spotify: { connected: boolean; broken: boolean } }>("/api/me");
      setSpotify(me.spotify);
    } catch {
      setSpotify({ connected: false, broken: false });
    }
  }, []);

  useEffect(() => {
    load();
    loadSpotify();
    if (spotifyFlag === "invite_only") searchRef.current?.focus();
  }, [load, loadSpotify, spotifyFlag]);

  // Live Spotify search, debounced 300 ms.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      setSearchError(null);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/artists/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Search failed");
        setResults(j.candidates);
        setSearchError(null);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setSearchError(e instanceof Error ? e.message : "Search failed");
      } finally {
        if (!ctl.signal.aborted) setSearching(false);
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [query]);

  const saveStep = (n: number) => {
    setStep(n);
    fetch("/api/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ onboardingStep: n }) }).catch(() => {});
  };

  const addFromSearch = async (c: Candidate) => {
    try {
      await api("/api/artists/confirm", { method: "POST", body: JSON.stringify({ via: "search", pick: { spotifyId: c.spotifyId, mbid: c.mbid } }) });
      setResults((rs) => rs?.map((x) => (x === c ? { ...x, alreadyAdded: true } : x)) ?? null);
      await load();
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Couldn't add that artist");
    }
  };

  const resolvePaste = async () => {
    setResolving(true);
    setNotice(null);
    try {
      const r = await api<{ resolved: unknown[]; needsReview: unknown[]; unverified: unknown[]; failed: { inputText: string; reason: string }[] }>(
        "/api/artists/resolve",
        { method: "POST", body: JSON.stringify({ inputs: pasteText }) },
      );
      const added = r.resolved.length + r.unverified.length;
      const parts = [`Added ${added} artist${added === 1 ? "" : "s"}`];
      if (r.needsReview.length) parts.push(`${r.needsReview.length} need${r.needsReview.length === 1 ? "s" : ""} your confirmation`);
      if (r.failed.length) parts.push(`${r.failed.length} couldn't be looked up (${r.failed.map((f) => f.inputText).join(", ")})`);
      setNotice({ tone: r.failed.length ? "error" : "ok", text: parts.join(". ") + "." });
      setPasteText("");
      await load();
    } catch (e) {
      setNotice({ tone: "error", text: e instanceof Error ? e.message : "Couldn't read that list" });
    } finally {
      setResolving(false);
    }
  };

  const resync = async () => {
    setSyncing(true);
    setNotice(null);
    try {
      const r = await api<{ followed: number; top: number }>("/api/spotify/sync", { method: "POST" });
      setNotice({ tone: "ok", text: `Re-imported from Spotify: ${r.followed} followed, ${r.top} top artists.` });
      await load();
    } catch (e) {
      setNotice({ tone: "error", text: e instanceof Error ? e.message : "Couldn't import from Spotify" });
      loadSpotify();
    } finally {
      setSyncing(false);
    }
  };

  const cyclePriority = async (a: MyArtist) => {
    const next: Priority = NEXT_PRIORITY[a.priority];
    setArtists((as) => as?.map((x) => (x.id === a.id ? { ...x, priority: next } : x)) ?? null);
    try {
      await api("/api/artists", { method: "PATCH", body: JSON.stringify({ artistId: a.id, priority: next }) });
    } catch {
      setArtists((as) => as?.map((x) => (x.id === a.id ? { ...x, priority: a.priority } : x)) ?? null);
    }
  };

  const remove = async (a: MyArtist) => {
    setArtists((as) => as?.filter((x) => x.id !== a.id) ?? null);
    try {
      await api(`/api/artists?artistId=${a.id}`, { method: "DELETE" });
    } catch {
      load();
    }
  };

  const reopen = async (a: MyArtist) => {
    try {
      await api("/api/artists", { method: "PATCH", body: JSON.stringify({ artistId: a.id, reopen: true }) });
      await load();
    } catch (e) {
      setNotice({ tone: "info", text: e instanceof Error ? e.message : "No other matches found" });
    }
  };

  const confirm = async (item: ReviewItem, body: object) => {
    await api("/api/artists/confirm", { method: "POST", body: JSON.stringify({ candidateId: item.candidateId, ...body }) });
    await load();
  };

  const count = artists?.length ?? 0;
  const mustSee = artists?.filter((a) => a.priority === "must_see").length ?? 0;
  const stepNo = step === 1 ? 1 : step === 3 ? 2 : 3;
  const canConfirm = review.length === 0 && count > 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h1 className="font-display text-5xl leading-[0.92] font-black">{manage ? "Add more artists" : ["", "Who do you want to catch live?", "", "Where should we watch?", "How should we alert you?"][step]}</h1>
          {!manage && <span className="text-sm text-muted">Step {stepNo} of 3</span>}
        </div>
        <div hidden={!!manage} className="h-1.5 overflow-hidden rounded-full bg-surface-border" role="progressbar" aria-valuenow={stepNo} aria-valuemin={1} aria-valuemax={3}>
          <div className="h-full bg-accent transition-all" style={{ width: `${(stepNo / 3) * 100}%` }} />
        </div>
        <p className="text-sm text-muted" aria-live="polite" hidden={step !== 1}>
          {artists === null ? "Loading your artists…" : `${count} artist${count === 1 ? "" : "s"} added${mustSee ? ` · ${mustSee} must-see` : ""}`}
        </p>
      </header>

      {/* The same confirm button sits at the top too, so a long list never needs a scroll to continue. */}
      {step === 1 && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-3 rounded-card border border-surface-border bg-background/90 px-4 py-2.5 backdrop-blur">
          <p className="text-sm text-muted" aria-live="polite">
            {artists === null ? "Loading…" : review.length > 0 ? `${review.length} to confirm first` : `${count} artist${count === 1 ? "" : "s"} ready${mustSee ? ` · ${mustSee} must-see` : ""}`}
          </p>
          {manage ? (
            <a href="/profile" className="rounded-card bg-accent px-5 py-2 text-sm font-bold text-accent-foreground">Done, back to profile</a>
          ) : (
            <button onClick={() => saveStep(3)} disabled={!canConfirm} className="rounded-card bg-accent px-5 py-2 text-sm font-bold text-accent-foreground disabled:opacity-50">
              Confirm and continue
            </button>
          )}
        </div>
      )}

      {notice && (
        <p role="status" className={`rounded-card border px-4 py-3 text-sm ${notice.tone === "error" ? "border-urgency-red/60" : notice.tone === "ok" ? "border-emerald-500/60" : "border-surface-border"}`}>
          {notice.text}
        </p>
      )}
      {loadError && (
        <p role="alert" className="rounded-card border border-urgency-red/60 px-4 py-3 text-sm">
          {loadError}{" "}
          <button className="underline" onClick={load}>Retry</button>
        </p>
      )}

      {step === 1 && (
        <>
      <ReviewTray
        items={review}
        onPick={(item, c) => confirm(item, { pick: { spotifyId: c.spotifyId, mbid: c.mbid } })}
        onAsTyped={(item) => confirm(item, { asTyped: true })}
        onRemove={(item) => confirm(item, { remove: true })}
      />

      {step === 1 && (
        <>
          <TouringNow onAdded={load} />
          <section className="flex flex-col gap-3">
            {spotify?.connected && !spotify.broken ? (
              <div className="flex items-center justify-between gap-3 rounded-card border border-emerald-500/60 bg-surface px-4 py-3">
                <span className="font-medium">
                  <span aria-hidden>✓ </span>Spotify connected{spotify.name ? ` as ${spotify.name}` : ""}
                </span>
                <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <button onClick={resync} disabled={syncing} className="text-sm text-muted underline underline-offset-2 hover:text-foreground disabled:opacity-50">
                    {syncing ? "Importing…" : "Re-import my artists"}
                  </button>
                  <button
                    onClick={async () => {
                      await fetch("/api/spotify/disconnect", { method: "POST" }).catch(() => {});
                      window.location.href = "/api/spotify/login";
                    }}
                    className="text-sm text-muted underline underline-offset-2 hover:text-foreground"
                  >
                    Use a different Spotify account
                  </button>
                </span>
              </div>
            ) : (
              <ConnectSpotifyButton className="flex items-center justify-center gap-3 rounded-card bg-[#1DB954] px-4 py-3.5 font-bold text-black transition hover:brightness-110">
                <SpotifyMark size={22} />
                {spotify?.broken ? "Spotify connection lost. Reconnect" : "Connect Spotify"}
              </ConnectSpotifyButton>
            )}
            <div className="relative">
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search an artist by name"
                aria-label="Search artists"
                className="w-full rounded-card border border-surface-border bg-surface px-4 py-3 outline-none focus:border-accent"
              />
              {searching && <span className="absolute top-1/2 right-4 -translate-y-1/2 text-xs text-muted">Searching…</span>}
            </div>
            {searchError && <p role="alert" className="text-sm text-urgency-red">{searchError}</p>}
            {results && results.length === 0 && !searching && !searchError && (
              <p className="text-sm text-muted">No artists found for “{query.trim()}”. Try the paste option and add it as typed.</p>
            )}
            {results && results.length > 0 && (
              <ul className="flex flex-col gap-2">
                {results.map((c) => (
                  <li key={c.spotifyId ?? c.mbid} className="flex items-center gap-3 rounded-card border border-surface-border bg-surface p-2">
                    <div className="h-14 w-14 shrink-0"><ArtistPhoto name={c.name} imageUrl={c.imageUrl} /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{c.name}</p>
                      <p className="truncate text-xs text-muted">{c.genres?.length ? c.genres.join(", ") : c.hint ?? (c.source === "musicbrainz" ? "From MusicBrainz" : "")}</p>
                    </div>
                    <button
                      disabled={c.alreadyAdded}
                      onClick={() => addFromSearch(c)}
                      className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:bg-surface-border disabled:text-muted"
                    >
                      {c.alreadyAdded ? "Added" : "Add"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-card border border-surface-border bg-surface">
            <button onClick={() => setPasteOpen((o) => !o)} aria-expanded={pasteOpen} className="flex w-full items-center justify-between px-4 py-3 text-left font-medium">
              Paste a list
              <span className="text-muted">{pasteOpen ? "−" : "+"}</span>
            </button>
            {pasteOpen && (
              <div className="flex flex-col gap-3 border-t border-surface-border p-4">
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  rows={6}
                  placeholder={"One per line or comma separated.\nNames or open.spotify.com/artist links."}
                  aria-label="Paste artist names or Spotify links"
                  className="w-full rounded-card border border-surface-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                />
                <button
                  onClick={resolvePaste}
                  disabled={resolving || !pasteText.trim()}
                  className="self-start rounded-card bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
                >
                  {resolving ? "Finding artists…" : "Add these"}
                </button>
              </div>
            )}
          </section>
        </>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-3xl font-extrabold">Your artists</h2>
          <p className="text-xs text-muted">Tap a card to cycle Follow → Must-see → Muted</p>
        </div>
        {artists === null && !loadError && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-busy="true">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-card bg-surface-border" />
            ))}
          </div>
        )}
        {artists && artists.length === 0 && (
          <p className="rounded-card border border-dashed border-surface-border px-4 py-8 text-center text-sm text-muted">
            No artists yet. Search above, paste a list, or connect Spotify to get started.
          </p>
        )}
        {artists && artists.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {artists.map((a) => (
              <li key={a.id} className="relative">
                <button onClick={() => cyclePriority(a)} aria-label={`${a.name}: ${PRIORITY_LABEL[a.priority]}. Tap to change.`} className={`group relative block aspect-[4/5] w-full overflow-hidden rounded-card border-2 text-left ${a.priority === "must_see" ? "border-accent" : "border-transparent"} ${a.priority === "muted" ? "opacity-40" : ""}`}>
                  <ArtistPhoto name={a.name} imageUrl={a.imageUrl} rounded={false} />
                  <span className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
                  {a.priority === "must_see" && <span className="absolute top-2 left-2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-foreground">Must-see</span>}
                  <span className="absolute inset-x-0 bottom-0 p-2.5">
                    <span className="font-display block truncate text-2xl leading-none font-extrabold">{a.name}</span>
                    <span className="text-[11px] text-white/70">{PRIORITY_LABEL[a.priority]}{a.identityStatus === "unverified" ? " · Name only" : ""}</span>
                  </span>
                </button>
                <button onClick={() => remove(a)} aria-label={`Remove ${a.name}`} className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-sm leading-none text-white/80 hover:text-white">×</button>
                {a.identityStatus !== "verified" && <button onClick={() => reopen(a)} className="mt-1 text-[11px] text-muted underline underline-offset-2 hover:text-foreground">Is this the right artist?</button>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {manage && (
        <footer className="flex items-center justify-end border-t border-surface-border pt-4">
          <a href="/profile" className="rounded-card bg-accent px-5 py-2.5 font-bold text-accent-foreground">Done, back to profile</a>
        </footer>
      )}
      {!manage && (
        <footer className="flex flex-col items-end gap-1 border-t border-surface-border pt-4">
          <button onClick={() => saveStep(3)} disabled={!canConfirm} className="rounded-card bg-accent px-6 py-3 font-bold text-accent-foreground disabled:opacity-50">
            Confirm artists and continue
          </button>
          {review.length > 0 && <p className="text-xs text-muted">Resolve or remove the {review.length} unconfirmed first.</p>}
        </footer>
      )}
        </>
      )}
      {importing && <ConnectOverlay phase="importing" />}
      {step === 3 && <CitiesStep onBack={() => saveStep(1)} onNext={() => saveStep(4)} />}
      {step === 4 && <AlertsStep onBack={() => saveStep(3)} />}
    </div>
  );
}
