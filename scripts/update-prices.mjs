#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvLocal() {
  const file = join(root, ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

loadEnvLocal();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: /\blocalhost\b|\b127\.0\.0\.1\b/.test(connectionString)
    ? undefined
    : { rejectUnauthorized: false },
});

const priceMap = {
  "ec-dol-demo": { price: 12999, discountPercent: 47 },
  "demo-dol-starter": { price: 8499, discountPercent: 20 },
  "demo-solar-controller": { price: 24999, discountPercent: 10 },
  "demo-auto-start-timer": { price: 3499, discountPercent: null },
  "demo-submersible-cable": { price: 4200, discountPercent: 12 },
  "demo-gsm-mobile-control": { price: 5999, discountPercent: null },
  "demo-industrial-dol": { price: 38500, discountPercent: 15 },
  "demo-wardrobe-auto-light": { price: 1499, discountPercent: 25 },
  "demo-staircase-auto-light": { price: 2899, discountPercent: null },
  "demo-kitchen-undercabinet-light": { price: 1999, discountPercent: 18 },
};

try {
  await client.connect();

  for (const [slug, data] of Object.entries(priceMap)) {
    await client.query(
      `UPDATE products 
       SET price = $1, discount_percent = $2, updated_at = now() 
       WHERE slug = $3`,
      [data.price, data.discountPercent, slug]
    );
  }

  // Fallback for any products in the DB not in priceMap
  await client.query(
    `UPDATE products 
     SET price = 4999, discount_percent = NULL, updated_at = now() 
     WHERE price IS NULL`
  );

  const { rows } = await client.query(
    `SELECT slug, name, price, discount_percent FROM products ORDER BY sort_order, name`
  );

  console.log("Successfully updated product prices in local database:");
  console.table(rows);
} catch (error) {
  console.error("Failed to update prices:", error);
  process.exit(1);
} finally {
  await client.end();
}
