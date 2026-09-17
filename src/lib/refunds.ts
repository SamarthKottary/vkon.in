import type { Order } from "@/lib/types";

/**
 * Whether an order can be refunded from `/admin/orders`, and if not, why.
 *
 * One function, read by both the card (to show the button or the reason) and
 * `refundOrderAction` (to refuse). The action must not trust the button's
 * absence: the page may have been open since before a shipment was booked.
 *
 * **No refunds once a shipment is booked or the order is dispatched** (client,
 * 2026-09-17: "after book shipment/dispatched, we should not have refund
 * option"). A refund while goods are on their way means paying the money back
 * and delivering the goods.
 *
 * **One exception: a cancelled order that was never dispatched.** Customers may
 * cancel until dispatch (/terms), cancelling a booked order also cancels its
 * Shiprocket booking, and the cancellation email has already told them their
 * refund is on its way — so that refund has to stay possible here. Anything
 * that left with a courier (`shippedAt`, or a shipped/delivered status) stays
 * blocked even if cancelled or returned later; a returned order is refunded in
 * the Razorpay dashboard once the parcel is back, and the `refund.processed`
 * webhook records it on the order.
 */
export type RefundBlock =
  | "not_paid_online"
  | "fully_refunded"
  | "shipment_booked"
  | "dispatched";

export function refundBlock(order: Order): RefundBlock | null {
  const paidOnline =
    order.paymentProvider === "razorpay" &&
    Boolean(order.paymentId) &&
    (order.paymentStatus === "paid" || order.refundedAmount > 0);
  if (!paidOnline) return "not_paid_online";
  if (order.total - order.refundedAmount <= 0) return "fully_refunded";

  const dispatched =
    Boolean(order.shippedAt) || order.status === "shipped" || order.status === "delivered";
  if (dispatched) return "dispatched";
  if (order.shipmentId && order.status !== "cancelled") return "shipment_booked";
  return null;
}

/** What the admin is told when a refund is blocked for a fulfilment reason. */
export function refundBlockMessage(block: RefundBlock): string {
  switch (block) {
    case "shipment_booked":
      return "A shipment is booked for this order, so it cannot be refunded from here. To refund it, cancel the order first — that cancels the Shiprocket booking too — and the Refund button comes back.";
    case "dispatched":
      return "This order has been dispatched, so it cannot be refunded from here. If it comes back as a return, refund it in the Razorpay dashboard; the refund is recorded here automatically.";
    case "fully_refunded":
      return "This order has already been refunded in full.";
    case "not_paid_online":
      return "This order has no online payment to refund.";
  }
}
