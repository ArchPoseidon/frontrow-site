import { eq } from "drizzle-orm";
import { schema } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/session";
import { reportWrongLink } from "@/lib/links/report";

const UUID = /^[0-9a-f-]{36}$/i;

// "Report a wrong link" on the event page: same effect as the Telegram button.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (!u) return unauthorized();
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: "Not found" }, { status: 404 });
  const [ev] = await u.db.select({ url: schema.events.ticketUrl }).from(schema.events).where(eq(schema.events.id, id));
  if (!ev) return Response.json({ error: "Not found" }, { status: 404 });
  await reportWrongLink(u.db, id, ev.url);
  return Response.json({ ok: true });
}
