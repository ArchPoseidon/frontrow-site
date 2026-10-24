import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];

export function proxy(request: NextRequest) {
  const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));
  if (!hasSession) {
    const url = new URL("/", request.url);
    url.searchParams.set("signin", "1");
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/radar/:path*", "/shows/:path*", "/calendar/:path*", "/profile/:path*", "/connections/:path*", "/settings/:path*", "/onboarding/:path*", "/welcome/:path*", "/setup/:path*", "/artists/:path*", "/merch/:path*", "/cart/:path*", "/plans/:path*"],
};
