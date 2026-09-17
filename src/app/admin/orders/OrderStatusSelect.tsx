"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { SpinnerIcon } from "@/components/icons/ui";
import { setOrderStatusAction } from "../actions";
import type { OrderStatus } from "@/lib/types";

/**
 * The status control on one order.
 *
 * A `<select>` that submits on change, with a real submit button behind it for
 * anyone without JavaScript — `requestSubmit()` rather than `submit()`, because
 * `submit()` bypasses React's form handling entirely and the server action
 * never runs.
 *
 * The value is re-validated in `setOrderStatusAction` against a fixed list.
 * Nothing here is a control; this is the convenient way to do it, not the
 * safe one.
 */

const OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

export function OrderStatusSelect({
  id,
  status,
  orderNumber,
}: {
  id: string;
  status: OrderStatus;
  orderNumber: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={setOrderStatusAction} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <label className="sr-only" htmlFor={`status-${id}`}>
        Status for order {orderNumber}
      </label>
      <select
        id={`status-${id}`}
        name="status"
        defaultValue={status}
        onChange={(event) => {
          /* Shipped, delivered and cancelled email the customer, and
             cancelling also cancels a booked Shiprocket shipment. Submitting
             on change made a slip of the mouse enough to send one, so those
             three ask first; a declined prompt puts the select back. */
          const next = event.currentTarget.value;
          const warning =
            next === "cancelled"
              ? `Cancel order ${orderNumber}? The customer will be emailed, and a booked Shiprocket shipment will be cancelled.`
              : next === "shipped" || next === "delivered"
                ? `Mark order ${orderNumber} as ${next}? The customer will be emailed.`
                : null;
          if (warning && !window.confirm(warning)) {
            event.currentTarget.value = status;
            return;
          }
          formRef.current?.requestSubmit();
        }}
        className="border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Pending />
    </form>
  );
}

/** Visible only while a change is in flight; the `<noscript>` fallback button
 *  is what makes the select usable without JavaScript. */
function Pending() {
  const { pending } = useFormStatus();

  return (
    <>
      {pending && <SpinnerIcon className="h-4 w-4 text-muted" />}
      <noscript>
        <button
          type="submit"
          className="border border-line-strong px-3 py-2 text-sm text-ink"
        >
          Save
        </button>
      </noscript>
    </>
  );
}
