#!/usr/bin/env node
/**
 * Inserts one demo product so the site can be reviewed end to end.
 *
 *   npm run db:seed
 *
 * Everything it creates is placeholder content:
 *   - images  → public/products/demo-*.jpg (drawn by make-placeholder-images.py)
 *   - video   → Big Buck Bunny, a public-domain film, standing in for a real
 *               product walkthrough
 *   - copy    → written to be plausible, not accurate
 *
 * Delete the product from /admin once you have a real one. Re-running updates
 * the same row rather than creating duplicates.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
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
  console.error("DATABASE_URL is not set. Run `npm run db:setup` first.");
  process.exit(1);
}

const demo = {
  slug: "ec-dol-demo",
  name: "EC-DOL",
  category: "starter",
  tagline: "DEMO PRODUCT — three phase DOL starter with the full protection set",
  description: `This is a demonstration product created by \`npm run db:seed\`. The images are drawn placeholders and the video is a public-domain film standing in for a real walkthrough. Replace or delete it from the admin once you have a real product.

The EC-DOL is a direct-on-line starter for three phase submersible and openwell pumps between 3 and 10 HP. It reads current and voltage on all three phases continuously and displays them on the front panel, so a fault is visible as a number rather than a guess.

Protection covers the conditions that actually destroy pumps on a rural feeder: the borewell running dry, a phase dropping out on either the HT or LT line, supply outside the safe voltage band, and a reversed phase sequence after line work. Where it is safe to do so the panel restarts the motor on its own, so a night of irrigation is not lost to a trip that cleared itself at 2am.`,
  images: [
    { url: "/products/demo-front.jpg", alt: "EC-DOL control panel, front view with display and keypad" },
    { url: "/products/demo-angle.jpg", alt: "EC-DOL control panel, three-quarter view showing enclosure depth" },
    { url: "/products/demo-terminals.jpg", alt: "EC-DOL terminal block showing three phase, neutral and earth connections" },
  ],
  video_url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
  video_title: "Installation and settings walkthrough (placeholder video)",
  hp_ranges: ["3 – 7.5 HP", "10 HP"],
  features: [
    "Displays three phase amps and voltage continuously",
    "Instantaneous fault display, naming the last trip",
    "Auto start with adjustable power-on timer",
    "Dry run protection with automatic restart",
    "Cyclic timer with separate on and off periods",
    "CT-based overload with keypad-set trip point",
    "Single phase protection on both HT and LT line",
    "Compatible with the GSM mobile control unit",
  ],
  protections: [
    "dry-run",
    "hv-lv",
    "phase-reversal",
    "single-phase",
    "overload-relay",
    "rotary-lock",
    "auto-start-timer",
    "cyclic-timer",
    "voltage-current-sensing",
  ],
  spec: [
    { label: "Type", value: "DOL (direct on line)" },
    { label: "Supply", value: "3 phase, 280 – 440 V, 50 Hz" },
    { label: "Motor range", value: "3 – 10 HP" },
    { label: "Sensing", value: "CT based, all three phases" },
    { label: "Display", value: "Backlit LCD, amps and volts" },
    { label: "Enclosure", value: "IP54 polycarbonate" },
    { label: "Warranty", value: "6 months" },
  ],
  price: 12999,
  discount_percent: 47,
  published: true,
  featured: true,
  sort_order: 1,
};

const client = new pg.Client({
  connectionString,
  ssl: /\blocalhost\b|\b127\.0\.0\.1\b/.test(connectionString)
    ? undefined
    : { rejectUnauthorized: false },
});

try {
  await client.connect();

  const { rows } = await client.query(
    `INSERT INTO products (
       id, slug, name, category, tagline, description,
       hp_ranges, features, protections, spec, images,
       video_url, video_title, price, discount_percent, published, featured, sort_order
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     ON CONFLICT (slug) DO UPDATE SET
       name = EXCLUDED.name,
       tagline = EXCLUDED.tagline,
       description = EXCLUDED.description,
       hp_ranges = EXCLUDED.hp_ranges,
       features = EXCLUDED.features,
       protections = EXCLUDED.protections,
       spec = EXCLUDED.spec,
       images = EXCLUDED.images,
       video_url = EXCLUDED.video_url,
       video_title = EXCLUDED.video_title,
       price = EXCLUDED.price,
       discount_percent = EXCLUDED.discount_percent,
       updated_at = now()
     RETURNING slug`,
    [
      randomUUID(),
      demo.slug,
      demo.name,
      demo.category,
      demo.tagline,
      demo.description,
      demo.hp_ranges,
      demo.features,
      demo.protections,
      JSON.stringify(demo.spec),
      JSON.stringify(demo.images),
      demo.video_url,
      demo.video_title,
      demo.price,
      demo.discount_percent,
      demo.published,
      demo.featured,
      demo.sort_order,
    ],
  );

  console.log(`Seeded demo product: /products/${rows[0].slug}`);
} catch (error) {
  console.error("Seed failed:", error.message);
  process.exit(1);
} finally {
  await client.end();
}
