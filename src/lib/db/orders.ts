import { randomBytes, randomUUID } from "node:crypto";
import { getPool, isDatabaseConfigured, query } from "./client";
import { PER_PAGE, clampPage, containsPattern, phoneDigits } from "@/lib/admin-list";
import { addressEditWindow } from "@/lib/order-delivery";
import { CONFIRMED_ORDER_SQL } from "@/lib/order-payment";
import { mapShipmentStatus, mergeTrackingEvents, scanTime } from "@/lib/tracking";
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
  shipment_attempts: number | null;
  shipment_error: string | null;
  booked_at: Date | null;
  shipped_at: Date | null;
  delivered_at: Date | null;
  cancelled_at: Date | null;
  refunded_amount: number;
  refunded_at: Date | null;
  refunds: StoredRefund[] | null;
  repriced_at: Date | null;
  delivery_service: string | null;
  address_changed_at: Date | null;
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
  shipment_attempts, shipment_error,
  booked_at, shipped_at, delivered_at, cancelled_at, refunded_amount, refunded_at, refunds, repriced_at,
  delivery_service, address_changed_at,
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
    shipmentAttempts: Number(row.shipment_attempts ?? 0),
    shipmentError: row.shipment_error ?? null,
    courierId: row.courier_id === null ? null : Number(row.courier_id),
    bookedAt: row.booked_at ? row.booked_at.toISOString() : null,
    shippedAt: row.shipped_at ? row.shipped_at.toISOString() : null,
    deliveredAt: row.delivered_at ? row.delivered_at.toISOString() : null,
    cancelledAt: row.cancelled_at ? row.cancelled_at.toISOString() : null,
    refundedAmount: Number(row.refunded_amount ?? 0),
    refundedAt: row.refunded_at ? row.refunded_at.toISOString() : null,
    refundPending: Array.isArray(row.refunds) && row.refunds.some((r) => r.status === "pending"),
    repricedAt: row.repriced_at ? row.repriced_at.toISOString() : null,
    deliveryService: row.delivery_service ?? null,
    addressChangedAt: row.address_changed_at ? row.address_changed_at.toISOString() : null,
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
  /** "Standard" / "Faster" / "Express" — what checkout called that service. */
  deliveryService?: string | null;
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
             (id, order_number, customer_id, subtotal, cgst, sgst, shipping, total, ship_to, bill_to, notes, courier_id, courier_name, payment_provider, delivery_service)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
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
            input.deliveryService ?? null,
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

// ---------------------------------------------------------------------------
// `/admin/orders`, paged and searched (2026-09-19)
// ---------------------------------------------------------------------------

export const ADMIN_ORDER_STATUSES = ["pending", "confirmed", "shipped", "delivered", "cancelled"] as const;
export type AdminOrderStatus = (typeof ADMIN_ORDER_STATUSES)[number];

/**
 * Refund-cancelled: a cancelled order that was paid online and whose money is
 * not back yet — owed, or being processed by Razorpay (client, 2026-09-21:
 * "orders which have been refunded move to the cancelled section;
 * refund-cancelled contains orders which are yet to be refunded and where
 * refund is being processed").
 *
 * **It empties as refunds finish.** A fully refunded order leaves for
 * `Cancelled`, which is everything cancelled that is not here: cash on
 * delivery, the refunds already made, and the old phone-settled orders. Every
 * cancelled order is in exactly one of the two.
 *
 * A dispatched order belongs here too while it is unrefunded — it is refunded
 * in the Razorpay dashboard, and the card says so. That is why this is wider
 * than `refundBlock`, which decides whether the *card* offers the button.
 * `refunds @> '[{"status":"pending"}]'` is the containment test for "a refund
 * is on its way", and holds a fully refunded order here until Razorpay
 * confirms it.
 */
const REFUND_CANCELLED_SQL = `(status = 'cancelled'
  AND payment_provider = 'razorpay' AND payment_id IS NOT NULL
  AND (payment_status IN ('paid', 'refunded') OR refunded_amount > 0)
  AND (total - refunded_amount > 0 OR refunds @> '[{"status": "pending"}]'::jsonb))`;

