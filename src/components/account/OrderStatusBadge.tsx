import type { OrderStatus, PaymentStatus } from "@/lib/types";

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

const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  unpaid: "Payment due",
  paid: "Paid",
  failed: "Payment failed",
  refunded: "Refunded",
};

const PAYMENT_TONE: Record<PaymentStatus, string> = {
  unpaid: "border-line-strong text-muted",
  paid: "border-accent text-accent",
  failed: "border-red-300 text-red-700",
  refunded: "border-line-strong text-muted",
};

export function OrderStatusBadge({
  status,
  paymentStatus,
}: {
  status: OrderStatus;
  paymentStatus: PaymentStatus;
}) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span
        className={`inline-flex items-center border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${ORDER_TONE[status] ?? ORDER_TONE.pending}`}
      >
        {ORDER_LABEL[status] ?? status}
      </span>
      <span
        className={`inline-flex items-center border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${PAYMENT_TONE[paymentStatus] ?? PAYMENT_TONE.unpaid}`}
      >
        {PAYMENT_LABEL[paymentStatus] ?? paymentStatus}
      </span>
    </span>
  );
}
