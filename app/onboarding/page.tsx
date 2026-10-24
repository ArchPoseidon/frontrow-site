import { Suspense } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { ArtistsStep } from "@/components/onboarding/ArtistsStep";

type SearchParams = Promise<{ spotify?: string; manage?: string; f?: string; t?: string; as?: string; shared?: string }>;

async function Loaded({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const { spotify, manage, f, t, as, shared } = await searchParams;
  const [u] = await getDb().select({ step: schema.users.onboardingStep, done: schema.users.onboardedAt }).from(schema.users).where(eq(schema.users.id, session.user.id));
  return <ArtistsStep initialStep={manage ? 1 : u?.done ? 2 : (u?.step ?? 0)} spotifyFlag={spotify} spotifyCounts={spotify === "imported" ? { followed: Number(f) || 0, top: Number(t) || 0 } : undefined} spotifyAs={as} spotifyShared={shared === "1"} manage={!!manage} />;
}

export default function Onboarding({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="min-h-screen">
      <Suspense fallback={<div className="mx-auto h-40 w-full max-w-3xl animate-pulse px-4 py-8" />}>
        <Loaded searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
