"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { SpinnerIcon } from "@/components/icons/ui";
import { confirmOrderAction, cancelOrderAction } from "../actions";

/**
 * Confirm and Cancel buttons for a pending order (2026-09-23).
 *
 * Replaces the status `<select>` while an order is in `pending` — the two
 * actions available at that stage are explicit decisions, not a dropdown slip.
 * The select is still rendered for confirmed/shipped/delivered/cancelled orders
 * so the operator can make manual corrections.
 *
 * Each button is its own `<form>` so they can post to different actions.
 * `useFormStatus` gives each a spinner while in flight. `window.confirm()`
 * guards Cancel; the `<noscript>` fallback submits directly, which is
 * acceptable for an admin-only tool.
 *
 * No client state to manage — the page re-renders from the server after the
 * redirect, same as the select did.
 */
export function PendingOrderActions({
  id,
  orderNumber,
  view,
  isCod,
}: {
  id: string;
  orderNumber: string;
  view: string;
  /** True for cash-on-delivery orders — affects the cancel confirmation copy. */
  isCod: boolean;
}) {
  const cancelFormRef = useRef<HTMLFormElement>(null);

  return (
    <div className="flex items-center gap-2">
      {/* Cancel — shown first */}
      <form ref={cancelFormRef} action={cancelOrderAction}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="view" value={view} />
        <CancelButton
          orderNumber={orderNumber}
          isCod={isCod}
          onConfirm={() => cancelFormRef.current?.requestSubmit()}
        />
      </form>

      {/* Confirm — shown second */}
      <form action={confirmOrderAction}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="view" value={view} />
        <ConfirmButton orderNumber={orderNumber} />
      </form>
    </div>
  );
}

function ConfirmButton({ orderNumber }: { orderNumber: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={`Confirm order ${orderNumber}`}
      className="inline-flex h-9 items-center gap-1.5 border border-accent bg-accent px-3 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
    >
      {pending && <SpinnerIcon className="h-3.5 w-3.5" />}
      Confirm
    </button>
  );
}

function CancelButton({
  orderNumber,
  isCod,
  onConfirm,
}: {
  orderNumber: string;
  isCod: boolean;
  onConfirm: () => void;
}) {
  const { pending } = useFormStatus();

  const warning = isCod
    ? `Cancel order ${orderNumber}? The customer will be emailed.`
    : `Cancel order ${orderNumber}? The customer will be emailed. If it was paid online, use Refund on the order afterwards — cancelling does not refund.`;

  return (
    <>
      <button
        type="button"
        disabled={pending}
        aria-label={`Cancel order ${orderNumber}`}
        onClick={() => {
          if (window.confirm(warning)) onConfirm();
        }}
        className="inline-flex h-9 items-center gap-1.5 border border-signal-600 bg-signal-600 px-3 text-sm font-medium text-white transition-colors hover:bg-signal-700 disabled:opacity-50"
      >
        {pending && <SpinnerIcon className="h-3.5 w-3.5" />}
        Cancel
      </button>
      {/* Without JS the button above is inert; this lets the form submit. */}
      <noscript>
        <button
          type="submit"
          className="inline-flex h-9 items-center border border-line-strong px-3 text-sm font-medium text-ink"
        >
          Cancel order
        </button>
      </noscript>
    </>
  );
}
