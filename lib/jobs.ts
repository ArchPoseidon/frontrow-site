import { timingSafeEqual } from "node:crypto";

// Job routes are called by cron-job.org with `Authorization: Bearer CRON_SECRET`.
export function cronAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  return got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}
export const forbidden = () => Response.json({ error: "Forbidden" }, { status: 401 });
