import { randomBytes, randomUUID } from "node:crypto";
import { getPool, isDatabaseConfigured, query } from "./client";
import type {
  Order,
  OrderItem,
  OrderStatus,
  PaymentStatus,
  ShipTo,
} from "@/lib/types";

/**
 * Orders. The only module that touches `orders` and `order_items`.
 *
 * Two rules carried over from schema.sql, restated because they are the ones
 * that get broken by a well-meaning refactor:
 *
 *  1. **Every amount is integer paise.** Nothing here divides by 100.
 *  2. **A line item is a snapshot, not a join.** Names, prices and images are
 *     copied in at the moment of purchase. A product renamed or deleted next
 *     year must not change what an order from today says it was.
 */

type OrderRow = {
  id: string;
  order_number: string;
  customer_id: string;
  status: string;
  payment_status: string;
  subtotal: number;
  cgst: number;
  sgst: number;
  shipping: number;
  total: number;
  currency: string;
  ship_to: ShipTo;
  bill_to: ShipTo | null;
  notes: string;
  payment_provider: string | null;
  payment_order_id: string | null;
  payment_id: string | null;
  paid_at: Date | null;
  created_at: Date;
};

type ItemRow = {
  id: string;
  order_id: string;
  product_id: string;
  slug: string;
  name: string;
  image_url: string;
  unit_price: number;
  qty: number;
  line_total: number;
};

const ORDER_SELECT = `id, order_number, customer_id, status, payment_status,
  subtotal, cgst, sgst, shipping, total, currency, ship_to, bill_to, notes,
  payment_provider, payment_order_id, payment_id, paid_at, created_at`;

const ITEM_SELECT = `id, order_id, product_id, slug, name, image_url, unit_price, qty, line_total`;

function mapItem(row: ItemRow): OrderItem {
  return {
    id: row.id,
    productId: row.product_id ?? "",
    slug: row.slug ?? "",
    name: row.name,
    imageUrl: row.image_url ?? "",
    unitPrice: Number(row.unit_price),
    qty: Number(row.qty),
    lineTotal: Number(row.line_total),
  };
}

function mapOrder(row: OrderRow, items: OrderItem[]): Order {
  return {
    id: row.id,
    orderNumber: row.order_number,
    customerId: row.customer_id,
    status: row.status as OrderStatus,
    paymentStatus: row.payment_status as PaymentStatus,
    subtotal: Number(row.subtotal),
    cgst: Number(row.cgst),
    sgst: Number(row.sgst),
    shipping: Number(row.shipping),
    total: Number(row.total),
    currency: row.currency || "INR",
    /* `jsonb` comes back already parsed by `pg`. Defaulted because a row
       written before this column had a value would otherwise crash a page. */
    shipTo: (row.ship_to ?? {}) as ShipTo,
    /* Empty means the order predates the billing/shipping split, and on those
       orders the single address served as both. Falling back to `ship_to` is
       the truthful reading of that row, and it keeps every page that renders
       a billing address from having to special-case three old orders. */
    billTo: (row.bill_to && Object.keys(row.bill_to).length > 0
      ? row.bill_to
      : (row.ship_to ?? {})) as ShipTo,
    notes: row.notes ?? "",
    paymentProvider: row.payment_provider,
    paymentOrderId: row.payment_order_id,
    paymentId: row.payment_id,
    paidAt: row.paid_at ? row.paid_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    items,
  };
}

/**
 * The customer-facing reference, e.g. `VK-2609-4F7A`.
 *
 * Month and day, then four random characters from an alphabet with no `0/O`
 * or `1/I` in it — this gets read out over a bad phone line to somebody
 * standing in a field, and the two pairs that sound and look alike are the two
 * that cause a wrong lookup. Not sequential: a running counter tells every
 * customer how many orders the business has taken.
 */
const ALPHABET = "23456789ACDEFGHJKLMNPQRTUVWXYZ";

function orderNumber(): string {
  const now = new Date();
  const stamp =
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0");
  const bytes = randomBytes(4);
  let suffix = "";
  for (const byte of bytes) suffix += ALPHABET[byte % ALPHABET.length];
  return `VK-${stamp}-${suffix}`;
}

