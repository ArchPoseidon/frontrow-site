import { eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/session";

export async function GET() {
  const ctx = await requireUser();
  if (!ctx) return unauthorized();
  const [sp] = await ctx.db.select({ broken: schema.spotifyConnections.broken, name: schema.spotifyConnections.displayName }).from(schema.spotifyConnections).where(eq(schema.spotifyConnections.userId, ctx.user.id));
  const u = ctx.user;
  return Response.json({
    id: u.id,
    name: u.name,
    email: u.email,
    image: u.image,
    isOwner: u.isOwner,
    homeCity: u.homeCity,
    onboardingStep: u.onboardingStep,
    onboarded: !!u.onboardedAt,
    spotify: sp ? { connected: true, broken: !!sp.broken, name: sp.name } : { connected: false, broken: false, name: null },
  });
}

// Onboarding saves as it goes, so a refresh never loses the current step.
export async function PATCH(req: Request) {
  const ctx = await requireUser();
  if (!ctx) return unauthorized();
  const body = z.object({ onboardingStep: z.number().int().min(0).max(4) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  await ctx.db.update(schema.users).set({ onboardingStep: body.data.onboardingStep }).where(eq(schema.users.id, ctx.user.id));
  return Response.json({ ok: true });
}
