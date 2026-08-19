#!/usr/bin/env node
/**
 * Applies src/lib/db/schema.sql. Idempotent — safe to re-run.
 *
 *   npm run db:setup
 *
 * Reads DATABASE_URL from the environment, falling back to .env.local so it
 * works the same way `next dev` does.
 */
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
  console.error(
    "DATABASE_URL is not set.\nCopy .env.example to .env.local and fill it in first.",
  );
  process.exit(1);
}

const schema = readFileSync(join(root, "src/lib/db/schema.sql"), "utf8");

const client = new pg.Client({
  connectionString,
  ssl: /\blocalhost\b|\b127\.0\.0\.1\b/.test(connectionString)
    ? undefined
    : { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query(schema);
  const { rows } = await client.query(
    "SELECT (SELECT count(*)::int FROM products) AS products," +
      " (SELECT count(*)::int FROM subscribers) AS subscribers," +
      " (SELECT count(*)::int FROM enquiries) AS enquiries",
  );
  console.log(
    `Schema applied. products: ${rows[0].products} row(s), ` +
      `subscribers: ${rows[0].subscribers} row(s), ` +
      `enquiries: ${rows[0].enquiries} row(s).`,
  );
} catch (error) {
  console.error("Setup failed:", error.message);
  process.exit(1);
} finally {
  await client.end();
}
