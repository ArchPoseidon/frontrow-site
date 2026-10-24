// Real concert photos in one dusky purple / magenta family, shown dulled behind every screen.
// Files in /public/concert are 2400 px wide; next/image serves the right size and format for each screen.
export const BACKGROUNDS = ["/concert/bg-1.jpg", "/concert/bg-2.jpg", "/concert/bg-3.jpg", "/concert/bg-4.jpg", "/concert/bg-5.jpg"];

// One image per area, so moving between screens crossfades to a new scene (Spotify style).
const BY_ROUTE: [string, number][] = [
  ["/demo", 0],
  ["/onboarding", 1],
  ["/welcome", 2],
  ["/radar", 3],
  ["/event", 3],
  ["/shows", 4],
  ["/calendar", 1],
  ["/profile", 2],
  ["/connections", 2],
  ["/setup", 0],
];

export function backgroundFor(path: string): string {
  if (path === "/") return BACKGROUNDS[0];
  const hit = BY_ROUTE.find(([p]) => path === p || path.startsWith(`${p}/`));
  return BACKGROUNDS[hit ? hit[1] : 0];
}

// Card flips: the same two stock photos, as they are. A show with its own concert photo can pass it in instead.
export const CARD_IMAGES = ["/concert/bg-1.jpg", "/concert/bg-2.jpg"];
export function cardConcert(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CARD_IMAGES[h % CARD_IMAGES.length];
}
