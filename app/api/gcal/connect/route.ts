import { auth, signIn } from "@/auth";
import { CALENDAR_SCOPE } from "@/lib/gcal";

// Second, optional Google consent: permission to add events to the user's calendar (and nothing else).
// Sign-in itself stays on openid email profile. Comes back to `return` (a path on this site).
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.redirect(new URL("/?signin=1", req.url));
  const url = new URL(req.url);
  const ret = url.searchParams.get("return") ?? "/calendar";
  const safe = ret.startsWith("/") && !ret.startsWith("//") ? ret : "/calendar";
  await signIn("google", { redirectTo: safe }, { scope: `openid email profile ${CALENDAR_SCOPE}`, access_type: "offline", prompt: "consent", include_granted_scopes: "true" });
}
