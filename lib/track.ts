import { schema, type Db } from "@/lib/db";

// Product activity log for the admin site. Never throws and never blocks a request. No secrets, emails or phone numbers in `meta`.
export async function track(db: Db, type: string, userId: string | null, meta?: Record<string, unknown>) {
  try {
    await db.insert(schema.activityEvents).values({ userId, type, meta: meta ?? null });
  } catch (e) {
    console.error("track failed", type, e instanceof Error ? e.message : e);
  }
}
