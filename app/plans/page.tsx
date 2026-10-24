import { Suspense } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { PLANS, paymentsEnabled } from "@/lib/plans";
import { AppHeader } from "@/components/AppHeader";
import { PlansView } from "@/components/plans/PlansView";

async function Loaded({ searchParams }: { searchParams: Promise<{ onboarding?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const db = getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, session.user.id));
  if (!u) redirect("/");
  const { onboarding } = await searchParams;
  return (
    <>
      <AppHeader name={u.name} image={u.image} />
      <main className="mx-auto w-full max-w-3xl px-4 pt-6 pb-28 sm:pb-12">
        <h1 className="font-display mb-1 text-6xl leading-[0.9] font-black">Choose your plan</h1>
        <p className="mb-5 text-sm text-muted">FrontRow is free to use. Plus is on its way.</p>
        <PlansView plans={PLANS} current={u.plan ?? "free"} paymentsOn={paymentsEnabled()} onboarding={!!onboarding} />
      </main>
    </>
  );
}

export default function Plans({ searchParams }: { searchParams: Promise<{ onboarding?: string }> }) {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-3xl px-4 py-6"><div className="h-72 animate-pulse rounded-card bg-surface-border" /></main>}>
      <Loaded searchParams={searchParams} />
    </Suspense>
  );
}
