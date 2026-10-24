"use client";

import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from "react";

// Horizontal rail of cards: runs edge to edge on phones, snaps card by card, shows a peek of the next card,
// fades at the edges, scales the card in view, and has arrows on larger screens.
export function CardRail({ children, label }: { children: ReactNode; label: string }) {
  const rail = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });
  const items = Children.toArray(children);

  const measure = useCallback(() => {
    const el = rail.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 });
  }, []);

  useEffect(() => {
    measure();
    const el = rail.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, items.length]);

  const go = (dir: 1 | -1) => {
    const el = rail.current;
    if (!el) return;
    const card = el.querySelector("li");
    const step = (card?.getBoundingClientRect().width ?? 320) + 16;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  const mask = `linear-gradient(to right, ${edge.start ? "#000" : "transparent"} 0, #000 28px, #000 calc(100% - 28px), ${edge.end ? "#000" : "transparent"} 100%)`;

  return (
    <div className="relative -mx-4 sm:mx-0" role="region" aria-label={label}>
      <ul
        ref={rail}
        onScroll={measure}
        style={{ maskImage: mask, WebkitMaskImage: mask }}
        className="rail flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-4 pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [scroll-padding-inline:1rem] sm:px-0 sm:[scroll-padding-inline:0] [&::-webkit-scrollbar]:hidden after:w-px after:shrink-0 after:content-['']"
      >
        {items.map((c, i) => (
          <li key={i} className="rail-card w-[84%] shrink-0 snap-start sm:w-[22rem]">{c}</li>
        ))}
      </ul>
      {items.length > 1 && (
        <>
          <button onClick={() => go(-1)} disabled={edge.start} aria-label="Previous show" className="absolute top-1/2 -left-3 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-surface-border bg-surface/95 text-lg shadow-lg backdrop-blur transition hover:border-magenta disabled:pointer-events-none disabled:opacity-0 sm:flex">‹</button>
          <button onClick={() => go(1)} disabled={edge.end} aria-label="Next show" className="absolute top-1/2 -right-3 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-surface-border bg-surface/95 text-lg shadow-lg backdrop-blur transition hover:border-magenta disabled:pointer-events-none disabled:opacity-0 sm:flex">›</button>
        </>
      )}
    </div>
  );
}
