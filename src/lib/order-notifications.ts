import { site } from "@/content/site";
import { findCustomerById } from "@/lib/db/customers";
import { getOrderForAdmin, type RefundChange, type TrackingChange } from "@/lib/db/orders";
import {
  sendNewOrderAlert,
  sendOrderActivityAlert,
  sendOrderUpdateMail,
  sendPaymentFailedMail,
  sendRefundMail,
  type OrderUpdateKind,
} from "@/lib/mail";
import { addressDeadline, formatNoonDeadline } from "@/lib/order-delivery";
import { isCod, isConfirmedOrder } from "@/lib/order-payment";
import { formatPaise } from "@/lib/pricing";
import type { Customer, Order, ShipTo } from "@/lib/types";
import { trackingUrl } from "@/lib/shiprocket";
import { isOutForDelivery, isReturnStatus, isUndelivered, trackingLabel } from "@/lib/tracking";

/**
 * Emails a customer when their order moves (client, 2026-09-17): shipped, out
 * for delivery, delivered, or cancelled — and, since 2026-09-18, alerts the
 * orders inbox about the same move (`alertAdmin`).
 *
 * **Called only on a real transition**, which the callers establish from the
 * locked row (`applyTrackingUpdate`, `setOrderStatus`) — never from what a
 * page or a webhook claimed the old status was. Couriers redeliver webhooks
 * and operators double-click; either would otherwise send the same email
 * twice.
 *
 * **Never throws.** The status change it reports is already committed, and a
 * mail provider being down must not turn that into an error — for a webhook it
 * would make Shiprocket retry, re-run the update, and find nothing changed.
 */
export async function notifyOrderUpdate(orderId: string, kind: OrderUpdateKind): Promise<void> {
  try {
    const order = await getOrderForAdmin(orderId);
    if (!order) return;
    const customer = await findCustomerById(order.customerId);

    /* The business hears of it whether or not the customer can be emailed. */
    await alertAdmin(order, customer, UPDATE_EVENTS[kind].event, UPDATE_EVENTS[kind].summary(order), trackingRows(order));

    if (!customer?.email) return;
    const latest = order.trackingEvents[0] ?? null;
    const result = await sendOrderUpdateMail({
      to: customer.email,
      name: customer.name,
      kind,
      orderNumber: order.orderNumber,
      orderUrl: orderUrl(order.id),
      trackingStatus:
        trackingLabel(order.trackingStatus) ??
        (kind === "delivered" ? "Delivered" : kind === "shipped" ? "In transit" : null),
      courierName: order.courierName,
      awb: order.awb,
      trackingUrl: order.awb ? trackingUrl(order.awb) : null,
      eta: order.trackingEta ? formatDay(order.trackingEta) : null,
      latest: latest
        ? {
            activity: latest.activity,
            location: latest.location,
            at: latest.at ? formatMoment(latest.at) : null,
          }
        : null,
      paid: order.paymentStatus === "paid",
    });
    if (!result.ok) console.error("[orders] update mail not sent:", order.orderNumber, kind);
  } catch (error) {
    console.error("[orders] update mail failed:", orderId, kind, error);
  }
}

/**
 * Which email, if any, a tracking change deserves. At most one per update,
 * the furthest along: a first webhook that already says "DELIVERED" sends the
 * delivered mail, not three.
 *
 * "Out for delivery", a failed attempt and a return are not among the order's
 * four statuses, so they are judged on the courier's words, each on the change
 * *into* that state — a failed attempt followed by another failed attempt is
 * one mail, but going out again the next day is a new out-for-delivery mail,
 * because it is a new day the customer needs to be home.
 */
export function mailForTrackingChange(change: TrackingChange): OrderUpdateKind | null {
  if (change.status === "cancelled") return null;
  if (change.status === "delivered" && change.previousStatus !== "delivered") return "delivered";
  if (change.status === "delivered") return null;
  const into = (test: (raw: string | null) => boolean) =>
    test(change.tracking) && !test(change.previousTracking);
  if (into(isReturnStatus)) return "returning";
  if (into(isUndelivered)) return "delivery_failed";
  if (into(isOutForDelivery)) return "out_for_delivery";
  if (change.status === "shipped" && change.previousStatus !== "shipped") return "shipped";
  return null;
}

function orderUrl(orderId: string): string {
  return `${site.url.replace(/\/$/, "")}/account/orders/${orderId}`;
}

// ---------------------------------------------------------------------------
// Alerts to the orders inbox (client, 2026-09-18) — EMAILS.md 17
// ---------------------------------------------------------------------------

/** What each order update is called in the admin alert, and what it asks of
 *  the operator — the customer's own email says something else, to them. */
