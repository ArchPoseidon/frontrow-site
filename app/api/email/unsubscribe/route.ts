import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { verifyUnsubscribe } from "@/lib/notify/email";

const page = (msg: string, status = 200) =>
  new Response(`<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><title>FrontRow</title><body style="font-family:system-ui;max-width:420px;margin:15vh auto;padding:0 16px;text-align:center"><h1>FrontRow</h1><p>${msg}</p>`, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });

// Signed link in every email: turns email alerts off. Telegram alerts are unaffected.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const u = url.searchParams.get("u") ?? "";
  const t = url.searchParams.get("t") ?? "";
  if (!u || !t || !verifyUnsubscribe(u, t)) return page("This unsubscribe link isn't valid.", 400);
  await getDb().update(schema.users).set({ emailEnabled: false }).where(eq(schema.users.id, u));
  return page("You're unsubscribed from FrontRow emails. You can turn them back on in Settings.");
}

// One-click unsubscribe (RFC 8058) posts here.
export const POST = GET;
