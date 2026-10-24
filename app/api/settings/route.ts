import { eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/session";
import { emailConfigured } from "@/lib/notify/email";

export const INDIAN_CITIES = ["Bengaluru", "Mumbai", "Delhi", "Hyderabad", "Chennai", "Pune", "Kolkata", "Ahmedabad", "Goa", "Jaipur", "Chandigarh", "Kochi", "Gurugram", "Lucknow", "Indore", "Guwahati"];
export const MAX_P1 = 3;
export const MAX_P2 = 5;

const shape = (u: typeof schema.users.$inferSelect) => ({
  name: u.name,
  email: u.email,
  image: u.image,
  homeCity: u.homeCity ?? "Bengaluru",
  watchCities: u.watchCities ?? ["ALL_INDIA"],
  p1Cities: u.p1Cities ?? [],
  p2Cities: u.p2Cities ?? [],
  watchAllIndia: u.watchAllIndia !== false,
  emailEnabled: u.emailEnabled !== false,
  telegramEnabled: u.telegramEnabled !== false,
  telegramLinked: !!u.telegramChatId,
  emailAvailable: emailConfigured(),
  cities: INDIAN_CITIES,
});

export async function GET() {
  const ctx = await requireUser();
  if (!ctx) return unauthorized();
  return Response.json(shape(ctx.user));
}

const Body = z.object({
  homeCity: z.string().min(2).max(40).optional(),
  watchCities: z.array(z.string().min(2).max(40)).max(30).optional(),
  p1Cities: z.array(z.string().min(2).max(40)).max(MAX_P1).optional(),
  p2Cities: z.array(z.string().min(2).max(40)).max(MAX_P2).optional(),
  watchAllIndia: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  telegramEnabled: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  const ctx = await requireUser();
  if (!ctx) return unauthorized();
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const b = body.data;
  // City priorities: P1 and P2 never overlap (P1 wins). homeCity and watchCities stay in step so older code keeps working.
  const prio: Partial<typeof schema.users.$inferInsert> = {};
  if (b.p1Cities || b.p2Cities || b.watchAllIndia !== undefined) {
    const p1 = [...new Set(b.p1Cities ?? ctx.user.p1Cities ?? [])];
    const p2 = [...new Set(b.p2Cities ?? ctx.user.p2Cities ?? [])].filter((c) => !p1.includes(c));
    const all = b.watchAllIndia ?? ctx.user.watchAllIndia !== false;
    Object.assign(prio, { p1Cities: p1, p2Cities: p2, watchAllIndia: all, watchCities: all ? ["ALL_INDIA"] : [...p1, ...p2], ...(p1[0] ? { homeCity: p1[0] } : {}) });
  }
  await ctx.db
    .update(schema.users)
    .set({
      ...prio,
      ...(b.homeCity ? { homeCity: b.homeCity } : {}),
      ...(b.watchCities ? { watchCities: b.watchCities.length ? b.watchCities : ["ALL_INDIA"] } : {}),
      ...(b.emailEnabled !== undefined ? { emailEnabled: b.emailEnabled } : {}),
      ...(b.telegramEnabled !== undefined ? { telegramEnabled: b.telegramEnabled } : {}),
    })
    .where(eq(schema.users.id, ctx.user.id));
  const [u] = await ctx.db.select().from(schema.users).where(eq(schema.users.id, ctx.user.id));
  return Response.json(shape(u));
}
