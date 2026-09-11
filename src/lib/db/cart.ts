import { query } from "@/lib/db/client";
import type { CartLine } from "@/lib/cart";

const MAX_LINES = 50;
const MAX_QTY = 99;

/**
 * Normalises raw cart lines array into clean CartLine[].
 */
export function sanitizeCartLines(input: unknown): CartLine[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const lines: CartLine[] = [];

  for (const entry of input) {
    if (typeof entry !== "object" || entry === null) continue;
    const { slug, qty } = entry as { slug?: unknown; qty?: unknown };
    if (typeof slug !== "string" || !slug || seen.has(slug)) continue;

    const n = typeof qty === "number" && Number.isFinite(qty) ? Math.floor(qty) : 1;
    if (n < 1) continue;

    seen.add(slug);
    lines.push({ slug, qty: Math.min(n, MAX_QTY) });
    if (lines.length >= MAX_LINES) break;
  }

  return lines;
}

/**
 * Fetches the customer's saved cart from PostgreSQL.
 */
export async function getCustomerCart(customerId: string): Promise<CartLine[]> {
  if (!customerId) return [];

  const rows = await query<{ items: unknown }>(
    `SELECT items FROM customer_carts WHERE customer_id = $1 LIMIT 1`,
    [customerId],
  );

  if (rows.length === 0 || !rows[0]?.items) {
    return [];
  }

  return sanitizeCartLines(rows[0].items);
}

/**
 * Persists the customer's cart into PostgreSQL.
 */
export async function saveCustomerCart(customerId: string, lines: CartLine[]): Promise<void> {
  if (!customerId) return;

  const sanitized = sanitizeCartLines(lines);

  await query(
    `INSERT INTO customer_carts (customer_id, items, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (customer_id)
     DO UPDATE SET items = EXCLUDED.items, updated_at = now()`,
    [customerId, JSON.stringify(sanitized)],
  );
}

/**
 * Merges guest items into the customer's database cart:
 * - If product exists in both, quantities are added (capped at MAX_QTY).
 * - If product exists only in guest, it is appended.
 * - Saves merged cart into the database and returns it.
 */
export async function mergeCustomerCart(
  customerId: string,
  guestLines: CartLine[],
): Promise<CartLine[]> {
  if (!customerId) return sanitizeCartLines(guestLines);

  const existing = await getCustomerCart(customerId);
  const cleanGuest = sanitizeCartLines(guestLines);

  if (cleanGuest.length === 0) {
    return existing;
  }

  const map = new Map<string, number>();

  // Add existing account items first
  for (const item of existing) {
    map.set(item.slug, item.qty);
  }

  // Merge guest items
  for (const item of cleanGuest) {
    const curr = map.get(item.slug) ?? 0;
    map.set(item.slug, Math.min(curr + item.qty, MAX_QTY));
  }

  const merged: CartLine[] = [];
  for (const [slug, qty] of map.entries()) {
    merged.push({ slug, qty });
    if (merged.length >= MAX_LINES) break;
  }

  await saveCustomerCart(customerId, merged);
  return merged;
}
