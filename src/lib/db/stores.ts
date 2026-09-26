import { randomUUID } from "node:crypto";
import { query } from "./client";
import { listProductsByIds } from "./products";
import type { Store, StorePickup, StoreProduct } from "@/lib/types";

/**
 * Stores and what they hold (client, 2026-09-26).
 *
 * The only module that touches `stores` and `store_products`. Reads fail soft
 * and return nothing, the way the rest of `lib/db` does — an admin page with
 * an empty list beats a 500 — while writes report what happened, because the
 * caller shows the result.
 */

type StoreRow = {
  id: string;
  slug: string;
  nickname: string;
  contact_name: string;
  contact_role: string;
  phone: string;
  email: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  pickup_id: string | null;
  fetched_at: Date | null;
  pickup: unknown;
  notes: string;
  blocked_at: Date | null;
  sort_order: number;
  created_at: Date;
  product_count?: string;
};

const STORE_SELECT = `id, slug, nickname, contact_name, contact_role, phone, email, line1, line2,
  city, state, postal_code, country, pickup_id, fetched_at, pickup, notes, blocked_at,
  sort_order, created_at`;

/**
 * The fetched details, key by key.
 *
 * A whitelist, not a cast: the column holds a copy of somebody else's record,
 * and it arrives through a form field like anything else. Anything unknown, or
 * longer than a label has any business being, is dropped rather than stored
 * and rendered.
 */
const PICKUP_TEXT = [
  "rto", "alternatePhone", "gstin", "openTime", "closeTime",
  "warehouseCode", "addressType", "tag", "instruction",
] as const;

export function asStorePickup(value: unknown): StorePickup {
  if (!value || typeof value !== "object") return {};
  const row = value as Record<string, unknown>;
  const clean: StorePickup = {};
  for (const key of PICKUP_TEXT) {
    const text = typeof row[key] === "string" ? (row[key] as string).trim().slice(0, 120) : "";
    if (text) Object.assign(clean, { [key]: text });
  }
  if (row.primary === true) clean.primary = true;
  if (row.verified === true) clean.verified = true;
  return clean;
}

function mapStore(row: StoreRow): Store {
  return {
    id: row.id,
    slug: row.slug,
    nickname: row.nickname,
    contactName: row.contact_name ?? "",
    contactRole: row.contact_role ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    line1: row.line1 ?? "",
    line2: row.line2 ?? "",
    city: row.city ?? "",
    state: row.state ?? "",
    postalCode: row.postal_code ?? "",
    country: row.country ?? "India",
    pickupId: row.pickup_id,
    fetchedAt: row.fetched_at ? row.fetched_at.toISOString() : null,
    pickup: asStorePickup(row.pickup),
    notes: row.notes ?? "",
    blockedAt: row.blocked_at ? row.blocked_at.toISOString() : null,
    sortOrder: row.sort_order,
    createdAt: row.created_at.toISOString(),
    ...(row.product_count === undefined ? {} : { productCount: Number(row.product_count) }),
  };
}

/**
 * The page address for a store, from its nickname.
 *
 * Taken once, at creation, and never again: `/admin/inventory/warehouse` is
 * written on somebody's phone the day it is made, and a rename must not break
 * it. A collision gets a number, because two stores may reasonably be called
 * the same thing in two towns even though their nicknames cannot match.
 */
/** Segments the inventory routes own, which a store cannot be called. */
const RESERVED = new Set(["new", "edit", "add"]);

export function storeSlug(nickname: string): string {
  const base =
    nickname
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "store";
  /* `/admin/inventory/new` is the page for making one, and a static segment
     wins over `[store]` in Next's router — so a store called "New" would be
     unreachable rather than merely confusing. */
  return RESERVED.has(base) ? `${base}-store` : base;
}

export async function listStores(q = ""): Promise<Store[]> {
  try {
    const term = q.trim();
    const rows = await query<StoreRow>(
      `SELECT ${STORE_SELECT},
              (SELECT count(*) FROM store_products sp WHERE sp.store_id = stores.id) AS product_count
         FROM stores
        WHERE $1 = '' OR nickname ILIKE $2 OR city ILIKE $2 OR postal_code ILIKE $2
                      OR line1 ILIKE $2 OR contact_name ILIKE $2 OR contact_role ILIKE $2
        ORDER BY sort_order, created_at`,
      [term, `%${term}%`],
    );
    return rows.map(mapStore);
  } catch (error) {
    console.error("[db] store list failed:", error);
    return [];
  }
}

