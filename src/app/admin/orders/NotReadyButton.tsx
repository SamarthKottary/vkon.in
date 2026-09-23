"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { SpinnerIcon } from "@/components/icons/ui";
import { unbookShipmentAction } from "../actions";

/**
 * **Not ready** on an order in Ready to ship (client, 2026-09-23).
 *
 * The parcel is booked and the courier has not been yet: this cancels it at
 * Shiprocket and puts the order back in **Confirmed** with its Book shipment
 * button, for when something is not actually ready to go out. It asks first —
 * the AWB is thrown away, and re-booking creates a new one — and the
 * confirmation says where the order lands, because "Not ready" alone does not.
 *
 * Same shape as the Confirm/Cancel buttons: a `<form>` posting a server
 * action, `useFormStatus` for the spinner, a `<noscript>` submit behind it.
 */
export function NotReadyButton({
  id,
  orderNumber,
  view,
}: {
  id: string;
  orderNumber: string;
  view: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={unbookShipmentAction} className="inline">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="view" value={view} />
      <Button
        orderNumber={orderNumber}
        onConfirm={() => formRef.current?.requestSubmit()}
      />
    </form>
  );
}

function Button({
  orderNumber,
  onConfirm,
}: {
  orderNumber: string;
  onConfirm: () => void;
}) {
  const { pending } = useFormStatus();

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (
            window.confirm(
              `Not ready moves order ${orderNumber} back to Confirmed and cancels the parcel at Shiprocket. The courier will not collect it, and booking again creates a new AWB. Continue?`,
            )
          ) {
            onConfirm();
          }
        }}
        className="inline-flex h-8 items-center gap-1.5 border border-line-strong px-2.5 text-xs font-medium text-ink transition-colors hover:border-ink hover:bg-surface-subtle disabled:opacity-50"
      >
        {pending && <SpinnerIcon className="h-3.5 w-3.5" />}
        Not ready
      </button>
      <noscript>
        <button
          type="submit"
          className="inline-flex h-8 items-center border border-line-strong px-2.5 text-xs font-medium text-ink"
        >
          Not ready
        </button>
      </noscript>
    </>
  );
}
