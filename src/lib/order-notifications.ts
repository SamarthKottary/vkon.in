import { site } from "@/content/site";
import { findCustomerById } from "@/lib/db/customers";
import { getOrderForAdmin, type TrackingChange } from "@/lib/db/orders";
import { sendOrderUpdateMail, type OrderUpdateKind } from "@/lib/mail";
import { trackingUrl } from "@/lib/shiprocket";
import { isOutForDelivery, trackingLabel } from "@/lib/tracking";

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
      orderUrl: `${site.url.replace(/\/$/, "")}/account/orders/${order.id}`,
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
 * "Out for delivery" is not one of the order's four statuses, so it is judged
 * on the courier's words — sent when the parcel goes out, and again if it goes
 * out again after a failed attempt, which is a new day the customer needs to
 * be home.
 */
export function mailForTrackingChange(change: TrackingChange): OrderUpdateKind | null {
  if (change.status === "cancelled") return null;
  if (change.status === "delivered" && change.previousStatus !== "delivered") return "delivered";
  if (change.status === "delivered") return null;
  if (isOutForDelivery(change.tracking) && !isOutForDelivery(change.previousTracking)) {
    return "out_for_delivery";
  }
  if (change.status === "shipped" && change.previousStatus !== "shipped") return "shipped";
  return null;
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
