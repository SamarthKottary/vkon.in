"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { SpinnerIcon } from "@/components/icons/ui";
import { refundOrderAction } from "../actions";

/**
 * The Refund control on one paid order (client, 2026-09-17).
 *
 * A client component for two things only: a confirmation naming the amount
 * before real money is sent back, and a disabled button while Razorpay is
 * answering. Everything that matters — the amount limit, that the order was
 * paid online, one request at a time — is checked again in
 * `refundOrderAction`.
 *
 * The amount starts at what is left to refund, so a full refund is one press
 * and a confirmation; changing it makes a partial refund (the delivery charge
 * alone, say).
 */
export function RefundForm({
  id,
  orderNumber,
  remainingRupees,
}: {
  id: string;
  orderNumber: string;
  /** What is still unrefunded, as a plain rupee figure: "1424.04". */
  remainingRupees: string;
}) {
  const amountRef = useRef<HTMLInputElement>(null);

  return (
    <form
      action={refundOrderAction}
      onSubmit={(event) => {
        const amount = amountRef.current?.value.trim() || remainingRupees;
        const full = Number(amount) === Number(remainingRupees);
        const ok = window.confirm(
          `Refund ₹${amount} for order ${orderNumber}${full ? " (the full amount left)" : ""}?\n\n` +
            "The money goes back to the customer's original payment method through Razorpay, and they are emailed. This cannot be undone.",
        );
        if (!ok) event.preventDefault();
      }}
      className="mt-2.5 flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="id" value={id} />
      <label className="sr-only" htmlFor={`refund-${id}`}>
        Amount to refund for order {orderNumber}, in rupees
      </label>
      <span className="flex h-9 items-center border border-line-strong bg-surface text-sm focus-within:border-ink focus-within:ring-1 focus-within:ring-ink">
        <span aria-hidden className="pl-2.5 text-muted">
          ₹
        </span>
        <input
          ref={amountRef}
          id={`refund-${id}`}
          name="amount"
          inputMode="decimal"
          defaultValue={remainingRupees}
          required
          className="h-full w-28 bg-transparent px-1.5 tabular-nums text-ink focus:outline-none"
        />
      </span>
      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-9 items-center gap-2 border border-line-strong px-3 text-sm font-medium text-ink transition-colors hover:border-ink hover:bg-surface-subtle disabled:opacity-60"
    >
      {pending && <SpinnerIcon className="h-4 w-4" />}
      {pending ? "Refunding…" : "Refund"}
    </button>
  );
}
