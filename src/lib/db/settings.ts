import { isDatabaseConfigured, query } from "./client";

/**
 * Runtime switches, in `site_settings` (2026-09-21).
 *
 * The only module that knows what a key means. Everything else asks a named
 * question — `isSigninCodeOn()` — so a typo in a key string cannot silently
 * turn a security control off.
 */

const SIGNIN_CODE = "signin_code";
const INVOICE_GSTIN = "invoice_gstin";

async function getSetting(key: string): Promise<string | null> {
  if (!isDatabaseConfigured()) return null;
  const rows = await query<{ value: string }>(
    `SELECT value FROM site_settings WHERE key = $1`,
    [key],
  );
  return rows[0]?.value ?? null;
}

/** Writes deliberately throw: the admin has to see a failed switch. */
async function setSetting(key: string, value: string): Promise<void> {
  await query(
    `INSERT INTO site_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, value],
  );
}

/**
 * Whether customers are asked for the emailed sign-in code (client,
 * 2026-09-21: one switch at the top of /admin/users, in place of the
 * per-account exemption).
 *
 * **Fails safe, unlike every other read in `lib/db`.** No row, no database,
 * a query that throws — all mean the code is required. Everywhere else an
 * empty result beats a 500 for a visitor; here the failure direction has to
 * be "the second factor stays on", because the alternative is a database
 * hiccup quietly removing it for everyone.
 */
export async function isSigninCodeOn(): Promise<boolean> {
  try {
    return (await getSetting(SIGNIN_CODE)) !== "off";
  } catch (error) {
    console.error("[db] sign-in code setting unreadable, keeping it on:", error);
    return true;
  }
}

/** Called only from an authenticated admin action. */
export async function setSigninCodeOn(on: boolean): Promise<void> {
  await setSetting(SIGNIN_CODE, on ? "on" : "off");
}

/**
 * The business's GST registration number, as printed on customer invoices
 * (client, 2026-09-25: a place for it in the super admin).
 *
 * In `site_settings` rather than `content/site.ts` because it is not content:
 * it is a registration that is applied for, changes, and can lapse — and an
 * invoice carrying a stale or borrowed GSTIN is a tax document that is wrong.
 * Empty means "not entered", and the invoice then simply has no GSTIN line
 * rather than a placeholder.
 */
export async function getInvoiceGstin(): Promise<string> {
  try {
    return (await getSetting(INVOICE_GSTIN)) ?? "";
  } catch (error) {
    console.error("[db] invoice GSTIN unreadable:", error);
    return "";
  }
}

/** Called only from the super-user action on /admin/profile. */
export async function setInvoiceGstin(gstin: string): Promise<void> {
  await setSetting(INVOICE_GSTIN, gstin.trim().toUpperCase());
}

/**
 * Whether a string is a GSTIN: two state digits, a ten-character PAN, an
 * entity digit, a `Z`, and a check character. Checked here so one rule serves
 * the form and anything else that ever writes it.
 */
export function isGstin(value: string): boolean {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(value.trim().toUpperCase());
}
