"use client";

import { useEffect } from "react";

// Tells the server the user is active (throttled in the browser and on the server). No tracking scripts, no third parties.
export function SeenPing() {
  useEffect(() => {
    try {
      const last = Number(sessionStorage.getItem("fr_seen") ?? 0);
      if (Date.now() - last < 10 * 60_000) return;
      sessionStorage.setItem("fr_seen", String(Date.now()));
    } catch {}
    fetch("/api/me/seen", { method: "POST" }).catch(() => {});
  }, []);
  return null;
}
