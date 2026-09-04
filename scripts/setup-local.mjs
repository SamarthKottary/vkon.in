#!/usr/bin/env node
/**
 * One-click automated setup script for local development.
 *
 *   npm run setup:local
 */
import { existsSync, copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

console.log("🚀 Starting VKON Local Setup...\n");

// 1. Ensure .env.local exists
const envLocal = join(root, ".env.local");
const envExample = join(root, ".env.example");

if (!existsSync(envLocal)) {
  if (existsSync(envExample)) {
    copyFileSync(envExample, envLocal);
    console.log("📄 Created .env.local from .env.example");
  } else {
    console.error("❌ .env.example missing.");
  }
} else {
  console.log("✔️ .env.local already exists");
}

// 2. Ensure data/uploads directory exists
const uploadsDir = join(root, "data", "uploads");
if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true });
  console.log("📁 Created data/uploads directory");
} else {
  console.log("✔️ data/uploads directory present");
}

// 3. Check / Install dependencies
if (!existsSync(join(root, "node_modules"))) {
  console.log("📦 Installing dependencies (npm install)...");
  execSync("npm install", { stdio: "inherit", cwd: root });
} else {
  console.log("✔️ node_modules present");
}

// 4. Restore Database
console.log("\n🗄️ Restoring database from database-dump.sql...");
try {
  execSync("node scripts/db-restore.mjs", { stdio: "inherit", cwd: root });
} catch {
  console.error(
    "\n⚠️ Database restore failed. Please verify PostgreSQL is running and DATABASE_URL in .env.local is correct.",
  );
  process.exit(1);
}

console.log("\n🎉 Setup complete!");
console.log("To start the local development server, run:");
console.log("   npm run dev\n");
