"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { backgroundFor } from "@/lib/concert";

// A fixed, dulled concert photo behind every screen. Changing screens crossfades to the next scene.
export function Backdrop() {
  const path = usePathname();
  const src = backgroundFor(path);
  const [layers, setLayers] = useState<{ src: string; id: number }[]>([{ src, id: 0 }]);
  const n = useRef(0);

  useEffect(() => {
    setLayers((cur) => {
      if (cur[cur.length - 1].src === src) return cur;
      n.current += 1;
      return [...cur.slice(-1), { src, id: n.current }];
    });
    const t = setTimeout(() => setLayers((cur) => cur.slice(-1)), 1600);
    return () => clearTimeout(t);
  }, [src]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background">
      {layers.map((l, i) => (
        <Image
          key={l.id}
          src={l.src}
          alt=""
          fill
          sizes="100vw"
          quality={78}
          priority={i === 0}
          className={`object-cover ${i === layers.length - 1 && layers.length > 1 ? "backdrop-in" : ""}`}
          style={{ filter: "saturate(0.8) contrast(0.96) brightness(0.88)" }}
        />
      ))}
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(18,8,26,0.50) 0%, rgba(13,9,17,0.76) 50%, rgba(13,9,17,0.92) 100%)" }} />
    </div>
  );
}
