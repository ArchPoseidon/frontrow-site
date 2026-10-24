import { Suspense } from "react";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { sql } from "drizzle-orm";

const MESSAGES: Record<string, string> = {
  connected: "Spotify connected.",
  invite_only: "Spotify refused the connection. Check that this Spotify account's email is under User management in the Spotify dashboard, and that the app owner has Premium.",
  state: "The Spotify return link expired or the browser dropped the cookie.",
  redirect: "Spotify rejected the redirect address. Make the Redirect URI in the Spotify dashboard match the one shown below exactly.",
  slow: "Spotify was slow or returned a server error. Try again.",
  denied: "Spotify connection was cancelled.",
  error: "Couldn't connect to Spotify. Check the redirect URI in the Spotify dashboard matches exactly, then try again.",
};

async function Loaded({ searchParams }: { searchParams: Promise<{ spotify?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const db = getDb();
  const [u] = await db.select({ isOwner: schema.users.isOwner }).from(schema.users).where(eq(schema.users.id, session.user.id));
  if (!u?.isOwner) redirect("/radar");
  const { spotify } = await searchParams;
  const [c] = await db.select().from(schema.spotifyConnections).where(eq(schema.spotifyConnections.userId, session.user.id));
  const attempts = await db.select({ at: schema.runs.startedAt, errors: schema.runs.errors }).from(schema.runs).where(eq(schema.runs.job, "spotify-connect")).orderBy(desc(schema.runs.startedAt)).limit(10);
  const [{ n: connections }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.spotifyConnections);
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI ?? "(not set)";
  const appUrl = process.env.APP_URL ?? "(not set)";
  const redirectMatchesApp = !!process.env.SPOTIFY_REDIRECT_URI && !!process.env.APP_URL && redirectUri.startsWith(appUrl);
  const state = !c ? "Not connected" : c.broken ? "Broken: reconnect needed" : "Connected";

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Owner setup</h1>
      {spotify && MESSAGES[spotify] && <p role="status" className="rounded-card border border-surface-border px-4 py-3 text-sm">{MESSAGES[spotify]}</p>}
      <section className="flex flex-col gap-3 rounded-card border border-surface-border bg-surface p-4">
        <h2 className="font-semibold">Spotify</h2>
        <p className="text-sm text-muted">Status: <span className={c?.broken ? "text-urgency-red" : "text-foreground"}>{state}</span>{c?.spotifyUserId ? ` · ${c.spotifyUserId}` : ""}</p>
        <a href="/api/spotify/login?next=setup" className="self-start rounded-card bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">{c ? "Reconnect Spotify" : "Connect Spotify"}</a>
        <p className="text-xs text-muted">Permissions requested: view followed artists and top artists. Tokens stay on the server.</p>
      </section>
      <section className="flex flex-col gap-2 rounded-card border border-surface-border bg-surface p-4 text-sm">
        <h2 className="font-semibold">Spotify diagnostics</h2>
        <p className="text-muted">Redirect URI sent to Spotify (must match the dashboard exactly, no trailing slash): <code className="break-all">{redirectUri}</code></p>
        <p className={redirectMatchesApp ? "text-muted" : "text-urgency-amber"}>App URL: <code>{appUrl}</code> {redirectMatchesApp ? "(same host)" : "(different host: the production redirect URI must use the live domain, and the dashboard must list it)"}</p>
        <p className="text-muted">Connected accounts: {connections}. Dev-mode apps allow only people added under User management (Spotify account name <b>and the email on that account</b>), up to 25.</p>
        <p className="font-medium">Last refused attempts</p>
        {attempts.length === 0 ? <p className="text-muted">None.</p> : (
          <ul className="space-y-1 text-xs text-muted">
            {attempts.map((a, i) => <li key={i}>{a.at ? new Date(a.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : ""}: {Array.isArray(a.errors) ? String(a.errors[0]) : ""}</li>)}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function Setup({ searchParams }: { searchParams: Promise<{ spotify?: string }> }) {
  return (
    <main className="min-h-screen">
      <Suspense fallback={<div className="mx-auto h-40 w-full max-w-xl animate-pulse px-4 py-12" />}>
        <Loaded searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