const UPDATE_EVENTS: Record<OrderUpdateKind, { event: string; summary: (order: Order) => string }> = {
  shipped: {
    event: "Shipped",
    summary: () => "The courier has the parcel. The customer has been sent the tracking link.",
  },
  out_for_delivery: {
    event: "Out for delivery",
    summary: () => "The courier is delivering it today.",
  },
  delivery_failed: {
    event: "Delivery attempt failed",
    summary: () =>
      "The courier could not deliver it; the reason is below and the customer has been emailed. A call to arrange another attempt can save a return.",
  },
  returning: {
    event: "Being returned",
    summary: () =>
      "The courier is returning the parcel to us (RTO). The customer has been asked to call if they still want it. The order is not cancelled.",
  },
  delivered: {
    event: "Delivered",
    summary: () => "The courier reports it delivered.",
  },
  cancelled: {
    event: "Cancelled",
    summary: (order) =>
      order.paymentStatus === "paid" && order.refundedAmount < order.total
        ? `The order was cancelled. It was paid online and ${order.refundedAmount > 0 ? "only partly" : "not yet"} refunded — cancelling does not refund by itself; use Refund in /admin/orders.`
        : "The order was cancelled.",
  },
};

function paymentWords(order: Order): string {
  if (isCod(order)) return "Cash on delivery";
  if (order.paymentStatus === "paid") return "Paid online";
  if (order.paymentStatus === "refunded") return "Refunded";
  if (order.paymentStatus === "failed") return "Payment failed";
  return "Not yet paid";
}

function addressText(a: ShipTo): string {
  return [
    a.name,
    a.line1,
    a.line2,
    `${a.city}, ${a.state} ${a.postalCode}`,
    a.phone,
    a.gstin ? `GSTIN ${a.gstin}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** The courier's side of an order, for the tracking alerts. */
function trackingRows(order: Order): [string, string | null][] {
  const latest = order.trackingEvents[0] ?? null;
  return [
    ["Courier", order.awb ? `${order.courierName || "Courier"} · AWB ${order.awb}` : order.courierName],
    ["Courier status", order.trackingStatus],
    [
      "Latest scan",
      latest
        ? [latest.activity, latest.location, latest.at ? formatMoment(latest.at) : null]
            .filter(Boolean)
            .join(" · ")
        : null,
    ],
    ["Expected", order.trackingEta ? formatDay(order.trackingEta) : null],
    ["Deliver to", addressText(order.shipTo)],
  ];
}

/**
 * Sends one alert to the orders inbox: the event, the customer and how to
 * reach them, the money, then `rows`. The admin link only for an order
 * `/admin/orders` lists — an unpaid one is not there. Never throws.
 */
async function alertAdmin(
  order: Order,
  customer: Customer | null,
  event: string,
  summary: string,
  rows: [string, string | null][],
): Promise<void> {
  try {
    const result = await sendOrderActivityAlert({
      orderNumber: order.orderNumber,
      event,
      summary,
      details: [
        ["Customer", customer?.name || order.shipTo.name],
        ["Phone", order.shipTo.phone],
        ["Email", customer?.email],
        ["Total", formatPaise(order.total)],
        ["Payment", paymentWords(order)],
        ...rows,
      ],
      customerEmail: customer?.email ?? null,
      adminUrl: isConfirmedOrder(order)
        ? `${site.url.replace(/\/$/, "")}/admin/orders#order-${order.id}`
        : null,
    });
    if (!result.ok) console.error("[orders] admin alert not sent:", order.orderNumber, event);
  } catch (error) {
    console.error("[orders] admin alert failed:", order.orderNumber, event, error);
  }
}

/**
 * The customer changed an address on their order (2026-09-18) — delivery or
 * billing. Only for an order the business is acting on (`isConfirmedOrder`):
 * an unpaid one is not in `/admin/orders`, and its address matters once it is
 * paid, when the new-order alert carries it. Nothing is sent when nothing
 * actually changed. Never throws.
 */
export async function notifyAddressChanged(
  orderId: string,
  which: "delivery" | "billing",
  previous: ShipTo,
): Promise<void> {
  try {
    const order = await getOrderForAdmin(orderId);
    if (!order || !isConfirmedOrder(order)) return;
    const now = which === "delivery" ? order.shipTo : order.billTo;
    if (addressText(now) === addressText(previous)) return;
    const customer = await findCustomerById(order.customerId);
    const deadline = addressDeadline(order);

    await alertAdmin(
      order,
      customer,
      which === "delivery" ? "Delivery address changed" : "Billing address changed",
      which === "delivery"
        ? `The customer changed where this order goes.${deadline ? ` Book shipment opens at ${formatNoonDeadline(deadline.toISOString())}, after which it cannot change again.` : ""}`
        : "The customer changed who this order is billed to. Invoices use the current billing address.",
      [
        ["Was", addressText(previous)],
        ["Now", addressText(now)],
        ...(which === "delivery"
          ? ([
              [
                "Delivery",
                [order.deliveryService, order.courierName, order.shipping > 0 ? formatPaise(order.shipping) : null]
                  .filter(Boolean)
                  .join(" · "),
              ],
            ] as [string, string | null][])
          : []),
      ],
    );
  } catch (error) {
    console.error("[orders] address-change alert failed:", orderId, error);
  }
}

