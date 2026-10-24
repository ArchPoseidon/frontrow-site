import type { TierView } from "./types";

// One segment per known tier, in order: current lit, sold-out struck through, upcoming dimmed.
export function TierLadder({ tiers, paper }: { tiers: TierView[]; paper?: boolean }) {
  if (!tiers.length) return null;
  return (
    <ol className="flex flex-wrap gap-1.5" aria-label="Ticket tiers">
      {tiers.map((t, i) => {
        const open = t.status === "open";
        const done = t.status === "sold_out" || t.status === "closed";
        return (
          <li
            key={`${t.name}-${i}`}
            className={`rounded-lg border px-2.5 py-1 text-xs leading-tight ${open ? "border-transparent bg-[var(--tier-open)] font-semibold text-white" : done ? paper ? "border-black/20 text-black/40 line-through" : "border-surface-border text-muted line-through" : paper ? "border-black/20 text-black/55" : "border-surface-border text-muted opacity-70"}`}
          >
            <span className="block">{t.name}</span>
            {t.priceInr ? <span className="block">₹{t.priceInr.toLocaleString("en-IN")}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
