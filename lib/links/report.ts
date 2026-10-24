import { and, eq, sql } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";

// A user said this ticket link is wrong. Never show it again, mark it a mismatch, and re-queue verification
// (the links job will look for the right page with the grounded finder).
export async function reportWrongLink(db: Db, eventId: string, url: string | null) {
  await db
    .update(schema.events)
    .set({ ticketUrl: null, ticketStatus: "mismatch", ticketVerifiedAt: null, ticketCheckedAt: null, ticketReportCount: sql`coalesce(${schema.events.ticketReportCount}, 0) + 1` })
    .where(eq(schema.events.id, eventId));
  if (url) await db.update(schema.eventSources).set({ status: "mismatch", checkedAt: new Date() }).where(and(eq(schema.eventSources.eventId, eventId), eq(schema.eventSources.url, url)));
}
