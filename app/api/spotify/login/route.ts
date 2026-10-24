import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { authorizeUrl } from "@/lib/identity/spotify";
import { makeState } from "@/lib/identity/spotify-state";

export async function GET(req: Request) {
  const ctx = await requireUser();
  if (!ctx) return NextResponse.redirect(new URL("/", process.env.APP_URL ?? req.url));
  const next = new URL(req.url).searchParams.get("next") === "setup" ? "/setup" : "/onboarding";
  if (next === "/setup" && !ctx.user.isOwner) return NextResponse.redirect(new URL("/radar", process.env.APP_URL ?? req.url));

  const state = makeState(ctx.user.id, next);
  (await cookies()).set("sp_state", JSON.stringify({ state, next }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return NextResponse.redirect(authorizeUrl(state));
}
