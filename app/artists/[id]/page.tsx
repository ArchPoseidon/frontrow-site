import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { getRadarEvents } from "@/lib/data/radar";
import { getArtistNews } from "@/lib/data/artist-news";
import { productsForArtist } from "@/lib/data/merch";
import { track } from "@/lib/track";
import { AppHeader } from "@/components/AppHeader";
import { ArtistPhoto } from "@/components/artist/ArtistPhoto";
import { ArtistShows } from "@/components/artists/ArtistShows";
import { CallMeToggle } from "@/components/artists/CallMeToggle";
import { ProductCard } from "@/components/merch/ProductCard";

const ago = (iso: string | null) => {
  if (!iso) return "";
  const h = Math.round((Date.now() - Date.parse(iso)) / 3600_000);
  if (h < 1) return "just now";
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
};

async function Loaded({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const db = getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, session.user.id));
  if (!u) redirect("/");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [row] = await db
    .select({ a: schema.artists, ua: schema.userArtists })
    .from(schema.artists)
    .leftJoin(schema.userArtists, and(eq(schema.userArtists.artistId, schema.artists.id), eq(schema.userArtists.userId, u.id)))
    .where(and(eq(schema.artists.id, id), eq(schema.artists.isDeceased, false)));
  if (!row) notFound();
  const { a, ua } = row;
  const [events, news, merch] = await Promise.all([
    ua ? getRadarEvents(db, { userId: u.id, homeCity: u.homeCity, watchCities: u.watchCities, p1Cities: u.p1Cities, p2Cities: u.p2Cities }).then((es) => es.filter((e) => e.artistId === id)) : Promise.resolve([]),
    getArtistNews(db, a),
    productsForArtist(db, id),
  ]);
  await track(db, "artist_page_viewed", u.id, { artist: id });
  return (
    <>
      <AppHeader name={u.name} image={u.image} />
      <main className="mx-auto w-full max-w-5xl px-4 pt-6 pb-28 sm:pb-12">
        <Link href="/artists" className="text-sm text-muted underline underline-offset-2">← Your artists</Link>
        <header className="mt-4 flex items-center gap-4">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-full border-2 border-accent sm:h-32 sm:w-32"><ArtistPhoto name={a.name} imageUrl={a.imageUrl} rounded={false} /></div>
          <div className="min-w-0 space-y-1">
            <h1 className="font-display truncate text-5xl leading-[0.95] font-black sm:text-6xl">{a.name}</h1>
            <p className="text-sm text-muted">{[...(a.genres ?? []).slice(0, 3), a.origin === "india" ? "India" : null].filter(Boolean).join(" · ") || "Artist"}</p>
            {a.lastIndiaShow && <p className="text-xs text-muted">Last India show: {a.lastIndiaShow}</p>}
          </div>
        </header>
        {ua && <div className="mt-4"><CallMeToggle artistId={id} initial={!!ua.callMe} /></div>}

        <section className="mt-8 space-y-3" aria-labelledby="shows">
          <h2 id="shows" className="font-display text-3xl font-extrabold">Upcoming in India</h2>
          {ua ? <ArtistShows events={events} artistId={id} /> : <p className="rounded-card border border-dashed border-surface-border p-6 text-sm text-muted">Follow this artist to see their India shows here.</p>}
        </section>

        <section className="mt-8 space-y-3" aria-labelledby="news">
          <h2 id="news" className="font-display text-3xl font-extrabold">Latest news</h2>
          {news.length === 0 ? (
            <p className="rounded-card border border-dashed border-surface-border p-6 text-sm text-muted">No recent headlines found.</p>
          ) : (
            <ul className="divide-y divide-surface-border rounded-card border border-surface-border bg-surface/80">
              {news.map((n) => (
                <li key={n.id}>
                  <a href={n.url} target="_blank" rel="noopener noreferrer" className="block p-3 hover:bg-surface-border/30">
                    <p className="font-medium">{n.title}</p>
                    <p className="text-xs text-muted">{[n.publisher, ago(n.publishedAt)].filter(Boolean).join(" · ")}</p>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-8 space-y-3" aria-labelledby="merch">
          <div className="flex items-end justify-between">
            <h2 id="merch" className="font-display text-3xl font-extrabold">Merch</h2>
            <Link href={`/merch?artist=${id}`} className="text-sm text-muted underline underline-offset-2">See all</Link>
          </div>
          {merch.length === 0 ? (
            <p className="rounded-card border border-dashed border-surface-border p-6 text-sm text-muted">Official merch is coming soon.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">{merch.slice(0, 4).map((p) => <li key={p.id}><ProductCard p={p} /></li>)}</ul>
          )}
        </section>
      </main>
    </>
  );
}

export default function ArtistPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-5xl px-4 py-6"><div className="h-72 animate-pulse rounded-card bg-surface-border" /></main>}>
      <Loaded params={params} />
    </Suspense>
  );
}
