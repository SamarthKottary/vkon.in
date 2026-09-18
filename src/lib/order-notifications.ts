import { site } from "@/content/site";
import { findCustomerById } from "@/lib/db/customers";
import { getOrderForAdmin, type RefundChange, type TrackingChange } from "@/lib/db/orders";
import {
  sendNewOrderAlert,
  sendOrderUpdateMail,
  sendPaymentFailedMail,
  sendRefundMail,
  type OrderUpdateKind,
} from "@/lib/mail";
import { formatPaise } from "@/lib/pricing";
import { trackingUrl } from "@/lib/shiprocket";
import { isOutForDelivery, isReturnStatus, isUndelivered, trackingLabel } from "@/lib/tracking";

/**
 * Emails a customer when their order moves (client, 2026-09-17): shipped, out
 * for delivery, delivered, or cancelled.
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

/**
 * Tells the business a new order is in (EMAILS.md A). Called once per order,
 * from the same places the customer's confirmation goes out: placement for
 * cash on delivery, the first successful payment for an online order. Never
 * throws.
 *
 * **The only email the business gets about an order** (client, 2026-09-18:
 * "only new order mail is enough"). Alerts for every later event were built
 * the same day and removed on request; the operator follows an order in
 * `/admin/orders`.
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
