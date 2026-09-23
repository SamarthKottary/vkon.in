"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { SpinnerIcon } from "@/components/icons/ui";

/**
 * Book shipment, with the wait narrated (client, 2026-09-23: "show
 * initializing then processing (Like loading) then we show message").
 *
 * The press talks to Shiprocket three times — create the order, assign a
 * courier, ask for the pickup — and on a bad line that is ten or fifteen
 * seconds of a button that looks stuck. So it reads **Initializing…** the
 * moment it is pressed and **Processing…** from a second and a half in, which
 * is roughly when the create call has landed and the slow part starts. The
 * outcome is the banner at the top of the page after the redirect.
 *
 * `useFormStatus` gives the pending flag, as on the Confirm/Cancel buttons.
 * The one piece of state here is set from a timer and cleared when the press
 * ends — never synchronously in the effect body, which is §9's rule and this
 * project's `set-state-in-effect` lint rule.
 */
export function BookShipmentButton() {
  const { pending } = useFormStatus();
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setProcessing(true), 1500);
    return () => {
      clearTimeout(timer);
      setProcessing(false);
    };
  }, [pending]);

  return (
    <button
      type="submit"
      disabled={pending}
      /* Announced rather than silently swapped: a screen reader would
         otherwise hear nothing at all for the whole wait. */
      aria-live="polite"
      className="inline-flex h-9 items-center gap-1.5 border border-accent bg-accent px-3 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
    >
      {pending && <SpinnerIcon className="h-3.5 w-3.5" />}
      {pending ? (processing ? "Processing…" : "Initializing…") : "Book shipment"}
    </button>
  );
}