/**
 * Every choice in the filter row, and the WHERE clause behind each one
 * (client, 2026-09-21).
 *
 * **The list and the counts are built from this one map**, so a filter cannot
 * show a different set of orders from the number on its button. The clauses
 * are interpolated rather than passed as a parameter, which is safe because
 * they are these fixed strings — the page validates `?status=` against the
 * keys before anything reaches here.
 *
 * `pending-unquoted` is a subset of `pending`, not a stage beside it: the
 * waiting orders checkout could not price delivery for, which someone has to
 * agree a charge for before dispatch. Cash on delivery and online orders sit
 * together under `pending` — how they are paid is on each card, and splitting
 * the button by it earned nothing (client, 2026-09-21).
 */
export const ADMIN_ORDER_FILTER_SQL = {
  pending: `status = 'pending'`,
  /* `shipping = 0` is "Not quoted" on the card: checkout could not get a
     delivery price, so somebody has to agree one before dispatch. */
  "pending-unquoted": `(status = 'pending' AND shipping <= 0)`,
  /* Confirmed is now "confirmed and not yet booked": once a parcel has an AWB
     the order moves to its own queue below (client, 2026-09-23). */
  confirmed: `(status = 'confirmed' AND awb IS NULL)`,
  /* **Ready to ship**: booked with a courier, waiting for the pickup. It
     leaves this queue when the courier's first scan moves the order to
     shipped — or when Not ready cancels the parcel and sends it back to
     Confirmed. */
  ready: `(status = 'confirmed' AND awb IS NOT NULL)`,
  shipped: `status = 'shipped'`,
  delivered: `status = 'delivered'`,
  /* Last of the chips, after the refund queue (client, 2026-09-24): it is
     where an order ends, and the two cancelled sections read better together
     at the end of the row than split across it. */
  "refund-cancelled": REFUND_CANCELLED_SQL,
  cancelled: `(status = 'cancelled' AND NOT ${REFUND_CANCELLED_SQL})`,
} as const;

export const ADMIN_ORDER_FILTERS = Object.keys(ADMIN_ORDER_FILTER_SQL) as AdminOrderFilter[];
export type AdminOrderFilter = keyof typeof ADMIN_ORDER_FILTER_SQL;

/**
 * The search half of the admin order list's WHERE: order number, the
 * account's email, or a phone — the account's, or the one on either address —
 * compared on digits only. Parameters $1 (the search), $2 (its ILIKE pattern)
 * and $3 (its phone digits, or "").
 */
const ORDER_SEARCH_SQL = `($1 = '' OR order_number ILIKE $2
  /* The AWB too (2026-09-25), so a number scanned off a parcel label finds
     its order in the list — which is what the Scan button now searches for. */
  OR awb ILIKE $2
  /* And the reference Shiprocket currently knows the order by (client,
     2026-09-26). A retried booking is sent as VK-0925-CTH9-R3, and that is
     what their dashboard and the label print, so it has to find the order the
     bare number finds. Built from shipment_tries, which is the attempt the
     order is on, so -R2 on an order now at -R3 matches nothing: an earlier
     attempt was cancelled, and a label from it is not this parcel.
     (No backticks in here: this is inside a template literal.) */
  OR (shipment_tries > 1 AND order_number || '-R' || shipment_tries::text ILIKE $2)
  OR customer_id IN (
    SELECT id FROM customers
     WHERE email ILIKE $2
        OR ($3 <> '' AND regexp_replace(phone, '[^0-9]', '', 'g') LIKE '%' || $3 || '%'))
  OR ($3 <> '' AND (
        regexp_replace(ship_to->>'phone', '[^0-9]', '', 'g') LIKE '%' || $3 || '%'
     OR regexp_replace(bill_to->>'phone', '[^0-9]', '', 'g') LIKE '%' || $3 || '%')))`;

function searchArgs(q: string): [string, string, string] {
  return [q, containsPattern(q), phoneDigits(q)];
}