/**
 * Tells the business a new order is in (EMAILS.md A). Called once per order,
 * from the same places the customer's confirmation goes out: placement for
 * cash on delivery, the first successful payment for an online order. Never
 * throws.
 */
export async function notifyNewOrder(orderId: string): Promise<void> {
  try {
    const order = await getOrderForAdmin(orderId);
    if (!order) return;
    const customer = await findCustomerById(order.customerId);
    const to = order.shipTo;
    const result = await sendNewOrderAlert({
      orderNumber: order.orderNumber,
      total: formatPaise(order.total),
      payment:
        order.paymentStatus === "paid"
          ? "Paid online"
          : order.paymentProvider === "cod"
            ? "Cash on delivery"
            : "Not yet paid",
      customerName: customer?.name || to.name,
      customerEmail: customer?.email ?? "",
      phone: to.phone,
      deliverTo: [to.name, to.line1, to.line2, `${to.city}, ${to.state} ${to.postalCode}`]
        .filter(Boolean)
        .join("\n"),
      delivery:
        order.shipping > 0
          ? `${formatPaise(order.shipping)}${order.courierName ? ` · ${order.courierName}` : ""}`
          : "Not quoted — call to agree it",
      lines: order.items.map((item) => ({
        name: item.name,
        qty: item.qty,
        amount: formatPaise(item.lineTotal),
      })),
      adminUrl: `${site.url.replace(/\/$/, "")}/admin/orders#order-${order.id}`,
    });
    if (!result.ok) console.error("[orders] new-order alert not sent:", order.orderNumber);
  } catch (error) {
    console.error("[orders] new-order alert failed:", orderId, error);
  }
}

/** EMAILS.md B. The caller has already established this was the first
 *  failure (`markPaymentFailed` returned true). Never throws. */
export async function notifyPaymentFailed(orderId: string): Promise<void> {
  try {
    const order = await getOrderForAdmin(orderId);
    if (!order) return;
    const customer = await findCustomerById(order.customerId);
    await alertAdmin(
      order,
      customer,
      "Payment failed",
      "The customer's online payment did not go through. The order stays unpaid in their order history, with a Pay now button, and is not in /admin/orders until it is paid. A call may help.",
      [["Deliver to", addressText(order.shipTo)]],
    );
    if (!customer?.email) return;
    const result = await sendPaymentFailedMail({
      to: customer.email,
      name: customer.name,
      orderNumber: order.orderNumber,
      total: formatPaise(order.total),
      orderUrl: orderUrl(order.id),
    });
    if (!result.ok) console.error("[orders] payment-failed mail not sent:", order.orderNumber);
  } catch (error) {
    console.error("[orders] payment-failed mail failed:", orderId, error);
  }
}

/** EMAILS.md D. The caller has already established this refund is new
 *  (`recordRefund` returned a change). Never throws. */
export async function notifyRefund(change: RefundChange, refundId: string): Promise<void> {
  try {
    const order = await getOrderForAdmin(change.orderId);
    if (!order) return;
    const customer = await findCustomerById(order.customerId);
    await alertAdmin(
      order,
      customer,
      change.full ? "Refunded in full" : "Refund issued",
      `${formatPaise(change.amount)} is on its way back to the customer's payment method — 5–7 days to reach them. The customer has been emailed.`,
      [
        ["This refund", formatPaise(change.amount)],
        ["Refunded so far", `${formatPaise(change.refundedAmount)} of ${formatPaise(change.total)}`],
        ["Razorpay refund", refundId],
      ],
    );
    if (!customer?.email) return;
    const result = await sendRefundMail({
      to: customer.email,
      name: customer.name,
      orderNumber: order.orderNumber,
      orderUrl: orderUrl(order.id),
      amount: formatPaise(change.amount),
      refundedTotal: formatPaise(change.refundedAmount),
      orderTotal: formatPaise(change.total),
      full: change.full,
      refundId,
    });
    if (!result.ok) console.error("[orders] refund mail not sent:", order.orderNumber);
  } catch (error) {
    console.error("[orders] refund mail failed:", change.orderId, error);
  }
}

/* Fixed locale and zone: this runs on a server whose clock may be anywhere. */
function formatDay(day: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(`${day}T12:00:00+05:30`));
}

function formatMoment(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}
