import { randomUUID } from "node:crypto";
import { getPool, query } from "./client";
import type { Address } from "@/lib/types";

/**
 * Delivery addresses. The only module that touches the `addresses` table.
 *
 * **Every function takes a `customerId` and puts it in the WHERE clause.**
 * That is not defensive habit, it is the authorisation boundary: an address id
 * arrives from a form, so `UPDATE addresses WHERE id = $1` alone would let
 * anybody edit anybody's address by guessing a uuid. The id always comes from
 * the session (`requireCustomer()`), never from the request body.
 */

type AddressRow = {
  id: string;
  name: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  gstin: string;
  is_default: boolean;
};

const SELECT = `id, name, phone, line1, line2, city, state, postal_code, country, gstin, is_default`;

function mapRow(row: AddressRow): Address {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    line1: row.line1,
    line2: row.line2 ?? "",
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
    country: row.country || "India",
    /* Defaulted: rows written before the column existed come back null under
       `ADD COLUMN ... DEFAULT ''` only for new inserts, and a null here would
       reach a `.length` check in the form. */
    gstin: row.gstin ?? "",
    isDefault: row.is_default,
  };
}

export type AddressInput = Omit<Address, "id" | "isDefault">;

/** Default first, then newest. Reads fail soft — an account page with no
 *  addresses beats a 500 — but a write never does. */
export async function listAddresses(customerId: string): Promise<Address[]> {
  try {
    const rows = await query<AddressRow>(
      `SELECT ${SELECT} FROM addresses
        WHERE customer_id = $1
        ORDER BY is_default DESC, created_at DESC`,
      [customerId],
    );
    return rows.map(mapRow);
  } catch (error) {
    console.error("[db] address query failed:", error);
    return [];
  }
}

export async function getAddress(
  customerId: string,
  id: string,
): Promise<Address | null> {
  const rows = await query<AddressRow>(
    `SELECT ${SELECT} FROM addresses WHERE id = $1 AND customer_id = $2`,
    [id, customerId],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/**
 * Adds one.
 *
 * The first address a customer saves becomes their default automatically —
 * otherwise checkout would present a list of one with nothing selected, which
 * is a step nobody should have to take.
 *
 * `makeDefault` runs inside the same transaction as the insert, so there is
 * never a moment where two rows both claim to be the default or none does.
 */
export async function createAddress(
  customerId: string,
  input: AddressInput,
  makeDefault: boolean,
): Promise<string> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM addresses WHERE customer_id = $1`,
      [customerId],
    );
    const isFirst = Number(existing.rows[0]?.count ?? 0) === 0;
    const isDefault = makeDefault || isFirst;

    if (isDefault) {
      await client.query(
        `UPDATE addresses SET is_default = FALSE WHERE customer_id = $1`,
        [customerId],
      );
    }

    const id = randomUUID();
    await client.query(
      `INSERT INTO addresses
         (id, customer_id, name, phone, line1, line2, city, state, postal_code, country, gstin, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        id,
        customerId,
        input.name,
        input.phone,
        input.line1,
        input.line2,
        input.city,
        input.state,
        input.postalCode,
        input.country || "India",
        input.gstin,
        isDefault,
      ],
    );

    await client.query("COMMIT");
    return id;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateAddress(
  customerId: string,
  id: string,
  input: AddressInput,
): Promise<void> {
  await query(
    `UPDATE addresses
        SET name = $3, phone = $4, line1 = $5, line2 = $6, city = $7,
            state = $8, postal_code = $9, country = $10, gstin = $11,
            updated_at = now()
      WHERE id = $1 AND customer_id = $2`,
    [
      id,
      customerId,
      input.name,
      input.phone,
      input.line1,
      input.line2,
      input.city,
      input.state,
      input.postalCode,
      input.country || "India",
      input.gstin,
    ],
  );
}

/**
 * Deletes one, and promotes another to default if this was it.
 *
 * Without the promotion, deleting the default leaves an account with several
 * addresses and no default, and checkout arrives with nothing selected.
 */
export async function deleteAddress(customerId: string, id: string): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    const removed = await client.query<{ is_default: boolean }>(
      `DELETE FROM addresses WHERE id = $1 AND customer_id = $2 RETURNING is_default`,
      [id, customerId],
    );

    if (removed.rows[0]?.is_default) {
      await client.query(
        `UPDATE addresses SET is_default = TRUE
          WHERE id = (
            SELECT id FROM addresses WHERE customer_id = $1
             ORDER BY created_at DESC LIMIT 1
          )`,
        [customerId],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Exactly one row ends up default, enforced here rather than by a partial
 *  unique index — an index would reject the first statement of the two-step
 *  "set the new one, clear the old" no matter which order they ran in. */
export async function setDefaultAddress(
  customerId: string,
  id: string,
): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE addresses SET is_default = FALSE WHERE customer_id = $1`,
      [customerId],
    );
    await client.query(
      `UPDATE addresses SET is_default = TRUE WHERE id = $1 AND customer_id = $2`,
      [id, customerId],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
