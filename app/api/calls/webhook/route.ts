import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

// Provider callback with the outcome of a call. Authenticated with a shared secret header; idempotent (it only sets a final status).
export async function POST(req: Request) {
  const secret = process.env.VOICE_WEBHOOK_SECRET;
  const got = req.headers.get("x-webhook-secret") ?? "";
  if (!secret || got.length !== secret.length || !timingSafeEqual(Buffer.from(got), Buffer.from(secret))) return Response.json({ error: "Forbidden" }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { call_id?: string; conversation_id?: string; status?: string } | null;
  const id = b?.call_id ?? b?.conversation_id;
  if (!id) return Response.json({ ok: true });
  const s = (b?.status ?? "").toLowerCase();
  const status = /no.?answer|busy|unanswered|voicemail/.test(s) ? "no_answer" : /fail|error/.test(s) ? "failed" : "done";
  await getDb().update(schema.callReminders).set({ status, outcome: { status: s } }).where(eq(schema.callReminders.providerCallId, id));
  return Response.json({ ok: true });
}
