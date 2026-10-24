import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { and, asc, desc, eq, gte, ne } from "drizzle-orm";
import { auth, signIn } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { getEventView } from "@/lib/data/radar";
import { getCachedCounters } from "@/lib/data/cached";
import { todayIST } from "@/lib/util/ist";
import { EventCard } from "@/components/event-card/EventCard";
import { GoogleMark } from "@/components/icons/BrandIcons";

const STEPS = [
  { n: "1", t: "Tell us who you love", d: "Connect Spotify, search, or paste a list. Every artist is matched to the right person, with a photo." },
  { n: "2", t: "We watch the calendar", d: "News, ticketing pages and web search, checked all day for shows in India." },
  { n: "3", t: "You hear first", d: "A Telegram alert the moment a show is announced, with the exact ticket page and whether tickets are live." },
];

async function Buttons({ searchParams }: { searchParams: Promise<{ signin?: string }> }) {
  const [session, sp] = await Promise.all([auth(), searchParams]);
  if (session?.user) redirect("/radar");
  return (
    <div className="flex flex-col gap-3">
      {sp.signin && <p role="status" className="rounded-card border border-surface-border bg-black/40 px-4 py-2 text-sm">Sign in to continue.</p>}
      <div className="flex flex-wrap gap-3">
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/radar" });
          }}
        >
          <button type="submit" className="flex items-center gap-3 rounded-card bg-accent px-6 py-3.5 text-base font-bold text-accent-foreground transition hover:brightness-95">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white"><GoogleMark size={18} /></span>
            Continue with Google
          </button>
        </form>
        <Link href="/demo" className="rounded-card border border-white/40 bg-black/30 px-7 py-3.5 text-base font-bold backdrop-blur transition hover:bg-black/50">See a live demo</Link>
      </div>
      <p className="max-w-md text-xs text-white/70">Google will also ask to let FrontRow add shows to your calendar. That part is optional: untick it and everything else still works.</p>
    </div>
  );
}

async function Counters() {
  await connection(); // live numbers: render per request
  const c = await getCachedCounters().catch(() => null);
  if (!c) return <p className="text-sm text-muted">Live numbers are loading…</p>;
  const items = [
    { v: c.artistsWatched, l: "artists watched" },
    { v: c.showsThisMonth, l: "shows found this month" },
    { v: c.alertsSent, l: "alerts sent" },
  ];
  return (
    <dl className="grid grid-cols-3 gap-3">
      {items.map((i) => (
        <div key={i.l} className="rounded-card border border-white/15 bg-black/40 p-3 backdrop-blur sm:p-4">
          <dd className="font-display text-4xl leading-none font-extrabold tabular-nums sm:text-5xl">{i.v.toLocaleString("en-IN")}</dd>
          <dt className="mt-1 text-xs text-muted sm:text-sm">{i.l}</dt>
        </div>
      ))}
    </dl>
  );
}

// A real, sourced show as the same flipping ticket the app uses. Nothing is made up.
async function ExampleTicket() {
  await connection();
  const db = getDb();
  const [r] = await db
    .select({ id: schema.events.id })
    .from(schema.events)
    .where(and(eq(schema.events.isSample, false), ne(schema.events.status, "cancelled"), gte(schema.events.eventDate, todayIST()), gte(schema.events.confidence, 0.9)))
    .orderBy(desc(schema.events.ticketStatus), desc(schema.events.firstSeenAt), asc(schema.events.eventDate))
    .limit(1)
    .catch(() => []);
  const d = r ? await getEventView(db, r.id).catch(() => null) : null;
  if (!d) return null;
  return (
    <figure className="mx-auto w-full max-w-md space-y-2">
      <EventCard ev={d.view} readOnly auto />
      <figcaption className="text-center text-xs text-muted">A real show from the system. The card flips between the show, the artist and the tickets.</figcaption>
    </figure>
  );
}

export default function Landing({ searchParams }: { searchParams: Promise<{ signin?: string }> }) {
  return (
    <main>
      <section>
        <div className="mx-auto flex min-h-[78svh] w-full max-w-5xl flex-col justify-end gap-6 px-4 pt-16 pb-10">
          <p className="text-xs font-bold tracking-[0.3em] text-wordmark-soft uppercase">India · live shows · alerts</p>
          <h1 className="font-display text-wordmark text-[clamp(4.5rem,20vw,13rem)] leading-[0.82] font-black">
            Front<br />
            <span className="text-wordmark-soft">Row</span>
          </h1>
          <p className="max-w-lg text-lg text-white/85">Be the first to know about a show. Tell us the artists you love and FrontRow messages you the moment one of them announces a date in India.</p>
          <Suspense fallback={<div className="h-12 w-72 animate-pulse rounded-card bg-white/10" />}>
            <Buttons searchParams={searchParams} />
          </Suspense>
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-14 px-4 py-12">
        <Suspense fallback={<div className="grid grid-cols-3 gap-3">{[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-card bg-surface-border" />)}</div>}>
          <Counters />
        </Suspense>

        <section aria-labelledby="how" className="space-y-4">
          <h2 id="how" className="font-display text-5xl font-black">How it works</h2>
          <ol className="grid gap-3 sm:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="ticket-paper relative rounded-md p-4">
                <span className="font-display text-5xl leading-none font-black">{s.n}</span>
                <div className="perf my-2" />
                <h3 className="font-bold">{s.t}</h3>
                <p className="mt-1 text-sm text-black/70">{s.d}</p>
              </li>
            ))}
          </ol>
        </section>

        <Suspense fallback={<div className="mx-auto h-80 w-full max-w-md animate-pulse rounded-card bg-surface-border" />}>
          <ExampleTicket />
        </Suspense>

        <footer className="border-t border-surface-border pt-6 text-xs text-muted">FrontRow alerts you. You buy your own tickets. Personal, non-commercial project.</footer>
      </div>
    </main>
  );
}
