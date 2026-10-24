// Seeds the merch store from data/merch.json (validated). Idempotent by product id.
// Usage: npx tsx scripts/seed-merch.ts [path/to/merch.json]
import { config } from "dotenv";
config({ path: ".env.local" });
import { readFileSync } from "node:fs";
import { eq, ilike } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { normalizeName, derivedAliases } from "@/lib/identity/normalize";

const Product = z.object({
  id: z.string().min(1),
  artist: z.string().min(1).optional(),
  name: z.string().min(1),
  description: z.string().optional().default(""),
  image: z.string().optional().default(""),
  priceInr: z.number().int().nonnegative(),
  category: z.string().optional().default("other"),
  sizes: z.array(z.string()).default(["Free"]),
  stock: z.record(z.string(), z.number().int().nonnegative()).default({}),
});
const File = z.object({ products: z.array(Product) });

async function main() {
  const db = getDb();
  const { products } = File.parse(JSON.parse(readFileSync(process.argv[2] ?? "data/merch.json", "utf8")));
  for (const p of products) {
    let artistId: string | null = null;
    if (p.artist) {
      const norm = normalizeName(p.artist);
      const [found] = await db.select().from(schema.artists).where(eq(schema.artists.normalizedName, norm));
      if (found) artistId = found.id;
      else {
        const [near] = await db.select().from(schema.artists).where(ilike(schema.artists.name, p.artist));
        artistId = near?.id ?? (await db.insert(schema.artists).values({ name: p.artist, normalizedName: norm, aliases: derivedAliases(p.artist), identityStatus: "unverified" }).returning())[0].id;
      }
    }
    const vals = { artistId, name: p.name, description: p.description, imageUrl: p.image || null, priceInr: p.priceInr, category: p.category, isDemo: true, active: true };
    await db.insert(schema.merchProducts).values({ id: p.id, ...vals }).onConflictDoUpdate({ target: schema.merchProducts.id, set: vals });
    for (const size of p.sizes) {
      const stock = p.stock[size] ?? 0;
      await db.insert(schema.merchVariants).values({ productId: p.id, size, sku: `${p.id}-${size}`, stock }).onConflictDoUpdate({ target: [schema.merchVariants.productId, schema.merchVariants.size], set: { stock } });
    }
    console.log("seeded", p.id, p.name);
  }
  console.log(`${products.length} products`);
}
main();
