#!/usr/bin/env node
/**
 * Exports the complete database (schema + all products, subscribers, enquiries)
 * to database-dump.sql so it can be shared with team members/seniors.
 *
 *   npm run db:export
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
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

const client = new pg.Client({
  connectionString,
  ssl: /\blocalhost\b|\b127\.0\.0\.1\b/.test(connectionString)
    ? undefined
    : { rejectUnauthorized: false },
});

function sqlVal(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number") return v;
  if (typeof v === "object")
    return "'" + JSON.stringify(v).replace(/'/g, "''") + "'";
  return "'" + String(v).replace(/'/g, "''") + "'";
}

try {
  await client.connect();
  const schema = readFileSync(join(root, "src/lib/db/schema.sql"), "utf8");

  const products = await client.query(
    "SELECT * FROM products ORDER BY sort_order ASC, created_at ASC",
  );
  const subscribers = await client.query("SELECT * FROM subscribers");
  const enquiries = await client.query("SELECT * FROM enquiries");

  let dump =
    "-- VKON Full Database Dump\n-- Exported on " +
    new Date().toISOString() +
    "\n\n";
  dump += schema + "\n\n";
  dump +=
    "-- Clear existing tables before population\nTRUNCATE products, subscribers, enquiries RESTART IDENTITY;\n\n";

  dump += "-- Insert Products (" + products.rows.length + " rows)\n";
  for (const row of products.rows) {
    const keys = Object.keys(row);
    const cols = keys.join(", ");
    const vals = keys.map((k) => sqlVal(row[k])).join(", ");
    dump += `INSERT INTO products (${cols}) VALUES (${vals});\n`;
  }

  dump += "\n-- Insert Subscribers (" + subscribers.rows.length + " rows)\n";
  for (const row of subscribers.rows) {
    const keys = Object.keys(row);
    dump += `INSERT INTO subscribers (${keys.join(", ")}) VALUES (${keys.map((k) => sqlVal(row[k])).join(", ")});\n`;
  }

  dump += "\n-- Insert Enquiries (" + enquiries.rows.length + " rows)\n";
  for (const row of enquiries.rows) {
    const keys = Object.keys(row);
    dump += `INSERT INTO enquiries (${keys.join(", ")}) VALUES (${keys.map((k) => sqlVal(row[k])).join(", ")});\n`;
  }

  const dumpPath = join(root, "database-dump.sql");
  writeFileSync(dumpPath, dump);
  console.log(
    `✅ Successfully exported database to database-dump.sql\n   Products: ${products.rows.length} row(s)\n   Subscribers: ${subscribers.rows.length} row(s)\n   Enquiries: ${enquiries.rows.length} row(s)`,
  );
} catch (error) {
  console.error("❌ Export failed:", error.message);
  process.exit(1);
} finally {
  await client.end();
}
