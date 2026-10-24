import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { schema } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/session";

// Link status + the one-time deep link. The onboarding page polls GET until `linked` flips.
export async function GET() {
  const ctx = await requireUser();
  if (!ctx) return unauthorized();
  const { db, user } = ctx;
  const bot = process.env.TELEGRAM_BOT_USERNAME ?? "";
  if (user.telegramChatId) return Response.json({ linked: true, bot, enabled: user.telegramEnabled !== false });
  let code = user.telegramLinkCode;
  if (!code) {
    code = randomBytes(9).toString("base64url");
    await db.update(schema.users).set({ telegramLinkCode: code }).where(eq(schema.users.id, user.id));
  }
  return Response.json({ linked: false, bot, url: bot ? `https://t.me/${bot}?start=${code}` : null, configured: !!bot && !!process.env.TELEGRAM_BOT_TOKEN });
}

export async function DELETE() {
  const ctx = await requireUser();
  if (!ctx) return unauthorized();
  await ctx.db.update(schema.users).set({ telegramChatId: null, telegramLinkCode: null }).where(eq(schema.users.id, ctx.user.id));
  return Response.json({ ok: true });
}
