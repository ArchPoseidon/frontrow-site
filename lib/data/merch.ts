import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";

export type Variant = { id: string; size: string | null; stock: number };
export type Product = { id: string; name: string; description: string | null; imageUrl: string | null; priceInr: number; category: string | null; isDemo: boolean; artistId: string | null; artistName: string | null; variants: Variant[] };
export type MerchFilters = { artistIds?: string[]; min?: number; max?: number; sizes?: string[]; sort?: "new" | "price_asc" | "price_desc" };

export const SIZES = ["S", "M", "L", "XL", "Free"] as const;

async function attachVariants(db: Db, rows: { p: typeof schema.merchProducts.$inferSelect; artistName: string | null }[]): Promise<Product[]> {
  if (!rows.length) return [];
  const vs = await db.select().from(schema.merchVariants).where(inArray(schema.merchVariants.productId, rows.map((r) => r.p.id)));
  return rows.map(({ p, artistName }) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    imageUrl: p.imageUrl,
    priceInr: p.priceInr,
    category: p.category,
    isDemo: p.isDemo !== false,
    artistId: p.artistId,
    artistName,
    variants: vs.filter((v) => v.productId === p.id).map((v) => ({ id: v.id, size: v.size, stock: v.stock ?? 0 })),
  }));
}

export async function listProducts(db: Db, f: MerchFilters = {}): Promise<Product[]> {
  const where = and(
    eq(schema.merchProducts.active, true),
    f.artistIds?.length ? inArray(schema.merchProducts.artistId, f.artistIds) : undefined,
    f.min != null ? gte(schema.merchProducts.priceInr, f.min) : undefined,
    f.max != null ? lte(schema.merchProducts.priceInr, f.max) : undefined,
    f.sizes?.length ? sql`exists (select 1 from merch_variants v where v.product_id = ${schema.merchProducts.id} and v.size in (${sql.join(f.sizes.map((s) => sql`${s}`), sql`, `)}) and v.stock > 0)` : undefined,
  );
  const order = f.sort === "price_asc" ? asc(schema.merchProducts.priceInr) : f.sort === "price_desc" ? desc(schema.merchProducts.priceInr) : desc(schema.merchProducts.createdAt);
  const rows = await db
    .select({ p: schema.merchProducts, artistName: schema.artists.name })
    .from(schema.merchProducts)
    .leftJoin(schema.artists, eq(schema.artists.id, schema.merchProducts.artistId))
    .where(where)
    .orderBy(order)
    .limit(120);
  return attachVariants(db, rows);
}

export async function getProduct(db: Db, id: string): Promise<Product | null> {
  const rows = await db
    .select({ p: schema.merchProducts, artistName: schema.artists.name })
    .from(schema.merchProducts)
    .leftJoin(schema.artists, eq(schema.artists.id, schema.merchProducts.artistId))
    .where(and(eq(schema.merchProducts.id, id), eq(schema.merchProducts.active, true)));
  return (await attachVariants(db, rows))[0] ?? null;
}

export const productsForArtist = (db: Db, artistId: string) => listProducts(db, { artistIds: [artistId], sort: "new" });

// Artists that have merch, for the filter box.
export async function merchArtists(db: Db) {
  return db
    .selectDistinct({ id: schema.artists.id, name: schema.artists.name })
    .from(schema.merchProducts)
    .innerJoin(schema.artists, eq(schema.artists.id, schema.merchProducts.artistId))
    .where(and(eq(schema.merchProducts.active, true), eq(schema.artists.isDeceased, false)))
    .orderBy(schema.artists.name);
}

export async function priceBounds(db: Db) {
  const [r] = await db.select({ lo: sql<number>`coalesce(min(price_inr), 0)::int`, hi: sql<number>`coalesce(max(price_inr), 0)::int` }).from(schema.merchProducts).where(eq(schema.merchProducts.active, true));
  return r;
}
