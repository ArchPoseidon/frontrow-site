import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb, schema } from "@/lib/db";

// Server-side session check used by every route that touches user data.
export async function requireUser() {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const db = getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  return user && !user.disabledAt ? { db, user } : null; // an account the owner disabled is signed out of everything
}

export const unauthorized = () => Response.json({ error: "Please sign in" }, { status: 401 });