/**
 * One page of `/admin/orders`, newest first, searched and filtered by status.
 *
 * **Confirmed orders only** (client, 2026-09-17) — cash on delivery, or paid
 * online (including since refunded or cancelled). An online order that was
 * never paid is the customer's business, not the operator's; it stays in their
 * order history. See `isConfirmedOrder`. Replaced the unpaged `listAllOrders`,
 * which stopped at the newest 200.
 */
export type OrderSort = "newest" | "oldest";

export async function listOrdersPage(input: {
  q: string;
  filter: AdminOrderFilter | "";
  page: number;
  /** Chosen in the admin (client, 2026-09-23). Without one, each list keeps
   *  the order that suits it — a queue oldest first, a finished list newest
   *  first — which is what `orderSql` below works out. */
  sort?: OrderSort | "";
}): Promise<{ orders: Order[]; total: number; page: number }> {
  if (!isDatabaseConfigured()) return { orders: [], total: 0, page: 1 };
  try {
    /* One clause for all three cases — no filter, a status, or the refund
       queue — so $4 is always referenced and always supplied. */
    /* The chosen filter's own clause, from the map above — never the value
       itself, which the page has already checked is one of its keys. */
    const chosen = input.filter ? `AND ${ADMIN_ORDER_FILTER_SQL[input.filter]}` : "";
    const where = `${CONFIRMED_ORDER_SQL} ${chosen} AND ${ORDER_SEARCH_SQL}`;
    const args = searchArgs(input.q);
    const [{ n }] = await query<{ n: number }>(`SELECT count(*)::int AS n FROM orders WHERE ${where}`, args);
    const page = clampPage(input.page, n);
    /* An explicit choice wins, and it is always by order date: "oldest first"
       has to mean the same thing on every list, or the control lies. Without
       one, each list keeps the order that suits its job. */
    let orderSql = input.sort === "oldest" ? "ORDER BY created_at ASC" : "ORDER BY created_at DESC";
    if (!input.sort) {
      if (
        input.filter === "pending" ||
        input.filter === "pending-unquoted" ||
        input.filter === "confirmed" ||
        input.filter === "ready" ||
        input.filter === "refund-cancelled"
      ) {
        orderSql = "ORDER BY created_at ASC NULLS LAST";
      } else if (input.filter === "shipped") {
        orderSql = "ORDER BY COALESCE(shipped_at, created_at) DESC NULLS LAST";
      } else if (input.filter === "delivered") {
        orderSql = "ORDER BY COALESCE(delivered_at, shipped_at, created_at) DESC NULLS LAST";
      }
    }

    const rows = await query<OrderRow>(
      `SELECT ${ORDER_SELECT} FROM orders WHERE ${where}
        ${orderSql}
        LIMIT $4 OFFSET $5`,
      [...args, PER_PAGE, (page - 1) * PER_PAGE],
    );
    if (rows.length === 0) return { orders: [], total: n, page };

    const items = await query<ItemRow>(
      `SELECT ${ITEM_SELECT} FROM order_items WHERE order_id = ANY($1::text[])`,
      [rows.map((o) => o.id)],
    );
    const byOrder = new Map<string, OrderItem[]>();
    for (const row of items) {
      const list = byOrder.get(row.order_id) ?? [];
      list.push(mapItem(row));
      byOrder.set(row.order_id, list);
    }
    return { orders: rows.map((row) => mapOrder(row, byOrder.get(row.id) ?? [])), total: n, page };
  } catch (error) {
    console.error("[db] order page query failed:", error);
    return { orders: [], total: 0, page: 1 };
  }
}

export type OrderFilterCounts = Record<AdminOrderFilter | "all", number>;

/** How many orders match the search, per filter — the number on each choice. */
export async function countOrdersByFilter(q: string): Promise<OrderFilterCounts> {
  const counts = Object.fromEntries(
    [...ADMIN_ORDER_FILTERS, "all"].map((f) => [f, 0]),
  ) as OrderFilterCounts;
  if (!isDatabaseConfigured()) return counts;
  try {
    const columns = ADMIN_ORDER_FILTERS.map(
      (f) => `count(*) FILTER (WHERE ${ADMIN_ORDER_FILTER_SQL[f]})::int AS "${f}"`,
    ).join(",\n              ");
    const [row] = await query<Record<string, number>>(
      `SELECT count(*)::int AS all,
              ${columns}
         FROM orders WHERE ${CONFIRMED_ORDER_SQL} AND ${ORDER_SEARCH_SQL}`,
      searchArgs(q),
    );
    for (const key of Object.keys(counts) as (keyof OrderFilterCounts)[]) {
      counts[key] = Number(row?.[key] ?? 0);
    }
  } catch (error) {
    console.error("[db] order filter counts failed:", error);
  }
  return counts;
}

