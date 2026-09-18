import { randomBytes, randomUUID } from "node:crypto";
import { getPool, isDatabaseConfigured, query } from "./client";
import { CONFIRMED_ORDER_SQL } from "@/lib/order-payment";
import { mapShipmentStatus, mergeTrackingEvents } from "@/lib/tracking";
import type {
  Order,
  OrderItem,
  OrderStatus,
  PaymentStatus,
  ShipTo,
  TrackingEvent,
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
  shipment_provider: string | null;
  shipment_order_id: string | null;
  shipment_id: string | null;
  awb: string | null;
  courier_name: string | null;
  courier_id: number | null;
  shipped_at: Date | null;
  delivered_at: Date | null;
  cancelled_at: Date | null;
  refunded_amount: number;
  refunded_at: Date | null;
  repriced_at: Date | null;
  tracking_status: string | null;
  tracking_updated_at: Date | null;
  tracking_eta: string | null;
  tracking_events: TrackingEvent[] | null;
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
  payment_provider, payment_order_id, payment_id, paid_at,
  shipment_provider, shipment_order_id, shipment_id, awb, courier_name, courier_id,
  shipped_at, delivered_at, cancelled_at, refunded_amount, refunded_at, repriced_at,
  tracking_status, tracking_updated_at, tracking_eta::text AS tracking_eta, tracking_events,
  created_at`;

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
    shipmentProvider: row.shipment_provider,
    shipmentOrderId: row.shipment_order_id,
    shipmentId: row.shipment_id,
    awb: row.awb,
    courierName: row.courier_name,
    courierId: row.courier_id === null ? null : Number(row.courier_id),
    shippedAt: row.shipped_at ? row.shipped_at.toISOString() : null,
    deliveredAt: row.delivered_at ? row.delivered_at.toISOString() : null,
    cancelledAt: row.cancelled_at ? row.cancelled_at.toISOString() : null,
    refundedAmount: Number(row.refunded_amount ?? 0),
    refundedAt: row.refunded_at ? row.refunded_at.toISOString() : null,
    repricedAt: row.repriced_at ? row.repriced_at.toISOString() : null,
    trackingStatus: row.tracking_status,
    trackingUpdatedAt: row.tracking_updated_at ? row.tracking_updated_at.toISOString() : null,
    /* `::text` in the select: `pg` turns a DATE into a JS Date at the
       server's local midnight, which is a different day in half the world. */
    trackingEta: row.tracking_eta,
    trackingEvents: Array.isArray(row.tracking_events) ? row.tracking_events : [],
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
  paymentProvider?: string | null;
  /** The delivery service the customer chose and is being charged for. Null
   *  when no quote was possible and delivery is settled on the call. */
  courierId?: number | null;
  courierName?: string | null;
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
             (id, order_number, customer_id, subtotal, cgst, sgst, shipping, total, ship_to, bill_to, notes, courier_id, courier_name, payment_provider)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
            input.courierId ?? null,
            input.courierName ?? null,
            input.paymentProvider ?? null,
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
/**
 * Orders for `/admin/orders`: **confirmed orders only** (client, 2026-09-17) —
 * cash on delivery, or paid online (including since refunded or cancelled).
 * An online order that was never paid is the customer's business, not the
 * operator's; it stays in their order history. See `isConfirmedOrder`.
 */
export async function listAllOrders(limit = 200): Promise<Order[]> {
  if (!isDatabaseConfigured()) return [];
  try {
    const orders = await query<OrderRow>(
      `SELECT ${ORDER_SELECT} FROM orders
        WHERE ${CONFIRMED_ORDER_SQL}
        ORDER BY created_at DESC LIMIT $1`,
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

/**
 * One order by id, unscoped.
 *
 * **Admin-only, and the name says so.** `getOrderForCustomer` exists precisely
 * because a customer must never read an order by guessing an id; this is the
 * version for the operator, who is entitled to every row, and it must only
 * ever be called after `requireAdmin()`.
 */
export async function getOrderForAdmin(orderId: string): Promise<Order | null> {
  try {
    const orders = await query<OrderRow>(
      `SELECT ${ORDER_SELECT} FROM orders WHERE id = $1`,
      [orderId],
    );
    if (!orders[0]) return null;

    const items = await query<ItemRow>(
      `SELECT ${ITEM_SELECT} FROM order_items WHERE order_id = $1`,
      [orderId],
    );
    return mapOrder(orders[0], items.map(mapItem));
  } catch (error) {
    console.error("[db] admin order fetch failed:", error);
    return null;
  }
}

/**
 * Records a booked shipment against an order.
 *
 * Called only from the admin action, so it does not swallow — a booking that
 * reached the courier but failed to save here is the worst outcome available
 * (a parcel in the post that the site does not know about), and the operator
 * has to be told rather than shown a success.
 */
export async function setOrderShipment(
  orderId: string,
  input: {
    provider: string;
    shipmentOrderId: string;
    shipmentId: string;
    awb: string | null;
    courierName: string | null;
  },
): Promise<void> {
  await query(
    `UPDATE orders
        SET shipment_provider = $2, shipment_order_id = $3, shipment_id = $4,
            awb = $5, courier_name = $6, updated_at = now()
      WHERE id = $1`,
    [
      orderId,
      input.provider,
      input.shipmentOrderId,
      input.shipmentId,
      input.awb,
      input.courierName,
    ],
  );
}

/** What a status change changed, so a caller can tell a real transition from
 *  a repeat and email about the first only. */
export type OrderStatusChange = {
  orderId: string;
  previousStatus: OrderStatus;
  status: OrderStatus;
};

export type TrackingChange = OrderStatusChange & {
  previousTracking: string | null;
  tracking: string | null;
};

/** How far along an order is. Tracking may only move an order to a higher
 *  number; cancelled is outside the scale and never moved by a courier. */
const PROGRESS: Record<OrderStatus, number> = {
  pending: 0,
  confirmed: 1,
  shipped: 2,
  delivered: 3,
  cancelled: -1,
};

/**
 * Applies a courier's tracking update, found by AWB — from the webhook or from
 * the admin's "Refresh tracking".
 *
 * **Idempotent, and it returns what changed** — the same contract
 * `markOrderPaid` keeps, for the same reason: couriers redeliver webhooks, and
 * the caller emails the customer on a transition, so a repeat must be visible
 * as a repeat. The row is locked for the read-then-write, so two deliveries of
 * one event arriving together see each other and only one reports the change.
 *
 * Three rules, each for a failure that would otherwise reach a customer:
 *
 *  - **The order's status only moves forward.** Webhooks arrive out of order;
 *    a late "IN TRANSIT" after "DELIVERED" used to put a delivered order back
 *    to shipped. A cancelled order is never touched — see `mapShipmentStatus`
 *    for why a courier can no longer cancel one either.
 *  - **The courier's status only moves forward in time.** An update stamped
 *    earlier than the one stored keeps its scans but does not replace the
 *    current status. Where either side has no timestamp there is nothing to
 *    compare, and the newer arrival wins.
 *  - **`shipped_at`/`delivered_at` are written once** (`COALESCE`), so a
 *    duplicate "delivered" does not keep moving the delivery date.
 *
 * Returns null for an AWB that is not ours, which the webhook answers with a
 * 200 so Shiprocket does not retry something that will never resolve.
 */
export async function applyTrackingUpdate(input: {
  awb: string;
  /** The courier's words. Empty when the update carried only scans. */
  status: string;
  /** ISO, the courier's time for `status`. */
  statusAt: string | null;
  /** `YYYY-MM-DD`. */
  eta: string | null;
  events: TrackingEvent[];
  courierName: string | null;
  /** A return shipment's "DELIVERED" means delivered back to us. */
  isReturn: boolean;
}): Promise<TrackingChange | null> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    const found = await client.query<{
      id: string;
      status: OrderStatus;
      tracking_status: string | null;
      tracking_status_at: Date | null;
      tracking_events: TrackingEvent[] | null;
    }>(
      `SELECT id, status, tracking_status, tracking_status_at, tracking_events
         FROM orders WHERE awb = $1
        LIMIT 1
          FOR UPDATE`,
      [input.awb],
    );
    const row = found.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return null;
    }

    const storedAt = row.tracking_status_at ? row.tracking_status_at.getTime() : null;
    const incomingAt = input.statusAt ? Date.parse(input.statusAt) : null;
    const newer =
      Boolean(input.status) && (storedAt === null || incomingAt === null || incomingAt >= storedAt);

    const tracking = newer ? input.status : row.tracking_status;
    const trackingAt = newer ? input.statusAt : row.tracking_status_at?.toISOString() ?? null;

    const mapped = input.isReturn ? null : mapShipmentStatus(input.status);
    const status =
      row.status !== "cancelled" && mapped && PROGRESS[mapped] > PROGRESS[row.status]
        ? mapped
        : row.status;

    /* An update with no scan list still belongs in the history when it says
       something new — but only then, or every redelivery of a timestamp-less
       webhook would add a line. */
    const incoming =
      input.events.length > 0
        ? input.events
        : newer && input.status !== row.tracking_status
          ? [{ at: input.statusAt ?? new Date().toISOString(), activity: input.status, location: "", status: input.status }]
          : [];
    const events = mergeTrackingEvents(row.tracking_events ?? [], incoming);

    /* The `::text` casts are required, not stylistic: a parameter used across
       `COALESCE`, `IN` and `=` has no type Postgres can infer, and the update
       fails with "could not determine data type of parameter" — a failure a
       webhook route logs and answers 200 to, i.e. one nobody sees. */
    await client.query(
      `UPDATE orders
          SET status = $2::text,
              courier_name = COALESCE($3::text, courier_name),
              tracking_status = $4::text,
              tracking_status_at = $5::timestamptz,
              tracking_eta = COALESCE($6::date, tracking_eta),
              tracking_events = $7::jsonb,
              tracking_updated_at = now(),
              shipped_at = CASE
                WHEN $2::text IN ('shipped', 'delivered') THEN COALESCE(shipped_at, now())
                ELSE shipped_at END,
              delivered_at = CASE
                WHEN $2::text = 'delivered' THEN COALESCE(delivered_at, now())
                ELSE delivered_at END,
              updated_at = now()
        WHERE id = $1`,
      [
        row.id,
        status,
        input.courierName,
        tracking,
        trackingAt,
        input.eta,
        JSON.stringify(events),
      ],
    );

    await client.query("COMMIT");
    return {
      orderId: row.id,
      previousStatus: row.status,
      status,
      previousTracking: row.tracking_status,
      tracking,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Sets an order's status from `/admin/orders`, and reports what it was.
 *
 * Called only from an authenticated admin action, so it does not swallow.
 * Returns null for an order that does not exist. The previous status comes
 * from the locked row, not from the page the operator was looking at, which
 * may be minutes old — it decides whether the customer is emailed.
 */
export async function setOrderStatus(
  orderId: string,
  status: OrderStatus,
): Promise<OrderStatusChange | null> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<{ status: OrderStatus }>(
      `SELECT status FROM orders WHERE id = $1 FOR UPDATE`,
      [orderId],
    );
    if (!found.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }

    await client.query(
      `UPDATE orders
          SET status = $2::text,
              cancelled_at = CASE
                WHEN $2::text = 'cancelled' THEN COALESCE(cancelled_at, now())
                ELSE NULL END,
              shipped_at = CASE
                WHEN $2::text IN ('shipped', 'delivered') THEN COALESCE(shipped_at, now())
                ELSE shipped_at END,
              delivered_at = CASE
                WHEN $2::text = 'delivered' THEN COALESCE(delivered_at, now())
                ELSE delivered_at END,
              updated_at = now()
        WHERE id = $1`,
      [orderId, status],
    );

    await client.query("COMMIT");
    return { orderId, previousStatus: found.rows[0].status, status };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** How far along an order is, for callers deciding whether a change was
 *  forward. */
export function orderProgress(status: OrderStatus): number {
  return PROGRESS[status];
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

/**
 * Records a failed online payment. Returns whether this call moved the order
 * from unpaid to failed — the payment-failed email (EMAILS.md B) is sent only
 * then, so a customer who fails, retries and fails again gets one email, and
 * a failure reported after the order was paid changes nothing and sends none.
 */
export async function markPaymentFailed(orderId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE orders SET payment_status = 'failed', updated_at = now()
      WHERE id = $1 AND payment_status = 'unpaid'
      RETURNING id`,
    [orderId],
  );
  return rows.length > 0;
}

