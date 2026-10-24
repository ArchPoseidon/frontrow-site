import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// One lightweight HTTP client per call: fits serverless, and the pooled
// Neon URL absorbs cold starts and connection limits.
export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return drizzle(neon(url), { schema });
}

export type Db = ReturnType<typeof getDb>;
export * as schema from "./schema";
