import { Suspense } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth, signOut } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { getAlertHistory, getArtistViews } from "@/lib/data/radar";
import { AppHeader } from "@/components/AppHeader";
import { ProfileArtists } from "@/components/profile/ProfileArtists";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { ProfileTabs } from "@/components/profile/ProfileTabs";
import { getConnections } from "@/lib/data/connections";
import { GoogleCalendarMark, TelegramMark, Tick } from "@/components/icons/BrandIcons";
import { SpotifyMark } from "@/components/spotify/SpotifyMark";
import Link from "next/link";

const ago = (d: Date | null) => {
  if (!d) return "";
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  return m < 60 ? `${Math.max(m, 1)} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};

async function Loaded() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const db = getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, session.user.id));
  if (!u) redirect("/");
  const [artists, history, conn] = await Promise.all([
    getArtistViews(db, u.id),
    getAlertHistory(db, u.id, 10),
    getConnections(db, u),
  ]);
  const card = "space-y-3 rounded-card border border-surface-border bg-surface p-4";
  return (
    <>
      <AppHeader isOwner={!!u.isOwner} name={u.name} image={u.image} />
      <section>
        <div className="mx-auto flex w-full max-w-3xl items-center gap-4 px-4 py-8">
          {u.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={u.image} alt="" width={72} height={72} className="rounded-full border-2 border-accent" referrerPolicy="no-referrer" />
          ) : (
            <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-accent font-display text-3xl font-black text-accent-foreground">{(u.name ?? "?")[0]}</span>
          )}
          <div className="min-w-0">
            <h1 className="font-display truncate text-5xl leading-none font-black">{u.name}</h1>
            <p className="truncate text-sm text-muted">{u.email} · {artists.length} artists · {u.homeCity ?? "Bengaluru"}</p>
          </div>
        </div>
      </section>
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-6 pb-28 sm:pb-12">
        <ProfileTabs active="profile" />
        <Link href="/connections" className={`${card} flex-row flex-wrap items-center justify-between hover:border-accent`} aria-label="Open connections">
          <div className="flex items-center gap-3">
            {[
              { ok: conn.spotify.connected, el: <SpotifyMark size={34} /> },
              { ok: conn.telegram.connected, el: <TelegramMark size={34} /> },
              { ok: conn.calendar.connected, el: <GoogleCalendarMark size={34} /> },
            ].map((x, i) => (
              <span key={i} className="relative">
                {x.el}
                {x.ok && <Tick className="absolute -right-1 -bottom-1" />}
              </span>
            ))}
          </div>
          <span className="text-sm font-bold">{[conn.spotify.connected, conn.telegram.connected, conn.calendar.connected].filter(Boolean).length} of 3 connected · Manage →</span>
        </Link>
        <Link href="/plans" className={`${card} flex-row flex-wrap items-center justify-between hover:border-accent`}>
          <span><span className="block font-display text-2xl font-extrabold">Your plan: {u.plan === "plus" ? "Plus" : "Free"}</span><span className="text-sm text-muted">See plans. Plus is coming soon.</span></span>
          <span className="text-sm font-bold">View plans →</span>
        </Link>
        <section className={card} aria-labelledby="my-artists">
          <h2 id="my-artists" className="font-display text-3xl font-extrabold">Your artists</h2>
          <ProfileArtists artists={artists} />
        </section>

        <SettingsForm isOwner={!!u.isOwner} embedded />

        <section className={card} aria-labelledby="history">
          <h2 id="history" className="font-display text-3xl font-extrabold">Alert history</h2>
          {history.length === 0 ? (
            <p className="text-sm text-muted">No alerts sent yet. They&apos;ll show up here with the channel, time and what you did.</p>
          ) : (
            <ul className="divide-y divide-surface-border text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                  <span className="font-bold">{h.artistName}</span>
                  <span className="text-muted">{h.city ?? ""}</span>
                  <span className="rounded-full border border-surface-border px-2 text-xs capitalize">{h.channel}{h.kind === "test" ? " · test" : ""}</span>
                  <span className="ml-auto text-xs text-muted">{h.action === "bought" || h.action === "going" ? "Going · " : h.action === "dismissed" ? "Not for me · " : ""}{ago(h.sentAt ? new Date(h.sentAt) : null)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {u.isOwner && <Link href="/setup" className="text-sm text-muted underline underline-offset-2">Owner setup</Link>}

        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button className="w-full rounded-card border border-urgency-red/60 py-3 font-bold text-urgency-red">Log out</button>
        </form>
      </main>
    </>
  );
}

export default function Profile() {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-3xl px-4 py-6"><div className="h-72 animate-pulse rounded-card bg-surface-border" /></main>}>
      <Loaded />
    </Suspense>
  );
}
