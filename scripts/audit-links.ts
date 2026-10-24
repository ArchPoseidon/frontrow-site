import { config } from "dotenv";
config({ path: ".env.local" });
import { getDb, schema } from "@/lib/db";
import { mapLimit } from "@/lib/util/retry";
type R = { url: string; status: number | string; final: string; ms: number };
async function probe(url: string): Promise<R> {
  const t = Date.now();
  try {
    const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(10000), headers: { "User-Agent": "Mozilla/5.0 (compatible; FrontRowBot/1.0)", Accept: "text/html" } });
    return { url, status: r.status, final: r.url, ms: Date.now() - t };
  } catch (e) { return { url, status: String((e as Error).message).slice(0, 30), final: "", ms: Date.now() - t }; }
}
async function main() {
  const db = getDb();
  const evs = await db.select({ t: schema.events.ticketUrl }).from(schema.events);
  const srcs = await db.select({ u: schema.eventSources.url }).from(schema.eventSources);
  const tickets = [...new Set(evs.map((e) => e.t).filter(Boolean) as string[])];
  const others = [...new Set(srcs.map((s) => s.u))].filter((u) => !tickets.includes(u));
  console.log("events", evs.length, "with ticket url", evs.filter((e) => e.t).length, "distinct tickets", tickets.length, "distinct sources", others.length);
  const sample = (a: string[], n: number) => a.sort(() => Math.random() - 0.5).slice(0, n);
  for (const [label, list] of [["TICKET", sample(tickets, 30)], ["SOURCE", sample(others, 30)]] as const) {
    const res = await mapLimit(list, 8, probe);
    const by: Record<string, number> = {};
    res.forEach((r) => (by[String(r.status)] = (by[String(r.status)] ?? 0) + 1));
    console.log(label, by);
    for (const r of res.filter((x) => x.status !== 200).slice(0, 6)) console.log("  ", r.status, r.url.slice(0, 90));
    const home = res.filter((r) => { try { return new URL(r.final).pathname.length <= 1; } catch { return false; } });
    console.log("  final=homepage:", home.length, home.slice(0, 3).map((h) => h.url.slice(0, 80)));
    const gn = res.filter((r) => /news\.google|vertexai/.test(r.url));
    console.log("  google/redirector urls:", gn.length);
  }
}
main();
