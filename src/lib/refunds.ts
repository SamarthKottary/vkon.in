import type { Order } from "@/lib/types";

/**
 * Whether an order can be refunded from `/admin/orders`, and if not, why.
 *
 * One function, read by both the card (to show the button or the reason) and
 * `refundOrderAction` (to refuse). The action must not trust the button's
 * absence: the page may have been open since before the order changed.
 *
 * **Only a cancelled order is refunded here** (client, 2026-09-19: "show the
 * refund button only after the order has been cancelled"). Cancelling is the
 * decision; the refund follows it. Before this, a live order could be refunded
 * until its shipment was booked, which left an order both refunded and still
 * going out.
 *
 * **And never one that left with a courier**, even if cancelled or returned
 * later (`shippedAt`, or a shipped/delivered status): a returned parcel is
 * refunded in the Razorpay dashboard once it is back, and the
 * `refund.processed` webhook records it on the order.
 */
export type RefundBlock = "not_paid_online" | "fully_refunded" | "not_cancelled" | "dispatched";

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
  if (order.status !== "cancelled") return "not_cancelled";
  return null;
}

/** What the admin is told when a refund is blocked. */
export function refundBlockMessage(block: RefundBlock): string {
  switch (block) {
    case "not_cancelled":
      return "Refunds are made after cancelling. Set the order to Cancelled first — that also cancels a booked Shiprocket shipment — and the Refund button appears.";
    case "dispatched":
      return "This order has been dispatched, so it cannot be refunded from here. If it comes back as a return, refund it in the Razorpay dashboard; the refund is recorded here automatically.";
    case "fully_refunded":
      return "This order has already been refunded in full.";
    case "not_paid_online":
      return "This order has no online payment to refund.";
  }
}
