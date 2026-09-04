#!/usr/bin/env node
/**
 * Restores database-dump.sql to the local PostgreSQL database.
 *
 *   npm run db:restore
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
    "❌ DATABASE_URL is not set.\nCopy .env.example to .env.local and fill in your PostgreSQL URL.",
  );
  process.exit(1);
}

const dumpFile = join(root, "database-dump.sql");
if (!existsSync(dumpFile)) {
  console.error("❌ database-dump.sql not found at project root.");
  process.exit(1);
}

const dumpSql = readFileSync(dumpFile, "utf8");

const client = new pg.Client({
  connectionString,
  ssl: /\blocalhost\b|\b127\.0\.0\.1\b/.test(connectionString)
    ? undefined
    : { rejectUnauthorized: false },
});

try {
  console.log("Connecting to PostgreSQL...");
  await client.connect();
  console.log("Applying schema and importing data from database-dump.sql...");
  await client.query(dumpSql);

  const { rows } = await client.query(
    "SELECT (SELECT count(*)::int FROM products) AS products," +
      " (SELECT count(*)::int FROM subscribers) AS subscribers," +
      " (SELECT count(*)::int FROM enquiries) AS enquiries",
  );
  console.log(
    `✅ Database restored successfully!\n   Products: ${rows[0].products} row(s)\n   Subscribers: ${rows[0].subscribers} row(s)\n   Enquiries: ${rows[0].enquiries} row(s)`,
  );
} catch (error) {
  console.error("❌ Restore failed:", error.message);
  process.exit(1);
} finally {
  await client.end();
}
