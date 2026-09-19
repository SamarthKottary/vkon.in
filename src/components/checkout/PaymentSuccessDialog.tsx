"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

/**
 * "Payment successful" (client, 2026-09-18).
 *
 * Shown by whichever path took the money: `PayNowButton` the moment its
 * verification returns, and the order page on arrival from checkout. Both go
 * through here so the two say the same thing.
 *
 * **It never claims more than is known.** It says the payment went through and
 * names the amount and the order; it does not promise dispatch dates, and it
 * no longer promises a call to confirm the details (client, 2026-09-18) —
 * nothing in the system places that call, so it was a promise the site could
 * not keep. It names the order **confirmation**, which `/api/payment/verify`
 * and the webhook send (EMAILS.md 5) — not a receipt: the site stopped
 * sending its own payment receipt on 2026-09-19; Razorpay's is theirs.
 *
 * **Figures in a column, not in a sentence** (client: "properly align this").
 * The green tick that used to sit beside the text is gone with it: it indented
 * every paragraph past the panel's edge while the button below stayed at it,
 * so nothing in the dialog lined up with anything else, and the heading
 * already says the payment succeeded.
 */
export function PaymentSuccessDialog({
  orderNumber,
  amountLabel,
  email,
  orderHref,
  onClose,
}: {
  orderNumber: string;
  amountLabel: string;
  /** Where the confirmation is going, when the page knows it. */
  email?: string;
  /** Shown as a link when the customer is not already on the order's page. */
  orderHref?: string;
  onClose: () => void;
}) {
  return (
    <Modal title="Payment successful" onClose={onClose}>
      <dl className="text-sm">
        <div className="flex items-baseline gap-4 border-b border-line py-2.5">
          <dt className="min-w-0 flex-1 text-body">Amount paid</dt>
          <dd className="whitespace-nowrap text-right text-base font-bold tabular-nums text-ink">
            {amountLabel}
          </dd>
        </div>
        <div className="flex items-baseline gap-4 py-2.5">
          <dt className="min-w-0 flex-1 text-body">Order</dt>
          <dd className="whitespace-nowrap text-right font-mono font-semibold text-ink">
            {orderNumber}
          </dd>
        </div>
      </dl>

      <p className="mt-2 text-sm leading-relaxed text-body">
        Your order confirmation is on its way{email ? ` to ${email}` : ""}.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button type="button" variant="accent" size="lg" onClick={onClose} className="min-w-36">
          Done
        </Button>
        {orderHref && (
          <Link href={orderHref} className="text-sm font-medium text-accent hover:underline">
            View this order
          </Link>
        )}
      </div>
    </Modal>
  );
}
