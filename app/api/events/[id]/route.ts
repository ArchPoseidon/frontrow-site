import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/session";
import { track } from "@/lib/track";
import { loadEventCard } from "@/lib/notify/content";

// Public event facts (every event carries its sources).
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Not found" }, { status: 404 });
  const ev = await loadEventCard(getDb(), id).catch(() => null);
  return ev ? Response.json(ev) : Response.json({ error: "Not found" }, { status: 404 });
}

// "Not for me" from the dashboard (same effect as the Telegram button); `{ undo: true }` brings it back.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (!u) return unauthorized();
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Not found" }, { status: 404 });
  // action: "going" | "saved" | "dismissed" | "clear" (also the older { undo: true })
  const body = (await req.json().catch(() => ({}))) as { undo?: boolean; action?: string };
  const allowed = ["going", "saved", "dismissed"];
  const action = body.undo || body.action === "clear" ? null : allowed.includes(body.action ?? "") ? body.action! : "dismissed";
  await u.db
    .insert(schema.alerts)
    .values({ userId: u.user.id, eventId: id, kind: "new_show", channel: "telegram", status: "marked", userAction: action })
    .onConflictDoUpdate({ target: [schema.alerts.userId, schema.alerts.eventId, schema.alerts.kind, schema.alerts.channel], set: { userAction: action } });
  // Mirror onto the email row if there is one, so every channel agrees.
  await u.db.update(schema.alerts).set({ userAction: action }).where(and(eq(schema.alerts.eventId, id), eq(schema.alerts.userId, u.user.id)));
  await track(u.db, "alert_action", u.user.id, { action: action ?? "clear" });
  return Response.json({ ok: true });
}
