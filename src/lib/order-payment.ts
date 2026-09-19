import type { Order } from "@/lib/types";

/**
 * How an order is paid, and whether it is a real order yet — the rules the
 * admin order list and the customer's order history share (client,
 * 2026-09-17).
 *
 * No server-only imports: `OrderHistoryTable` is a client component.
 */

type PaymentFields = Pick<
  Order,
  "paymentProvider" | "paymentStatus" | "refundedAmount" | "status"
> &
  Partial<Pick<Order, "refundPending">>;

export function isCod(order: Pick<Order, "paymentProvider">): boolean {
  return order.paymentProvider === "cod";
}

/** "COD" or "Online" — which way the customer chose to pay. */
export function paymentMethodLabel(order: Pick<Order, "paymentProvider">): "COD" | "Online" {
  return isCod(order) ? "COD" : "Online";
}

/**
 * Whether this is an order the business has to act on, and so belongs in
 * `/admin/orders`: cash on delivery from the moment it is placed; an online
 * order once it is paid (including one refunded or cancelled since).
 *
 * An online order that was never paid — the window closed, or the payment
 * failed — is not one. The customer still sees it in their order history,
 * and can pay for it from there.
 *
 * The last clause keeps orders from before online payment existed, which were
 * settled by phone and never marked paid: if the operator moved one past
 * pending, it was real.
 *
 * **`CONFIRMED_ORDER_SQL` below is the same rule for queries. Change both.**
 */
export function isConfirmedOrder(order: PaymentFields): boolean {
  return (
    isCod(order) ||
    order.paymentStatus === "paid" ||
    order.paymentStatus === "refunded" ||
    order.refundedAmount > 0 ||
    order.status === "confirmed" ||
    order.status === "shipped" ||
    order.status === "delivered"
  );
}

/** `isConfirmedOrder`, as a WHERE clause over `orders` (unaliased columns). */
export const CONFIRMED_ORDER_SQL = `(payment_provider = 'cod'
  OR payment_status IN ('paid', 'refunded')
  OR refunded_amount > 0
  OR status IN ('confirmed', 'shipped', 'delivered'))`;

/** An online order whose payment failed and has not been paid since. */
export function isPaymentFailed(order: PaymentFields): boolean {
  return !isCod(order) && order.paymentStatus === "failed";
}

export type PaymentTone = "ok" | "neutral" | "bad";

/**
 * The payment state in words. **Cash on delivery reads "COD"**, never
 * "Payment due" — nothing is overdue on an order the customer pays at the
 * door (client, 2026-09-17).
 */
export function paymentStateLabel(order: PaymentFields): { label: string; tone: PaymentTone } {
  if (isCod(order)) return { label: "COD", tone: "neutral" };
  /* Sent to Razorpay, not yet confirmed (2026-09-19) — "Refunded" would
     claim the money is back before it is. */
  if (order.refundPending) return { label: "Refund processing", tone: "neutral" };
  switch (order.paymentStatus) {
    case "paid":
      return { label: "Paid", tone: "ok" };
    case "refunded":
      return { label: "Refunded", tone: "neutral" };
    case "failed":
      return { label: "Payment failed", tone: "bad" };
    default:
      return { label: "Payment due", tone: "neutral" };
  }
}
