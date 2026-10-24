import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { track } from "@/lib/track";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

// Sign-in asks for openid, email, profile and calendar.events (add events only).
// The calendar scope is sensitive: while the app is in Testing mode only listed test users can sign in.
export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const db = getDb();
  return {
    adapter: DrizzleAdapter(db, {
      usersTable: schema.users,
      accountsTable: schema.accounts,
      sessionsTable: schema.sessions,
      verificationTokensTable: schema.verificationTokens,
    }),
    session: { strategy: "database" },
    providers: [
      Google({
        // One consent screen at sign-up: identity plus permission to add shows to the user's calendar.
        // Google's granular consent lets a user untick the calendar box and still sign in; Connections shows it as not connected.
        // access_type=offline gets a refresh token on first consent, so adding to Google Calendar keeps working.
        authorization: { params: { scope: `openid email profile ${CALENDAR_SCOPE}`, access_type: "offline", include_granted_scopes: "true" } },
      }),
    ],
    pages: { signIn: "/" },
    callbacks: {
      async signIn({ user }) {
        // An account the owner disabled from the admin site cannot sign in.
        if (!user.id) return true;
        const [u] = await db.select({ d: schema.users.disabledAt }).from(schema.users).where(eq(schema.users.id, user.id));
        return !u?.d;
      },
      session({ session, user }) {
        session.user.id = user.id;
        return session;
      },
    },
    events: {
      async createUser({ user }) {
        if (user.id) await track(db, "signup", user.id);
      },
      // The owner is whoever signs in with OWNER_EMAIL.
      async signIn({ user, account }) {
        if (user.id) {
          await track(db, "login", user.id);
          await db.update(schema.users).set({ lastSeenAt: new Date() }).where(eq(schema.users.id, user.id));
        }
        // Connecting Google Calendar is a second consent. Auth.js only stores tokens on first link,
        // so keep the fresh ones (with the calendar scope) on the existing account row.
        if (account?.provider === "google" && account.scope?.includes("calendar") && account.providerAccountId) {
          await db
            .update(schema.accounts)
            .set({
              access_token: account.access_token ?? null,
              refresh_token: account.refresh_token ?? undefined,
              expires_at: account.expires_at ?? null,
              scope: account.scope,
              token_type: account.token_type ?? null,
            })
            .where(and(eq(schema.accounts.provider, "google"), eq(schema.accounts.providerAccountId, account.providerAccountId)));
        }
        const owner = process.env.OWNER_EMAIL?.toLowerCase();
        if (owner && user.email?.toLowerCase() === owner && user.id) {
          await db.update(schema.users).set({ isOwner: true }).where(eq(schema.users.id, user.id));
        }
      },
    },
  };
});
