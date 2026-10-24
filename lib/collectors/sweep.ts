import { eq } from "drizzle-orm";
import { z } from "zod";
import { schema, type Db } from "@/lib/db";
import { generateGrounded, generateJson } from "@/lib/brain/gemini";
import type { Watched } from "@/lib/brain/match";
import { todayIST } from "@/lib/util/ist";
import { sha256 } from "@/lib/util/hash";
import { insertRawItem } from "./shared";

const LastShow = z.object({
  has_upcoming_india_show: z.boolean(), // an upcoming (today or later) India date is named in the text
  last_india_show: z.string().nullable(), // "Mumbai, Mar 2026"
  last_india_date: z.string().nullable(), // YYYY-MM-DD
});

// Grounding returns redirect links; follow them once to the real page. Best effort, 4s budget.
async function resolveUrl(url: string): Promise<string> {
  if (!/vertexaisearch\.cloud\.google\.com|grounding-api-redirect/.test(url)) return url;
  try {
    const r = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(4000) });
    const loc = r.headers.get("location");
    return loc && /^https?:\/\//.test(loc) ? loc : url;
  } catch {
    return url;
  }
}

export type SweepResult = { artistId: string; rawItemId: string | null; found: boolean; error?: string };

// One grounded sweep for one artist. Stores the answer + real source URLs as a raw item and updates the
// artist's "Last in India" fields. A second, non-grounded call turns the answer into structured fields.
export async function sweepArtist(db: Db, sourceId: string | null, a: Watched): Promise<SweepResult> {
  try {
    const today = todayIST();
    const g = await generateGrounded(
      `Has "${a.name}" announced any concert, tour date or festival appearance in India from today (${today}) onward? ` +
        `List each with venue, city, date, ticket link and source URLs. Say NONE if nothing. ` +
        `Also give this artist's most recent PAST show in India (city and month/year) if there was one. Only report what you find in search results; do not guess.`,
    );
    const none = /^\s*NONE\b/i.test(g.text) || !g.text;
    const sources = (await Promise.all(g.sources.slice(0, 6).map(async (s) => ({ url: await resolveUrl(s.url), title: s.title })))).filter((s, i, arr) => arr.findIndex((x) => x.url === s.url) === i);

    // "Last in India", from the same answer (no new facts invented in the second call).
    let last: z.infer<typeof LastShow> = { has_upcoming_india_show: !none, last_india_show: null, last_india_date: null };
    if (g.text) {
      last = await generateJson(
        `From this text only: has_upcoming_india_show is true only if the text names a specific upcoming show or festival appearance in India dated today or later (false for "NONE", "no announced shows", or rumours). Also give the artist's most recent PAST show in India. last_india_show is "City, Mon YYYY"; last_india_date is YYYY-MM-DD (use the 1st if only month is known). Both null if the text names none. Today is ${today}; upcoming shows do not count.\n\n"""${g.text.slice(0, 6000)}"""`,
        LastShow,
      ).catch(() => last);
    }
    await db
      .update(schema.artists)
      .set({
        lastCheckedAt: new Date(),
        ...(last.last_india_show && last.last_india_date && last.last_india_date < today ? { lastIndiaShow: last.last_india_show, lastIndiaDate: last.last_india_date } : {}),
      })
      .where(eq(schema.artists.id, a.id));

    // Discard anything without a source URL.
    if (none || !last.has_upcoming_india_show || !sources.length) return { artistId: a.id, rawItemId: null, found: false };
    const body =
      `Artist: ${a.name}\n\n${g.text}\n\n` + sources.map((s) => `SOURCE_URL: ${s.url} | ${s.title ?? ""}`.trim()).join("\n");
    const id = await insertRawItem(db, {
      sourceId,
      url: sources[0].url,
      title: `Web search: ${a.name} in India`,
      content: body,
      hashSeed: sha256(`sweep|${a.id}|${g.text}`),
    });
    return { artistId: a.id, rawItemId: id, found: true };
  } catch (e) {
    return { artistId: a.id, rawItemId: null, found: false, error: e instanceof Error ? e.message.slice(0, 160) : "sweep failed" };
  }
}
