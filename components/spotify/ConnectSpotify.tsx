"use client";

import { useEffect, useState } from "react";
import { SpotifyMark } from "./SpotifyMark";

// Perforated line streaming between the FrontRow stub and Spotify, then the real redirect.
export function ConnectOverlay({ phase }: { phase: "connecting" | "importing" }) {
  const steps = phase === "connecting" ? ["Opening Spotify", "Asking to read who you follow", "Back in a moment"] : ["Signed in", "Reading followed artists", "Reading top artists", "Matching to the right people"];
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-background/85 backdrop-blur-md px-6" role="status" aria-live="polite">
      <div className="flex w-full max-w-xs items-center">
        <div className="flex h-16 w-16 shrink-0 -rotate-3 items-center justify-center rounded-md border border-surface-border bg-surface font-display text-3xl font-black text-accent">F</div>
        <div className="relative mx-1 h-0.5 flex-1">
          <div className="perf-line absolute inset-x-0 top-0" />
          {[0, 0.6, 1.2].map((d) => (
            <i key={d} className="absolute -top-[3px] h-2 w-2 rounded-sm bg-[#1DB954]" style={{ animation: `trk-dot 1.8s linear ${d}s infinite` }} />
          ))}
        </div>
        <div className="flex h-16 w-16 shrink-0 rotate-3 items-center justify-center rounded-md border border-surface-border bg-[#121212]">
          <SpotifyMark size={38} />
        </div>
      </div>
      <div className="text-center">
        <h2 className="font-display text-4xl font-extrabold">{phase === "connecting" ? "Connecting to Spotify" : "Importing your artists"}</h2>
        <p className="mt-1 text-sm text-muted">Read-only. We only see who you follow and listen to.</p>
      </div>
      <ul className="flex flex-col gap-2 text-sm">
        {steps.map((s, i) => (
          <li key={s} className="rise-in flex items-center gap-3" style={{ animationDelay: `${0.3 + i * 0.7}s` }}>
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--tier-open)] text-[10px] font-bold text-black">✓</span>
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}

// The "Connect Spotify" button: shows the animation while the browser goes to Spotify. The redirect starts at once
// (the animation plays during the load), so it never depends on a timer. If the page comes back (Back button) or the
// redirect stalls, the overlay offers a direct link and a Cancel.
export function ConnectSpotifyButton({ children, className }: { children: React.ReactNode; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);

  // Coming back from Spotify with the Back button restores this page from cache with the overlay still up.
  useEffect(() => {
    const reset = (e: PageTransitionEvent) => {
      if (e.persisted) {
        setBusy(false);
        setSlow(false);
      }
    };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);
  useEffect(() => {
    if (!busy) return;
    const t = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(t);
  }, [busy]);

  return (
    <>
      <a
        href="/api/spotify/login"
        onClick={(e) => {
          e.preventDefault();
          setBusy(true);
          setSlow(false);
          // Next frame: let the overlay paint, then go. No timer to lose.
          requestAnimationFrame(() => {
            window.location.assign("/api/spotify/login");
          });
        }}
        className={className}
      >
        {children}
      </a>
      {busy && (
        <>
          <ConnectOverlay phase="connecting" />
          {slow && (
            <div className="fixed inset-x-0 bottom-10 z-[60] flex flex-col items-center gap-3 px-6 text-center text-sm">
              <p className="text-white/80">Not moving?</p>
              <div className="flex gap-3">
                <a href="/api/spotify/login" className="rounded-card bg-[#1DB954] px-5 py-2.5 font-bold text-black">Open Spotify</a>
                <button onClick={() => setBusy(false)} className="rounded-card border border-white/40 px-5 py-2.5 font-bold">Cancel</button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
