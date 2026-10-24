"use client";

import { useEffect, useState } from "react";

function fmt(ms: number) {
  if (ms <= 0) return "now";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d >= 2) return `${d}d ${h}h`;
  if (h > 0 || d > 0) return `${d * 24 + h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(s % 60).padStart(2, "0")}s`;
}

// Live countdown. Renders nothing until mounted so server and client markup agree.
export function Countdown({ to, label }: { to: string; label: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const target = Date.parse(to);
  return (
    <p className="text-sm tabular-nums" aria-live="off">
      <span className="text-muted">{label} </span>
      <span className="font-semibold">{now === null ? "…" : fmt(target - now)}</span>
    </p>
  );
}