export type NewOrder = {
  customerId: string;
  shipTo: ShipTo;
  billTo: ShipTo;
  notes: string;
  subtotal: number;
  cgst: number;
  sgst: number;
  shipping: number;
  total: number;
  items: {
    productId: string;
    slug: string;
    name: string;
    imageUrl: string;
    unitPrice: number;
    qty: number;
    lineTotal: number;
  }[];
};

/**
 * Writes an order and its lines in one transaction.
 *
 * All of it or none of it: an order row with no items is a bill for nothing,
 * and there is no second chance to reconstruct the lines — the cart that
 * produced them is cleared the moment this returns.
 *
 * The unique index on `order_number` is what makes the retry loop correct
 * rather than optimistic. Four characters from a 30-letter alphabet within one
 * day is 810,000 combinations, so a collision is remote; "remote" is not
 * "impossible", and the failure mode without the retry is a customer seeing an
 * error after their money has been discussed.
 */
export async function createOrder(input: NewOrder): Promise<Order> {
  const client = await getPool().connect();
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const number = orderNumber();
      try {
        await client.query("BEGIN");

        const id = randomUUID();
        const inserted = await client.query<OrderRow>(
          `INSERT INTO orders
             (id, order_number, customer_id, subtotal, cgst, sgst, shipping, total, ship_to, bill_to, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING ${ORDER_SELECT}`,
          [
            id,
            number,
            input.customerId,
            input.subtotal,
            input.cgst,
            input.sgst,
            input.shipping,
            input.total,
            JSON.stringify(input.shipTo),
            JSON.stringify(input.billTo),
            input.notes,
          ],
        );

        const items: OrderItem[] = [];
        for (const item of input.items) {
          const itemId = randomUUID();
          await client.query(
            `INSERT INTO order_items
               (id, order_id, product_id, slug, name, image_url, unit_price, qty, line_total)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              itemId,
              id,
              item.productId,
              item.slug,
              item.name,
              item.imageUrl,
              item.unitPrice,
              item.qty,
              item.lineTotal,
            ],
          );
          items.push({ ...item, id: itemId });
        }

        await client.query("COMMIT");
        return mapOrder(inserted.rows[0], items);
      } catch (error) {
        await client.query("ROLLBACK");
        /* 23505 is unique_violation. Only `order_number` can raise it here —
           the two uuids are freshly generated — so this is the collision, and
           anything else is a real failure that must not be retried five times
           before surfacing. */
        if ((error as { code?: string }).code === "23505" && attempt < 4) continue;
        throw error;
      }
    }
    throw new Error("Could not allocate an order number.");
  } finally {
    client.release();
  }
}

/** One customer's history, newest first. Fails soft: an empty history page
 *  beats a 500 on somebody's account. */
export async function listOrdersForCustomer(customerId: string): Promise<Order[]> {
  if (!isDatabaseConfigured()) return [];
  try {
    const orders = await query<OrderRow>(
      `SELECT ${ORDER_SELECT} FROM orders WHERE customer_id = $1 ORDER BY created_at DESC`,
      [customerId],
    );
    if (orders.length === 0) return [];

    /* One query for every line of every order, grouped in memory, rather than
       a query per order. An account with twenty orders would otherwise make
       twenty-one round trips to render one page. */
    const items = await query<ItemRow>(
      `SELECT ${ITEM_SELECT} FROM order_items WHERE order_id = ANY($1::text[])`,
      [orders.map((o) => o.id)],
    );

    const byOrder = new Map<string, OrderItem[]>();
    for (const row of items) {
      const list = byOrder.get(row.order_id) ?? [];
      list.push(mapItem(row));
      byOrder.set(row.order_id, list);
    }

    return orders.map((row) => mapOrder(row, byOrder.get(row.id) ?? []));
  } catch (error) {
    console.error("[db] order query failed:", error);
    return [];
  }
}

/**
 * One order, scoped to its owner.
 *
 * `customerId` is in the WHERE clause, not checked after the fetch: an order
 * id in a URL is guessable-shaped, and "fetch then compare" is the version of
 * this that people forget to write the second half of.
 */
export async function getOrderForCustomer(
  customerId: string,
  orderId: string,
): Promise<Order | null> {
  try {
    const orders = await query<OrderRow>(
      `SELECT ${ORDER_SELECT} FROM orders WHERE id = $1 AND customer_id = $2`,
      [orderId, customerId],
    );
    if (!orders[0]) return null;

    const items = await query<ItemRow>(
      `SELECT ${ITEM_SELECT} FROM order_items WHERE order_id = $1`,
      [orderId],
    );
    return mapOrder(orders[0], items.map(mapItem));
  } catch (error) {
    console.error("[db] order fetch failed:", error);
    return null;
  }
}

/** Every order, newest first — the admin inbox. */
export async function listAllOrders(limit = 200): Promise<Order[]> {
  if (!isDatabaseConfigured()) return [];
  try {
    const orders = await query<OrderRow>(
      `SELECT ${ORDER_SELECT} FROM orders ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    if (orders.length === 0) return [];

    const items = await query<ItemRow>(
      `SELECT ${ITEM_SELECT} FROM order_items WHERE order_id = ANY($1::text[])`,
      [orders.map((o) => o.id)],
    );

    const byOrder = new Map<string, OrderItem[]>();
    for (const row of items) {
      const list = byOrder.get(row.order_id) ?? [];
      list.push(mapItem(row));
      byOrder.set(row.order_id, list);
    }

    return orders.map((row) => mapOrder(row, byOrder.get(row.id) ?? []));
  } catch (error) {
    console.error("[db] order list failed:", error);
    return [];
  }
}

/** Called only from an authenticated admin action, so it does not swallow. */
export async function setOrderStatus(
  orderId: string,
  status: OrderStatus,
): Promise<void> {
  await query(
    `UPDATE orders SET status = $2, updated_at = now() WHERE id = $1`,
    [orderId, status],
  );
}

// ---------------------------------------------------------------------------
// Payment
//
// Written now, unused until a gateway is wired up. See docs/PAYMENTS.md — the
// point of having these here is that adding Razorpay is a route handler and a
// button, not a schema change under a live catalogue.
// ---------------------------------------------------------------------------

/** Records the gateway's order id against ours, before the customer pays. */
export async function attachPaymentOrder(
  orderId: string,
  provider: string,
  providerOrderId: string,
): Promise<void> {
  await query(
    `UPDATE orders
        SET payment_provider = $2, payment_order_id = $3, updated_at = now()
      WHERE id = $1`,
    [orderId, provider, providerOrderId],
  );
}

/**
 * Marks an order paid.
 *
 * `WHERE payment_status <> 'paid'` makes this idempotent, which is not
 * optional: a gateway sends its webhook more than once by design, and the
 * browser redirect can arrive alongside it. Returns whether this call was the
 * one that changed the row, so the caller can send the confirmation mail
 * exactly once instead of once per delivery attempt.
 */
export async function markOrderPaid(input: {
  orderId: string;
  paymentId: string;
  signature: string;
}): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE orders
        SET payment_status = 'paid', status = 'confirmed',
            payment_id = $2, payment_signature = $3,
            paid_at = now(), updated_at = now()
      WHERE id = $1 AND payment_status <> 'paid'
      RETURNING id`,
    [input.orderId, input.paymentId, input.signature],
  );
  return rows.length > 0;
}

export async function markPaymentFailed(orderId: string): Promise<void> {
  await query(
    `UPDATE orders SET payment_status = 'failed', updated_at = now()
      WHERE id = $1 AND payment_status = 'unpaid'`,
    [orderId],
  );
}

/** Looks an order up by the gateway's id — the only thing a webhook carries. */
export async function findOrderByPaymentOrderId(
  providerOrderId: string,
): Promise<Order | null> {
  const orders = await query<OrderRow>(
    `SELECT ${ORDER_SELECT} FROM orders WHERE payment_order_id = $1`,
    [providerOrderId],
  );
  if (!orders[0]) return null;

  const items = await query<ItemRow>(
    `SELECT ${ITEM_SELECT} FROM order_items WHERE order_id = $1`,
    [orders[0].id],
  );
  return mapOrder(orders[0], items.map(mapItem));
}
