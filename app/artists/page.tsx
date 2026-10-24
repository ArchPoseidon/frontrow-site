import { Suspense } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { getArtistViews } from "@/lib/data/radar";
import { AppHeader } from "@/components/AppHeader";
import { ArtistsList } from "@/components/artists/ArtistsList";

async function Loaded() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const db = getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, session.user.id));
  if (!u) redirect("/");
  const artists = await getArtistViews(db, u.id);
  return (
    <>
      <AppHeader name={u.name} image={u.image} />
      <main className="mx-auto w-full max-w-5xl px-4 pt-6 pb-28 sm:pb-12">
        <h1 className="font-display mb-5 text-6xl leading-[0.9] font-black">Your artists</h1>
        <ArtistsList artists={artists} />
      </main>
    </>
  );
}

export default function Artists() {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-5xl px-4 py-6"><div className="h-72 animate-pulse rounded-card bg-surface-border" /></main>}>
      <Loaded />
    </Suspense>
  );
}
