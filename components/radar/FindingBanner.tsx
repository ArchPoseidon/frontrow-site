"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Shown right after onboarding (?welcome=1): the first scan runs in the background, so the radar fills in on its own.
export function FindingBanner() {
  const router = useRouter();
  const [on, setOn] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("welcome")) return;
    setOn(true);
    let n = 0;
    const t = setInterval(() => {
      n++;
      router.refresh();
      if (n >= 8) {
        clearInterval(t);
        setDone(true);
      }
    }, 8000);
    return () => clearInterval(t);
  }, [router]);

  if (!on) return null;
  return (
    <div role="status" className="mb-4 flex items-center justify-between gap-3 rounded-card border border-surface-border bg-surface px-4 py-3 text-sm">
      <span className="flex items-center gap-2">
        {!done && <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden />}
        {done ? "All set. New shows will appear here and in Telegram as soon as they land." : "Finding your shows… they'll appear here (and in Telegram) as they're found."}
      </span>
      <button onClick={() => setOn(false)} className="text-xs text-muted underline underline-offset-2">Dismiss</button>
    </div>
  );
}
