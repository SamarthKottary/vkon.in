import {
  isCod,
  isPaymentFailed,
  paymentStateLabel,
  type PaymentTone,
} from "@/lib/order-payment";
import type { Order, OrderStatus } from "@/lib/types";

/**
 * The two states of an order, side by side.
 *
 * They are separate because they genuinely can disagree — an order can be
 * confirmed and unpaid (agreed on the phone, paid on delivery), or paid and
 * not yet shipped. Collapsing them into one word is how a customer ends up
 * being told "pending" about an order they have already paid for.
 *
 * Colours come from the palette rather than raw Tailwind steps, per §9 —
 * `bg-red-*` appears here only where the admin's danger button already uses
 * it, and it is a border-and-text pair rather than a fill, so it holds in both
 * themes.
 */

const ORDER_LABEL: Record<OrderStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const ORDER_TONE: Record<OrderStatus, string> = {
  pending: "border-line-strong text-muted",
  confirmed: "border-accent text-accent",
  shipped: "border-accent text-accent",
  delivered: "border-accent bg-accent-soft text-ink",
  cancelled: "border-red-300 text-red-700",
};

const PAYMENT_TONE: Record<PaymentTone, string> = {
  ok: "border-accent text-accent",
  neutral: "border-line-strong text-muted",
  bad: "border-red-300 text-red-700",
};

/**
 * Two badges — the order's progress and how it is paid — with two exceptions
 * (client, 2026-09-17):
 *
 *  - **A failed online payment is one badge, "Payment failed".** "Pending ·
 *    Payment failed" reads as though the order were progressing; it is not,
 *    until the customer pays.
 *  - **Cash on delivery reads "COD"**, not "Payment due": nothing is overdue on
 *    an order paid at the door.
 */
export function OrderStatusBadge({
  order,
}: {
  order: Pick<Order, "status" | "paymentStatus" | "paymentProvider" | "refundedAmount">;
}) {
  const { status } = order;
  const payment = paymentStateLabel(order);
  const failedOnly = isPaymentFailed(order) && status === "pending";

  return (
    <span className="flex flex-wrap items-center gap-2">
      {!failedOnly && (
        <span
          className={`inline-flex items-center border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${ORDER_TONE[status] ?? ORDER_TONE.pending}`}
        >
          {ORDER_LABEL[status] ?? status}
        </span>
      )}
      <span
        className={`inline-flex items-center border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${PAYMENT_TONE[payment.tone]}`}
      >
        {isCod(order) || failedOnly ? payment.label : `Online · ${payment.label}`}
      </span>
    </span>
  );
}
