import { Suspense } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { getConnections } from "@/lib/data/connections";
import { AppHeader } from "@/components/AppHeader";
import { ConnectionsView } from "@/components/connections/ConnectionsView";
import { ProfileTabs } from "@/components/profile/ProfileTabs";

async function Loaded() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const db = getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, session.user.id));
  if (!u) redirect("/");
  const initial = await getConnections(db, u);
  return (
    <>
      <AppHeader isOwner={!!u.isOwner} name={u.name} image={u.image} />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 pt-6 pb-28 sm:pb-12">
        <h1 className="font-display text-6xl leading-[0.9] font-black">Connections</h1>
        <ProfileTabs active="connections" />
        <ConnectionsView initial={initial} />
      </main>
    </>
  );
}

export default function Connections() {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-3xl px-4 py-6"><div className="h-72 animate-pulse rounded-card bg-surface-border" /></main>}>
      <Loaded />
    </Suspense>
  );
}