export async function getStoreBySlug(slug: string): Promise<Store | null> {
  try {
    const rows = await query<StoreRow>(
      `SELECT ${STORE_SELECT} FROM stores WHERE slug = $1`,
      [slug],
    );
    return rows[0] ? mapStore(rows[0]) : null;
  } catch (error) {
    console.error("[db] store read failed:", error);
    return null;
  }
}

export async function getStoreById(id: string): Promise<Store | null> {
  try {
    const rows = await query<StoreRow>(`SELECT ${STORE_SELECT} FROM stores WHERE id = $1`, [id]);
    return rows[0] ? mapStore(rows[0]) : null;
  } catch (error) {
    console.error("[db] store read failed:", error);
    return null;
  }
}

export type StoreInput = {
  nickname: string;
  contactName: string;
  contactRole: string;
  phone: string;
  email: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  pickupId?: string | null;
  fetched?: boolean;
  pickup?: StorePickup;
  notes?: string;
};

export type StoreWriteResult =
  | { ok: true; store: Store }
  | { ok: false; reason: "duplicate" | "failed" };

/** A new store, appended after the last one. */
export async function createStore(input: StoreInput): Promise<StoreWriteResult> {
  const id = randomUUID();
  const base = storeSlug(input.nickname);
  /* One statement for the slug as well: the count decides the suffix, and a
     race between two creations is caught by the unique index below. */
  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
      try {
        const rows = await query<StoreRow>(
          `INSERT INTO stores (id, slug, nickname, contact_name, phone, email, line1, line2,
             city, state, postal_code, country, pickup_id, fetched_at, pickup, notes, sort_order,
             contact_role)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
                   CASE WHEN $14 THEN now() END, $15::jsonb, $16,
                   COALESCE((SELECT max(sort_order) + 1 FROM stores), 0), $17)
           RETURNING ${STORE_SELECT}`,
          [id, slug, input.nickname.trim(), input.contactName, input.phone, input.email,
           input.line1, input.line2, input.city, input.state, input.postalCode,
           input.country || "India", input.pickupId ?? null, Boolean(input.fetched),
           JSON.stringify(asStorePickup(input.pickup)), input.notes ?? "", input.contactRole ?? ""],
        );
        return { ok: true, store: mapStore(rows[0]) };
      } catch (error) {
        const code = (error as { code?: string }).code;
        const detail = String((error as { detail?: string }).detail ?? "");
        /* 23505 is the unique violation. A clashing nickname is the operator's
           to fix; a clashing slug is ours, so only that one is retried. */
        if (code === "23505" && detail.includes("slug")) continue;
        if (code === "23505") return { ok: false, reason: "duplicate" };
        throw error;
      }
    }
    return { ok: false, reason: "duplicate" };
  } catch (error) {
    console.error("[db] store create failed:", error);
    return { ok: false, reason: "failed" };
  }
}

/** Everything but the slug, which is fixed at creation. */
export async function updateStore(id: string, input: StoreInput): Promise<StoreWriteResult> {
  try {
    const rows = await query<StoreRow>(
      `UPDATE stores
          SET nickname = $2, contact_name = $3, phone = $4, email = $5, line1 = $6,
              contact_role = $16,
              line2 = $7, city = $8, state = $9, postal_code = $10, country = $11,
              pickup_id = $12, fetched_at = CASE WHEN $13 THEN now() ELSE fetched_at END,
              /* A fetch replaces the snapshot; a hand edit leaves it alone. */
              pickup = CASE WHEN $13 THEN $15::jsonb ELSE pickup END,
              notes = $14, updated_at = now()
        WHERE id = $1
        RETURNING ${STORE_SELECT}`,
      [id, input.nickname.trim(), input.contactName, input.phone, input.email, input.line1,
       input.line2, input.city, input.state, input.postalCode, input.country || "India",
       input.pickupId ?? null, Boolean(input.fetched), input.notes ?? "",
       JSON.stringify(asStorePickup(input.pickup)), input.contactRole ?? ""],
    );
    return rows[0] ? { ok: true, store: mapStore(rows[0]) } : { ok: false, reason: "failed" };
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return { ok: false, reason: "duplicate" };
    console.error("[db] store update failed:", error);
    return { ok: false, reason: "failed" };
  }
}

