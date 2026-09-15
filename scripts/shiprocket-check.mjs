#!/usr/bin/env node
/**
 * Checks the Shiprocket setup end to end, without the website.
 *
 *   npm run shiprocket:check            # quotes to a default PIN code
 *   npm run shiprocket:check 560001     # quotes to one you name
 *
 * Exists because the alternative — set the variables, restart the dev server,
 * register, add a product, add an address, and read one line of a summary
 * panel — is a slow way to find out you mistyped a password. This does the
 * same two API calls checkout does and prints exactly what came back.
 *
 * Reads `.env.local` the same way `next dev` does, so it tests the values the
 * site will actually use rather than a copy of them.
 *
 * Deliberately standalone: it re-implements the two `fetch` calls rather than
 * importing `lib/shiprocket.ts`, because that module is TypeScript with `@/`
 * path aliases and this has to run under plain `node` with no build step —
 * the same reason `scripts/db-setup.mjs` does not import `lib/db/client.ts`.
 * The two are small and the shapes are asserted below, so drift shows up here
 * as a failed check rather than as a wrong answer.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://apiv2.shiprocket.in/v1/external";

function loadEnvLocal() {
  const file = join(root, ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.trim().replace(/^["']|["']$/g, "");
  }
}
loadEnvLocal();

const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const bad = (m) => console.log(`  \x1b[31m✗\x1b[0m ${m}`);
const info = (m) => console.log(`    ${m}`);

const {
  SHIPROCKET_EMAIL: email,
  SHIPROCKET_PASSWORD: password,
  SHIPROCKET_PICKUP_PINCODE: pickup,
  SHIPROCKET_PICKUP_LOCATION: location,
  SHIPROCKET_WEBHOOK_TOKEN: webhookToken,
} = process.env;

const destination = process.argv[2] || "560001";

console.log("\nShiprocket setup check\n");

// --- 1. The variables ------------------------------------------------------
console.log("1. Environment");
let fatal = false;
for (const [name, value] of [
  ["SHIPROCKET_EMAIL", email],
  ["SHIPROCKET_PASSWORD", password],
  ["SHIPROCKET_PICKUP_PINCODE", pickup],
]) {
  if (value) ok(`${name} is set`);
  else {
    bad(`${name} is NOT set`);
    fatal = true;
  }
}
if (location) ok(`SHIPROCKET_PICKUP_LOCATION = "${location}"`);
else info(`SHIPROCKET_PICKUP_LOCATION unset — the code will send "Primary"`);
if (webhookToken) ok("SHIPROCKET_WEBHOOK_TOKEN is set (needed only on the server)");
else info("SHIPROCKET_WEBHOOK_TOKEN unset — tracking updates will be rejected");

if (fatal) {
  console.log("\nSet the missing values in .env.local, then run this again.");
  console.log("See docs/SETUP-GUIDE.md §5.4–5.5.\n");
  process.exit(1);
}

if (!/^[1-9][0-9]{5}$/.test(pickup)) {
  bad(`SHIPROCKET_PICKUP_PINCODE "${pickup}" is not a valid Indian PIN code`);
  process.exit(1);
}

// --- 2. Login --------------------------------------------------------------
console.log("\n2. Login (Settings → API → Configure)");
let token;
try {
  const response = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    bad(`Login failed — HTTP ${response.status}`);
    info((await response.text()).slice(0, 200));
    console.log(
      response.status === 403
        ? "\n  403 almost always means the API user's password is wrong, or\n" +
            "  you used your dashboard login instead of an API user.\n" +
            "  Create one at Settings → API → Configure (SETUP-GUIDE §5.5).\n"
        : "",
    );
    process.exit(1);
  }

  ({ token } = await response.json());
  if (!token) {
    bad("Login returned no token");
    process.exit(1);
  }
  ok("Logged in, token received");
} catch (error) {
  bad(`Could not reach Shiprocket: ${error.message}`);
  process.exit(1);
}

// --- 3. Pickup addresses ---------------------------------------------------
console.log("\n3. Pickup addresses (Settings → Pickup Addresses)");
try {
  const response = await fetch(`${API}/settings/company/pickup`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  });

  if (response.ok) {
    const body = await response.json();
    const list = body?.data?.shipping_address ?? [];
    if (list.length === 0) {
      bad("No pickup address registered — rates cannot be calculated");
      info("Add one: Settings → Pickup Addresses (SETUP-GUIDE §5.4)");
    } else {
      ok(`${list.length} registered`);
      const wanted = location || "Primary";
      for (const a of list) {
        const nick = a.pickup_location;
        const mark = nick === wanted ? "  ← matches SHIPROCKET_PICKUP_LOCATION" : "";
        info(`"${nick}"  PIN ${a.pin_code}${mark}`);
      }
      const match = list.find((a) => a.pickup_location === wanted);
      if (!match) {
        bad(`None is nicknamed "${wanted}" — booking will fail`);
        info("Set SHIPROCKET_PICKUP_LOCATION to one of the names above.");
      } else if (String(match.pin_code) !== String(pickup)) {
        bad(
          `"${wanted}" has PIN ${match.pin_code}, but SHIPROCKET_PICKUP_PINCODE is ${pickup}`,
        );
        info("Rates would be quoted from the wrong origin. Make them match.");
      } else {
        ok(`"${wanted}" matches PIN ${pickup}`);
      }
    }
  } else {
    info(`Could not list them (HTTP ${response.status}) — not fatal, continuing`);
  }
} catch (error) {
  info(`Could not list them (${error.message}) — not fatal, continuing`);
}

// --- 4. A real quote -------------------------------------------------------
/* A representative parcel — roughly the `starter` estimate in lib/parcel.ts —
   rather than a bare weight. Dimensions are sent because they change the
   answer enormously: the same 2 kg quoted ₹128 in a 15 cm box and ₹1,443 in a
   60 cm one. A dimensionless probe would report a price the site never
   charges. */
