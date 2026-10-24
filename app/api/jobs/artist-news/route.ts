import { getDb } from "@/lib/db";
import { cronAuthorized, forbidden } from "@/lib/jobs";
import { finishRun, startRun } from "@/lib/collectors/shared";
import { refreshFollowedNews } from "@/lib/data/artist-news";

export const maxDuration = 60;

// Refreshes the latest headlines for followed artists (those older than 6 hours). Safe to call twice.
export async function POST(req: Request) {
  if (!cronAuthorized(req)) return forbidden();
  const db = getDb();
  const run = await startRun(db, "artist-news");
  try {
    const r = await refreshFollowedNews(db);
    await finishRun(db, run, { itemsIn: r.items });
    return Response.json({ ok: true, ...r });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    await finishRun(db, run, { errors: [msg] });
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
