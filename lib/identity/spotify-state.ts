import { createHmac, timingSafeEqual } from "node:crypto";

// A signed OAuth state, so the Spotify callback still works when the sp_state cookie is lost
// (in-app browsers, strict cookie settings). Carries the user id and an expiry; HMAC with AUTH_SECRET.
const sig = (s: string) => createHmac("sha256", process.env.AUTH_SECRET ?? "").update(`spotify-state:${s}`).digest("base64url");

export function makeState(userId: string, next: "/setup" | "/onboarding"): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, n: next, e: Date.now() + 10 * 60_000, r: crypto.randomUUID().slice(0, 8) })).toString("base64url");
  return `${payload}.${sig(payload)}`;
}

export function verifyState(state: string | null, userId: string): { next: "/setup" | "/onboarding" } | null {
  if (!state) return null;
  const [payload, mac] = state.split(".");
  if (!payload || !mac) return null;
  const want = sig(payload);
  if (mac.length !== want.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, "base64url").toString()) as { u: string; n: "/setup" | "/onboarding"; e: number };
    if (p.u !== userId || p.e < Date.now()) return null;
    return { next: p.n === "/setup" ? "/setup" : "/onboarding" };
  } catch {
    return null;
  }
}