export async function setStoreBlocked(id: string, blocked: boolean): Promise<boolean> {
  try {
    const rows = await query<{ id: string }>(
      `UPDATE stores SET blocked_at = $2, updated_at = now() WHERE id = $1 RETURNING id`,
      [id, blocked ? new Date() : null],
    );
    return rows.length > 0;
  } catch (error) {
    console.error("[db] store block failed:", error);
    return false;
  }
}

/** The store and its stock rows. The products themselves are untouched. */
export async function deleteStore(id: string): Promise<boolean> {
  try {
    const rows = await query<{ id: string }>(
      `DELETE FROM stores WHERE id = $1 RETURNING id`,
      [id],
    );
    return rows.length > 0;
  } catch (error) {
    console.error("[db] store delete failed:", error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// What a store holds
// ---------------------------------------------------------------------------

type StoreProductRow = {
  id: string;
  store_id: string;
  product_id: string;
  qty: number;
  note: string;
  sort_order: number;
};

/**
 * What a store holds, in its own order.
 *
 * Two queries rather than a join: the stock rows here, the catalogue rows
 * through `listProductsByIds`, so `mapProductRow` remains the only code that
 * reads a product row. A row whose product has gone is dropped — the cascade
 * removes it anyway, and a half-empty card is worse than one row fewer.
 */
export async function listStoreProducts(storeId: string): Promise<StoreProduct[]> {
  try {
    const rows = await query<StoreProductRow>(
      `SELECT id, store_id, product_id, qty, note, sort_order
         FROM store_products
        WHERE store_id = $1
        ORDER BY sort_order, created_at`,
      [storeId],
    );
    const products = await listProductsByIds(rows.map((row) => row.product_id));
    return rows.flatMap((row) => {
      const product = products.get(row.product_id);
      if (!product) return [];
      return [{
        id: row.id,
        storeId: row.store_id,
        productId: row.product_id,
        qty: Number(row.qty),
        note: row.note ?? "",
        sortOrder: Number(row.sort_order),
        product,
      }];
    });
  } catch (error) {
    console.error("[db] store products failed:", error);
    return [];
  }
}

/**
 * Adds products to a store, appended after what it already holds.
 *
 * Products already there are left exactly as they are — same quantity, same
 * place in the order — because the picker is "add these", not "this is now the
 * list". Returns how many were new.
 */
export async function addStoreProducts(storeId: string, productIds: string[]): Promise<number> {
  const ids = [...new Set(productIds.filter(Boolean))];
  if (ids.length === 0) return 0;
  try {
    const rows = await query<{ id: string }>(
      `INSERT INTO store_products (id, store_id, product_id, sort_order)
       SELECT gen_random_uuid()::text, $1, p.id,
              COALESCE((SELECT max(sort_order) + 1 FROM store_products WHERE store_id = $1), 0)
                + (row_number() OVER (ORDER BY array_position($2::text[], p.id)) - 1)
         FROM products p
        WHERE p.id = ANY($2::text[])
       ON CONFLICT (store_id, product_id) DO NOTHING
       RETURNING id`,
      [storeId, ids],
    );
    return rows.length;
  } catch (error) {
    console.error("[db] store product add failed:", error);
    return 0;
  }
}

export async function setStoreProductStock(
  id: string,
  qty: number,
  note: string,
): Promise<boolean> {
  try {
    const rows = await query<{ id: string }>(
      `UPDATE store_products SET qty = $2, note = $3, updated_at = now()
        WHERE id = $1 RETURNING id`,
      [id, Math.max(0, Math.floor(qty)), note.slice(0, 200)],
    );
    return rows.length > 0;
  } catch (error) {
    console.error("[db] store stock update failed:", error);
    return false;
  }
}

export async function removeStoreProduct(id: string): Promise<boolean> {
  try {
    const rows = await query<{ id: string }>(
      `DELETE FROM store_products WHERE id = $1 RETURNING id`,
      [id],
    );
    return rows.length > 0;
  } catch (error) {
    console.error("[db] store product remove failed:", error);
    return false;
  }
}

/** The order the rows were dragged into, written in one statement. */
export async function reorderStoreProducts(storeId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    await query(
      `UPDATE store_products AS sp
          SET sort_order = v.position, updated_at = now()
         FROM (SELECT id, ordinality - 1 AS position
                 FROM unnest($2::text[]) WITH ORDINALITY AS t(id, ordinality)) AS v
        WHERE sp.id = v.id AND sp.store_id = $1`,
      [storeId, ids],
    );
  } catch (error) {
    console.error("[db] store product reorder failed:", error);
  }
}

// ---------------------------------------------------------------------------
// A store as an account (client, 2026-09-26)
// ---------------------------------------------------------------------------

/**
 * The store behind a sign-in: matched on its own page's slug and the email
 * Shiprocket gave as the pickup in-charge.
 *
 * Scoped to one store rather than looked up by email alone, because two
 * locations may share a manager and the address bar already says which one is
 * being signed in to.
 */
export async function findStoreForSignIn(
  slug: string,
  email: string,
): Promise<{ id: string; blocked: boolean; hash: string | null } | null> {
  const rows = await query<{ id: string; blocked_at: Date | null; password_hash: string | null }>(
    `SELECT id, blocked_at, password_hash FROM stores
      WHERE slug = $1 AND lower(email) = lower($2) AND email <> ''`,
    [slug, email],
  );
  const row = rows[0];
  return row
    ? { id: row.id, blocked: Boolean(row.blocked_at), hash: row.password_hash }
    : null;
}

/** For the emailed link: the store at this page with an address to send to. */
export async function findStoreBySlugWithEmail(
  slug: string,
): Promise<{ id: string; email: string; contactName: string; nickname: string } | null> {
  const rows = await query<{ id: string; email: string; contact_name: string; nickname: string }>(
    `SELECT id, email, contact_name, nickname FROM stores WHERE slug = $1 AND email <> ''`,
    [slug],
  );
  const row = rows[0];
  return row
    ? { id: row.id, email: row.email, contactName: row.contact_name ?? "", nickname: row.nickname }
    : null;
}

/** Sets the password and ends every session: a reset signs the others out. */
export async function setStorePassword(storeId: string, hash: string): Promise<void> {
  await query(`UPDATE stores SET password_hash = $2, updated_at = now() WHERE id = $1`, [storeId, hash]);
  await query(`DELETE FROM store_sessions WHERE store_id = $1`, [storeId]);
}

export async function createStoreSession(input: {
  id: string;
  storeId: string;
  userAgent: string;
  expiresAt: Date;
}): Promise<void> {
  await query(
    `INSERT INTO store_sessions (id, store_id, user_agent, expires_at) VALUES ($1,$2,$3,$4)`,
    [input.id, input.storeId, input.userAgent.slice(0, 200), input.expiresAt],
  );
}

/** The store a session belongs to, or null when it has expired or gone. */
export async function storeForSession(sessionId: string): Promise<Store | null> {
  try {
    const rows = await query<StoreRow>(
      `SELECT ${STORE_SELECT} FROM stores
        WHERE id = (SELECT store_id FROM store_sessions
                     WHERE id = $1 AND expires_at > now())`,
      [sessionId],
    );
    return rows[0] ? mapStore(rows[0]) : null;
  } catch (error) {
    console.error("[db] store session read failed:", error);
    return null;
  }
}

export async function deleteStoreSession(sessionId: string): Promise<void> {
  await query(`DELETE FROM store_sessions WHERE id = $1`, [sessionId]);
}

export async function createStoreToken(input: {
  hashedId: string;
  storeId: string;
  expiresAt: Date;
}): Promise<void> {
  await query(`DELETE FROM store_tokens WHERE store_id = $1 AND kind = 'reset'`, [input.storeId]);
  await query(
    `INSERT INTO store_tokens (id, store_id, kind, expires_at) VALUES ($1,$2,'reset',$3)`,
    [input.hashedId, input.storeId, input.expiresAt],
  );
}

/** Single use: the row is deleted as it is read. */
export async function consumeStoreToken(hashedId: string): Promise<string | null> {
  const rows = await query<{ store_id: string }>(
    `DELETE FROM store_tokens
      WHERE id = $1 AND kind = 'reset' AND expires_at > now()
      RETURNING store_id`,
    [hashedId],
  );
  return rows[0]?.store_id ?? null;
}

/** One product's count, by the store itself: set it, or step it. */
export async function adjustStoreProductStock(
  storeId: string,
  rowId: string,
  change: { to?: number; by?: number },
): Promise<number | null> {
  const rows = await query<{ qty: number }>(
    `UPDATE store_products
        SET qty = GREATEST(0, CASE WHEN $3::int IS NOT NULL THEN $3::int ELSE qty + $4::int END),
            updated_at = now()
      WHERE id = $1 AND store_id = $2
      RETURNING qty`,
    [rowId, storeId, change.to ?? null, change.by ?? 0],
  );
  return rows[0] ? Number(rows[0].qty) : null;
}