const SAMPLE = { weightKg: 3.5, lengthCm: 28, breadthCm: 20, heightCm: 14 };
console.log(
  `\n4. Rate quote — ${pickup} → ${destination}` +
    `\n   sample parcel: ${SAMPLE.weightKg} kg, ${SAMPLE.lengthCm}×${SAMPLE.breadthCm}×${SAMPLE.heightCm} cm, ₹5,000 declared`,
);
try {
  const query = new URLSearchParams({
    pickup_postcode: pickup,
    delivery_postcode: destination,
    weight: SAMPLE.weightKg.toFixed(2),
    length: String(SAMPLE.lengthCm),
    breadth: String(SAMPLE.breadthCm),
    height: String(SAMPLE.heightCm),
    cod: "0",
    declared_value: "5000",
  });

  const response = await fetch(`${API}/courier/serviceability/?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  });

  if (response.status === 404) {
    bad(`No courier serves ${pickup} → ${destination}`);
    info("Checkout would show 'Quoted on our call' for this address.");
    info("Try a metro PIN code to confirm the account itself works: 560001");
    process.exit(0);
  }
  if (!response.ok) {
    bad(`Serviceability failed — HTTP ${response.status}`);
    info((await response.text()).slice(0, 200));
    process.exit(1);
  }

  const body = await response.json();
  const couriers = body?.data?.available_courier_companies ?? [];
  if (couriers.length === 0) {
    bad("No couriers returned");
    process.exit(0);
  }

  ok(`${couriers.length} couriers available`);
  const priced = couriers
    .map((c) => ({
      name: c.courier_name,
      rate: Number(c.rate),
      days: Number(c.estimated_delivery_days),
    }))
    .filter((c) => Number.isFinite(c.rate) && c.rate > 0)
    .sort((a, b) => a.rate - b.rate);

  for (const c of priced.slice(0, 5)) {
    info(
      `₹${c.rate.toFixed(2).padStart(8)}  ${c.name}` +
        (Number.isFinite(c.days) && c.days > 0 ? `  (~${c.days} days)` : ""),
    );
  }
  if (priced.length > 5) info(`… and ${priced.length - 5} more`);

  const cheapest = priced[0];
  console.log("");
  ok(`Cheapest for this sample: \x1b[1m₹${cheapest.rate.toFixed(2)}\x1b[0m via ${cheapest.name}`);
  info("Checkout offers the cheapest and, where one is meaningfully faster,");
  info("an Express option beside it — the customer picks. The real figure");
  info("depends on the actual parcel (lib/parcel.ts), not this sample.");
} catch (error) {
  bad(`Quote failed: ${error.message}`);
  process.exit(1);
}

console.log(`
Done. Live rates are working.

Still to do:
  • Enter real weights AND box sizes in /admin/products  (SETUP-GUIDE §5.6)
    Until then each product uses its category estimate from lib/parcel.ts.
    Dimensions matter more than weight: couriers bill the greater of actual
    and volumetric weight (L×B×H/5000).
  • The tracking webhook needs the live site  (SETUP-GUIDE §5.8)
    It cannot be set up from a laptop — Shiprocket must reach the URL.
`);