/** The header line of `/admin/orders` — all confirmed orders, not the page. */
export async function orderSummary(): Promise<{ total: number; open: number; revenue: number }> {
  if (!isDatabaseConfigured()) return { total: 0, open: 0, revenue: 0 };
  try {
    const [row] = await query<{ total: number; open: number; revenue: string }>(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE status IN ('pending', 'confirmed'))::int AS open,
              COALESCE(sum(total) FILTER (WHERE status <> 'cancelled'), 0)::bigint AS revenue
         FROM orders WHERE ${CONFIRMED_ORDER_SQL}`,
    );
    return { total: row.total, open: row.open, revenue: Number(row.revenue) };
  } catch (error) {
    console.error("[db] order summary failed:", error);
    return { total: 0, open: 0, revenue: 0 };
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
    /* The attempt counter and the last failure go with it: this order has its
       parcel, and a later one must not start a press from the limit. */
    `UPDATE orders
        SET shipment_provider = $2, shipment_order_id = $3, shipment_id = $4,
            awb = $5, courier_name = $6,
            /* When it became Ready to ship, for the card to say so
               (2026-09-25). COALESCE so a re-booking keeps the first. */
            booked_at = COALESCE(booked_at, now()),
            shipment_attempts = 0, shipment_error = NULL, updated_at = now()
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

/**
 * Failed Book shipment presses before the card stops offering the button
 * (client, 2026-09-23: "After 3 attempts say to contact support@vkon.in").
 */
export const SHIPMENT_ATTEMPT_LIMIT = 3;

/**
 * The next `order_id` number for this order — a lifetime count of the ids
 * sent to Shiprocket, incremented before the create call and **never reset**.
 *
 * Separate from `shipment_attempts` on purpose (client, 2026-09-23): that one
 * is the failure count the admin reads, and Not ready and moving an order back
 * to New both clear it. Deriving the id suffix from it meant a cleared order
 * started again at an id Shiprocket already held, and their create hands back
 * the existing cancelled order — three presses that did nothing before a new
 * one appeared. Counted in SQL so two presses cannot take the same number.
 */
export async function nextShipmentTry(orderId: string): Promise<number> {
  if (!isDatabaseConfigured()) return 1;
  const rows = await query<{ shipment_tries: number }>(
    `UPDATE orders SET shipment_tries = shipment_tries + 1, updated_at = now()
      WHERE id = $1
      RETURNING shipment_tries`,
    [orderId],
  );
  return Number(rows[0]?.shipment_tries ?? 1);
}

/**
 * One failed booking, with Shiprocket's words for it — returns how many have
 * failed now, so the action can say how many presses are left.
 *
 * Counted in SQL rather than read-then-written: two admins pressing at once
 * must not both read 1 and both write 2.
 */
export async function recordShipmentFailure(orderId: string, reason: string): Promise<number> {
  if (!isDatabaseConfigured()) return 0;
  const rows = await query<{ shipment_attempts: number }>(
    `UPDATE orders
        SET shipment_attempts = shipment_attempts + 1,
            shipment_error = $2, updated_at = now()
      WHERE id = $1
      RETURNING shipment_attempts`,
    [orderId, reason.slice(0, 500) || null],
  );
  return Number(rows[0]?.shipment_attempts ?? 0);
}

/**
 * Undoes a booking: the order keeps its status and loses its parcel.
 *
 * For **Not ready** on a booked order (client, 2026-09-23) — the shipment has
 * already been cancelled at Shiprocket by the caller, so the fields that made
 * this order "Ready to ship" are cleared and it is back in Confirmed with the
 * Book shipment button. The attempt counter goes too: this is a fresh start,
 * not a failure.
 */
export async function clearOrderShipment(orderId: string): Promise<void> {
  await query(
    `UPDATE orders
        SET shipment_provider = NULL, shipment_order_id = NULL, shipment_id = NULL,
            awb = NULL, courier_name = NULL, shipped_at = NULL, booked_at = NULL,
            tracking_status = NULL, tracking_status_at = NULL, tracking_updated_at = NULL,
            tracking_eta = NULL, tracking_events = '[]'::jsonb,
            shipment_attempts = 0, shipment_error = NULL, updated_at = now()
      WHERE id = $1`,
    [orderId],
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
              /* **The courier's own times, not ours** (client, 2026-09-25).
                 The scan comes first in each COALESCE, so an order stamped
                 with the moment somebody pressed Refresh tracking corrects
                 itself the next time the scans are read. */
              shipped_at = CASE
                WHEN $2::text IN ('shipped', 'delivered')
                  THEN COALESCE($8::timestamptz, shipped_at, now())
                ELSE shipped_at END,
              delivered_at = CASE
                WHEN $2::text = 'delivered'
                  THEN COALESCE($9::timestamptz, delivered_at, now())
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
        scanTime(events, "picked-up"),
        scanTime(events, "delivered"),
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
      /* Back to pending is a restart (client, 2026-09-23: "when i use the
         drop down to manually move the order from confirmed to pending …
         i should be able to restart the process"), so the failed booking
         attempts go with it. */
      `UPDATE orders
          SET status = $2::text,
              shipment_attempts = CASE
                WHEN $2::text = 'pending' THEN 0 ELSE shipment_attempts END,
              shipment_error = CASE
                WHEN $2::text = 'pending' THEN NULL ELSE shipment_error END,
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
 *
 * **Payment does not move the order's status** (client, 2026-09-21: "when I
 * pay using online the order moves to confirmed, it should be in pending —
 * only when admin confirms it, it moves to confirmed"). It used to set
 * `status = 'confirmed'`, which made an online order look accepted before
 * anybody had looked at it, while cash on delivery waited in `pending` for
 * the operator. Both now wait. Paying still puts the order in the admin
 * inbox and starts the delivery-address clock — `isConfirmedOrder` is about
 * the money, not this column.
 */
export async function markOrderPaid(input: {
  orderId: string;
  paymentId: string;
  signature: string;
}): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE orders
        SET payment_status = 'paid',
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
  /** The delivery service the new shipping figure is for, when one was quoted.
   *  All three move together: a courier id with the previous courier's name
   *  on it would print the wrong company on the order page. */
  delivery?: { courierId: number; courierName: string; service: string } | null;
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
          SET subtotal = $2, cgst = $3, sgst = $4, shipping = $5, total = $6,
              courier_id = COALESCE($7, courier_id),
              courier_name = COALESCE($8, courier_name),
              delivery_service = COALESCE($9, delivery_service),
              repriced_at = now(), updated_at = now()
        WHERE id = $1`,
      [
        input.orderId,
        input.money.subtotal,
        input.money.cgst,
        input.money.sgst,
        input.money.shipping,
        input.money.total,
        input.delivery?.courierId ?? null,
        input.delivery?.courierName ?? null,
        input.delivery?.service ?? null,
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

/**
 * Moves an order to a new delivery address, at the customer's request
 * (client, 2026-09-18).
 *
 * **The window is re-checked here, under the row lock**, with the row as it is
 * now — not as the page that offered the button saw it. The admin may have
 * booked the courier since, the clock may have passed the cutoff, or the payment may
 * have landed; each of those changes the answer, and a check made before the
 * lock would race all three.
 *
 * `pricedAs` is the payment state the caller priced the change for. An unpaid
 * order's delivery charge moves with its address; a paid one's never does
 * ("keep what they paid"). If the order was paid between the caller's read
 * and this lock, writing the new total would rewrite a paid order — so it
 * refuses with `"moved"` and the caller prices it again.
 *
 * `delivery` is null when the PIN code did not change: the same place costs
 * the same to reach, so the courier and the charge are left as they are.
 */
export async function changeOrderAddress(input: {
  orderId: string;
  customerId: string;
  shipTo: ShipTo;
  pricedAs: "paid" | "unpaid";
  delivery: {
    courierId: number;
    courierName: string;
    service: string;
    /** Only for an unpaid order: the new delivery charge and total. */
    money: { shipping: number; total: number } | null;
  } | null;
  now?: Date;
}): Promise<"ok" | "closed" | "moved"> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<OrderRow>(
      `SELECT ${ORDER_SELECT} FROM orders
        WHERE id = $1 AND customer_id = $2
          FOR UPDATE`,
      [input.orderId, input.customerId],
    );
    const row = found.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return "closed";
    }

    const order = mapOrder(row, []);
    if (!addressEditWindow(order, input.now ?? new Date()).editable) {
      await client.query("ROLLBACK");
      return "closed";
    }
    const paidNow = order.paymentStatus === "paid";
    if (paidNow !== (input.pricedAs === "paid")) {
      await client.query("ROLLBACK");
      return "moved";
    }

    const delivery = input.delivery;
    /* Belt and braces on the rule that matters most here: whatever the caller
       sent, a paid order's charge is not touched. */
    const money = paidNow ? null : (delivery?.money ?? null);

    await client.query(
      `UPDATE orders
          SET ship_to = $2,
              courier_id = COALESCE($3, courier_id),
              courier_name = COALESCE($4, courier_name),
              delivery_service = COALESCE($5, delivery_service),
              shipping = COALESCE($6, shipping),
              total = COALESCE($7, total),
              address_changed_at = now(), updated_at = now()
        WHERE id = $1`,
      [
        input.orderId,
        JSON.stringify(input.shipTo),
        delivery?.courierId ?? null,
        delivery?.courierName ?? null,
        delivery?.service ?? null,
        money?.shipping ?? null,
        money?.total ?? null,
      ],
    );

    await client.query("COMMIT");
    return "ok";
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Deletes an unpaid order at the customer's request. */
export async function cancelOrder(orderId: string, customerId: string): Promise<boolean> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(
      `SELECT id FROM orders
       WHERE id = $1 AND customer_id = $2 AND status = 'pending' AND payment_status IN ('unpaid', 'failed')
       FOR UPDATE`,
      [orderId, customerId]
    );

    if (found.rows.length === 0) {
      await client.query("ROLLBACK");
      return false;
    }

    await client.query(`DELETE FROM order_items WHERE order_id = $1`, [orderId]);
    await client.query(`DELETE FROM orders WHERE id = $1`, [orderId]);

    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Replaces an order's billing address, at the customer's request.
 *
 * **Within the same window as the delivery address** (client, 2026-09-18 —
 * it was "always" earlier the same day): while the order is unpaid, then
 * until 11 am the day after it was confirmed, and never once it has shipped,
 * been booked, cancelled or refunded. Checked here under the row lock, with the
 * row as it is now, for the reason `changeOrderAddress` gives. No money moves:
 * the amount does not depend on who is billed.
 */
export async function changeOrderBilling(input: {
  orderId: string;
  customerId: string;
  billTo: ShipTo;
  now?: Date;
}): Promise<"ok" | "closed" | "missing"> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<OrderRow>(
      `SELECT ${ORDER_SELECT} FROM orders
        WHERE id = $1 AND customer_id = $2
          FOR UPDATE`,
      [input.orderId, input.customerId],
    );
    const row = found.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return "missing";
    }
    if (!addressEditWindow(mapOrder(row, []), input.now ?? new Date()).editable) {
      await client.query("ROLLBACK");
      return "closed";
    }
    await client.query(`UPDATE orders SET bill_to = $2, updated_at = now() WHERE id = $1`, [
      input.orderId,
      JSON.stringify(input.billTo),
    ]);
    await client.query("COMMIT");
    return "ok";
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

export type RefundStatus = "pending" | "processed" | "failed";

/** One refund as stored in `orders.refunds`. Entries from before 2026-09-19
 *  have no `status`; they were recorded as done, so read as "processed". */
type StoredRefund = { id: string; amount: number; at: string; status?: RefundStatus };

export type RefundChange = {
  orderId: string;
  /** This refund, paise. */
  amount: number;
  /** All refunds that have not failed, paise — pending ones included, so a
   *  refund in flight cannot be sent twice. */
  refundedAmount: number;
  total: number;
  full: boolean;
  status: RefundStatus;
};

/**
 * Records a Razorpay refund on the order, or moves one already recorded on to
 * its next state (EMAILS.md 8, 2026-09-17; states 2026-09-19).
 *
 * **Refunds have a state** (client, 2026-09-19: "when refund is processing it
 * should say refund processing and then after refund is done it should say
 * refunded"). The admin's Refund button records it as Razorpay answered —
 * usually `pending`; the `refund.processed` webhook (or "Check with
 * Razorpay") moves it to `processed`; `refund.failed` to `failed`. A refund
 * made in the Razorpay dashboard first arrives already processed.
 *
 * - `refunded_amount` counts every refund that has not **failed**, so the
 *   remaining refundable amount already excludes one in flight.
 * - `payment_status` becomes `refunded` only when the whole total is covered
 *   **and** nothing is still pending; a failure that uncovers it puts it back
 *   to `paid`.
 * - A state never moves backwards (a late `pending` after `processed` is
 *   ignored), and an unchanged state returns null — the webhook redelivers.
 *
 * Row-locked, like every other money write on an order.
 */
export async function recordRefund(input: {
  orderId: string;
  refundId: string;
  amount: number;
  status: RefundStatus;
}): Promise<RefundChange | null> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<{ total: number; payment_status: string; refunds: StoredRefund[] | null }>(
      `SELECT total, payment_status, refunds FROM orders WHERE id = $1 FOR UPDATE`,
      [input.orderId],
    );
    const row = found.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return null;
    }
    const refunds = (Array.isArray(row.refunds) ? row.refunds : []).map((r) => ({
      ...r,
      status: r.status ?? ("processed" as RefundStatus),
    }));
    const existing = refunds.find((r) => r.id === input.refundId);
    const rank: Record<RefundStatus, number> = { pending: 0, processed: 1, failed: 1 };
    if (existing && (existing.status === input.status || rank[input.status] <= rank[existing.status])) {
      await client.query("ROLLBACK");
      return null;
    }

    const next = existing
      ? refunds.map((r) => (r.id === input.refundId ? { ...r, status: input.status } : r))
      : [...refunds, { id: input.refundId, amount: input.amount, at: new Date().toISOString(), status: input.status }];
    const counted = next.filter((r) => r.status !== "failed");
    const refundedAmount = counted.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const pending = next.some((r) => r.status === "pending");
    const total = Number(row.total);
    const full = refundedAmount >= total;
    const paymentStatus =
      full && !pending ? "refunded" : row.payment_status === "refunded" ? "paid" : row.payment_status;

    await client.query(
      `UPDATE orders
          SET refunds = $2::jsonb,
              refunded_amount = $3::int,
              refunded_at = CASE WHEN $5 = 'processed' OR refunded_at IS NULL THEN now() ELSE refunded_at END,
              payment_status = $4,
              updated_at = now()
        WHERE id = $1`,
      [input.orderId, JSON.stringify(next), refundedAmount, paymentStatus, input.status],
    );
    await client.query("COMMIT");
    const amount = existing ? Number(existing.amount) : input.amount;
    return { orderId: input.orderId, amount, refundedAmount, total, full, status: input.status };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** The refunds on an order still waiting on Razorpay — for "Check with
 *  Razorpay" when the webhook has not said. */
export async function listPendingRefunds(orderId: string): Promise<{ id: string; amount: number }[]> {
  const rows = await query<{ refunds: StoredRefund[] | null }>(`SELECT refunds FROM orders WHERE id = $1`, [orderId]);
  const refunds = Array.isArray(rows[0]?.refunds) ? rows[0].refunds : [];
  return refunds.filter((r) => r.status === "pending").map((r) => ({ id: r.id, amount: Number(r.amount) }));
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