/**
 * Claims the right to start a refund on this order for the next minute.
 * Returns false when another refund request is already in flight — see
 * `refund_requested_at` in schema.sql. Atomic: two presses racing each other
 * cannot both win.
 */
export async function claimRefundRequest(orderId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE orders SET refund_requested_at = now()
      WHERE id = $1
        AND (refund_requested_at IS NULL OR refund_requested_at < now() - interval '60 seconds')
      RETURNING id`,
    [orderId],
  );
  return rows.length > 0;
}

export async function releaseRefundRequest(orderId: string): Promise<void> {
  await query(`UPDATE orders SET refund_requested_at = NULL WHERE id = $1`, [orderId]);
}

/**
 * Writes today's prices onto an unpaid order, after the customer accepted
 * them at "Pay now" (client, 2026-09-17).
 *
 * **Only while it is unpaid and not cancelled**, checked under a row lock in
 * the same transaction that writes: an order that has been paid is a record of
 * what was charged, and nothing may rewrite it. If the guard fails — the
 * webhook settled it a second earlier — nothing is written and it returns
 * false, and the caller charges the amount that is already on the row.
 *
 * The lines come from `repriceOrderItems`, which keeps every line the order
 * has; this never adds or removes one.
 */
export async function repriceOrder(input: {
  orderId: string;
  lines: { id: string; unitPrice: number; lineTotal: number }[];
  money: { subtotal: number; cgst: number; sgst: number; shipping: number; total: number };
  courierId?: number | null;
}): Promise<boolean> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<{ id: string }>(
      `SELECT id FROM orders
        WHERE id = $1 AND payment_status <> 'paid' AND status <> 'cancelled'
          FOR UPDATE`,
      [input.orderId],
    );
    if (!found.rows[0]) {
      await client.query("ROLLBACK");
      return false;
    }

    for (const line of input.lines) {
      await client.query(
        `UPDATE order_items SET unit_price = $2, line_total = $3
          WHERE id = $1 AND order_id = $4`,
        [line.id, line.unitPrice, line.lineTotal, input.orderId],
      );
    }

    await client.query(
      `UPDATE orders
          SET subtotal = $2, cgst = $3, sgst = $4, shipping = $5, total = $6, courier_id = COALESCE($7, courier_id),
              repriced_at = now(), updated_at = now()
        WHERE id = $1`,
      [
        input.orderId, 
        input.money.subtotal, 
        input.money.cgst, 
        input.money.sgst, 
        input.money.shipping, 
        input.money.total, 
        input.courierId ?? null
      ],
    );

    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Looks an order up by Razorpay's payment id — for a refund event that
 *  arrives without the payment's order id. */
export async function findOrderIdByPaymentId(paymentId: string): Promise<string | null> {
  const rows = await query<{ id: string }>(`SELECT id FROM orders WHERE payment_id = $1`, [
    paymentId,
  ]);
  return rows[0]?.id ?? null;
}

export type RefundChange = {
  orderId: string;
  /** This refund, paise. */
  amount: number;
  /** All refunds so far, paise. */
  refundedAmount: number;
  total: number;
  full: boolean;
};

/**
 * Records one Razorpay refund against an order (EMAILS.md D).
 *
 * **Keyed on Razorpay's refund id**, under a row lock: a redelivered
 * `refund.processed` finds its id already stored and returns null, so the
 * refund email goes once; a second, partial refund has a new id and is
 * recorded and emailed on its own. The order becomes `refunded` only once the
 * refunds add up to its total.
 */
export async function recordRefund(input: {
  orderId: string;
  refundId: string;
  amount: number;
}): Promise<RefundChange | null> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<{
      total: number;
      refunds: { id: string; amount: number; at: string }[] | null;
    }>(`SELECT total, refunds FROM orders WHERE id = $1 FOR UPDATE`, [input.orderId]);
    const row = found.rows[0];
    const refunds = Array.isArray(row?.refunds) ? row.refunds : [];
    if (!row || refunds.some((r) => r.id === input.refundId)) {
      await client.query("ROLLBACK");
      return null;
    }

    const total = Number(row.total);
    const next = [...refunds, { id: input.refundId, amount: input.amount, at: new Date().toISOString() }];
    const refundedAmount = next.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const full = refundedAmount >= total;

    await client.query(
      `UPDATE orders
          SET refunds = $2::jsonb,
              refunded_amount = $3::int,
              refunded_at = now(),
              payment_status = CASE WHEN $4::boolean THEN 'refunded' ELSE payment_status END,
              updated_at = now()
        WHERE id = $1`,
      [input.orderId, JSON.stringify(next), refundedAmount, full],
    );
    await client.query("COMMIT");
    return { orderId: input.orderId, amount: input.amount, refundedAmount, total, full };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
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
