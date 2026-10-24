// Creates (or updates) the cron-job.org schedules that call the protected job routes.
// Usage: CRONJOB_API_KEY=... tsx scripts/setup-cron.ts [--dry]
import { config } from "dotenv";
config({ path: ".env.local" });

const BASE = (process.env.APP_URL ?? "").replace(/\/$/, "");
const SECRET = process.env.CRON_SECRET;
const KEY = process.env.CRONJOB_API_KEY;

const every = (n: number) => Array.from({ length: Math.floor(60 / n) }, (_, i) => i * n);
const JOBS: { title: string; path: string; minutes: number[]; hours?: number[] }[] = [
  { title: "FrontRow news", path: "/api/jobs/news", minutes: every(15) },
  { title: "FrontRow process", path: "/api/jobs/process", minutes: every(5) },
  { title: "FrontRow dispatch", path: "/api/jobs/dispatch", minutes: every(5) },
  { title: "FrontRow links", path: "/api/jobs/links", minutes: every(10) },
  { title: "FrontRow listings", path: "/api/jobs/listings", minutes: [0, 30] },
  { title: "FrontRow digest", path: "/api/jobs/digest", minutes: [0], hours: [9] },
  { title: "FrontRow artist news", path: "/api/jobs/artist-news", minutes: [15], hours: [0, 6, 12, 18] },
  { title: "FrontRow calls", path: "/api/jobs/calls", minutes: every(5) },
  { title: "FrontRow sweep", path: "/api/jobs/sweep", minutes: [0, 30], hours: [6, 7, 8, 9, 10] },
];

async function api(method: string, path: string, body?: unknown) {
  let r = await fetch(`https://api.cron-job.org${path}`, { method, headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  // cron-job.org rate-limits job writes: wait and retry.
  for (let i = 0; r.status === 429 && i < 4; i++) {
    await new Promise((res) => setTimeout(res, 15_000 * (i + 1)));
    r = await fetch(`https://api.cron-job.org${path}`, { method, headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(j).slice(0, 160)}`);
  return j as Record<string, unknown>;
}

async function main() {
  if (!BASE.startsWith("https://") || !SECRET) throw new Error("APP_URL (https) and CRON_SECRET must be set in .env.local");
  const dry = process.argv.includes("--dry");
  if (!KEY && !dry) throw new Error("Set CRONJOB_API_KEY (cron-job.org > Settings > API)");
  const existing = dry ? [] : ((await api("GET", "/jobs")).jobs as { jobId: number; title: string }[]);
  for (const j of JOBS) {
    const job = {
      url: `${BASE}${j.path}`,
      title: j.title,
      enabled: true,
      saveResponses: true,
      requestMethod: 1, // POST
      requestTimeout: 60,
      schedule: { timezone: "Asia/Kolkata", expiresAt: 0, hours: j.hours ?? [-1], mdays: [-1], minutes: j.minutes, months: [-1], wdays: [-1] },
      extendedData: { headers: { Authorization: `Bearer ${SECRET}` } },
    };
    if (dry) {
      console.log("would set", j.title, j.path, "minutes", j.minutes.join(","), "hours", (j.hours ?? ["all"]).join(","));
      continue;
    }
    const have = existing.find((e) => e.title === j.title);
    if (have) await api("PATCH", `/jobs/${have.jobId}`, { job });
    else await api("PUT", "/jobs", { job });
    console.log(have ? "updated" : "created", j.title);
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
