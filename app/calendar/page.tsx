import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { getRadarEvents } from "@/lib/data/radar";
import { todayIST } from "@/lib/util/ist";
import { AppHeader } from "@/components/AppHeader";
import { CalendarView } from "@/components/shows/CalendarView";

async function Loaded() {
  await connection();
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const db = getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, session.user.id));
  if (!u) redirect("/");
  const events = (await getRadarEvents(db, { userId: u.id, homeCity: u.homeCity, watchCities: u.watchCities, p1Cities: u.p1Cities, p2Cities: u.p2Cities })).filter((e) => e.date);
  return (
    <>
      <AppHeader name={u.name} image={u.image} />
      <main className="mx-auto w-full max-w-3xl px-4 pt-6 pb-28 sm:pb-12">
        <h1 className="font-display mb-5 text-6xl leading-[0.9] font-black">Calendar</h1>
        <CalendarView events={events} today={todayIST()} />
      </main>
    </>
  );
}

export default function Calendar() {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-3xl px-4 py-6"><div className="h-96 animate-pulse rounded-card bg-surface-border" /></main>}>
      <Loaded />
    </Suspense>
  );
}
