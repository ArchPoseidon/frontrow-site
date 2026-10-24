import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { getEventView } from "@/lib/data/radar";
import { EventCard } from "@/components/event-card/EventCard";
import { EventCardLive } from "@/components/event-card/EventCardLive";

async function Loaded({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = getDb();
  const session = await auth();
  const [u] = session?.user?.id ? await db.select().from(schema.users).where(eq(schema.users.id, session.user.id)) : [];
  const d = await getEventView(db, id, u ? { homeCity: u.homeCity, watchCities: u.watchCities, p1Cities: u.p1Cities, p2Cities: u.p2Cities, userId: u.id } : undefined);
  if (!d) notFound();
  const { view: ev } = d;
  const fmt = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) : "—");
  const day = (x: string | null) => (x ? new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${x}T00:00:00Z`)) : "Date TBA");
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-6">
      <Link href={u ? "/radar" : "/demo"} className="text-sm text-muted underline underline-offset-2">← Back to the radar</Link>
      {u ? <EventCardLive ev={ev} /> : <EventCard ev={ev} size="full" readOnly />}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Sources</h2>
        <ul className="divide-y divide-surface-border rounded-card border border-surface-border bg-surface text-sm">
          {ev.sources.map((s) => (
            <li key={s.url} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <span className="font-medium">{s.platform ?? new URL(s.url).hostname}</span>
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="truncate text-muted underline underline-offset-2">{new URL(s.url).hostname.replace(/^www\./, "")}</a>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">First seen {fmt(d.firstSeenAt)} IST. Every event here has at least one real source.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Ticket tiers</h2>
        {d.tierHistory.length === 0 ? (
          <p className="rounded-card border border-dashed border-surface-border p-4 text-sm text-muted">No tier details yet. We add them when the ticketing page lists them.</p>
        ) : (
          <ul className="divide-y divide-surface-border rounded-card border border-surface-border bg-surface text-sm">
            {d.tierHistory.map((t) => (
              <li key={t.name} className="flex items-center justify-between px-3 py-2.5">
                <span>{t.name}{t.priceInr ? ` · ₹${t.priceInr.toLocaleString("en-IN")}` : ""}</span>
                <span className="text-muted">{(t.status ?? "").replace("_", " ")} · seen {fmt(t.observedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{ev.artistName}&apos;s other India dates</h2>
        {d.otherDates.length === 0 ? (
          <p className="text-sm text-muted">No other announced India dates.</p>
        ) : (
          <ul className="divide-y divide-surface-border rounded-card border border-surface-border bg-surface text-sm">
            {d.otherDates.map((o) => (
              <li key={o.id}>
                <Link href={`/event/${o.id}`} className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-background">
                  <span className="font-medium">{o.city ?? "City TBA"}</span>
                  <span className="text-muted">{day(o.date)}{o.venue ? ` · ${o.venue}` : ""}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

export default function EventPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-2xl px-4 py-6"><div className="h-80 animate-pulse rounded-card bg-surface-border" /></main>}>
      <Loaded params={params} />
    </Suspense>
  );
}
