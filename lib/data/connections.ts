import { and, eq } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";
import { emailConfigured } from "@/lib/notify/email";

export type Connections = {
  spotify: { connected: boolean; broken: boolean; name: string | null };
  telegram: { connected: boolean; enabled: boolean; bot: string };
  calendar: { connected: boolean };
  email: { available: boolean; enabled: boolean; address: string | null };
};

export async function getConnections(db: Db, user: typeof schema.users.$inferSelect): Promise<Connections> {
  const [[sp], [acct]] = await Promise.all([
    db.select({ broken: schema.spotifyConnections.broken, name: schema.spotifyConnections.displayName }).from(schema.spotifyConnections).where(eq(schema.spotifyConnections.userId, user.id)),
    db.select({ scope: schema.accounts.scope }).from(schema.accounts).where(and(eq(schema.accounts.userId, user.id), eq(schema.accounts.provider, "google"))),
  ]);
  return {
    spotify: { connected: !!sp && !sp.broken, broken: !!sp?.broken, name: sp?.name ?? null },
    telegram: { connected: !!user.telegramChatId, enabled: user.telegramEnabled !== false, bot: process.env.TELEGRAM_BOT_USERNAME ?? "" },
    calendar: { connected: !!acct?.scope?.includes("calendar") },
    email: { available: emailConfigured(), enabled: user.emailEnabled !== false && emailConfigured(), address: user.email },
  };
}
