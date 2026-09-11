"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { AlertIcon, SpinnerIcon } from "@/components/icons/ui";
import { Button } from "@/components/ui/Button";

/**
 * "Pay now" on an unpaid order.
 *
 * Razorpay's widget is a `<script>` from their CDN, loaded **here, on demand**
 * rather than site-wide. A farmer browsing the catalogue should not be
 * fetching a payment SDK; it is pulled the first time somebody actually
 * presses this button and cached by the browser thereafter.
 *
 * The flow, and where trust sits at each step:
 *
 *   1. POST `/api/payment/create` with an order id and nothing else. The
 *      server reads the amount from the database — this component never sends
 *      one, and could not be trusted with one.
 *   2. Open Razorpay's widget with what comes back. The card or UPI details
 *      are entered inside their iframe and never touch this page or our
 *      server.
 *   3. On success their handler gives us three values, which go to
 *      `/api/payment/verify` for the signature check.
 *   4. `router.refresh()` re-renders the order page from the server, so the
 *      status badge reflects the database rather than anything decided here.
 *
 * **A dismissed widget is not a failure.** People open it to look and close it
 * again; `ondismiss` returns the button to idle silently. The order stays
 * pending and payable, which is exactly the state it should be in.
 */

type CheckoutConfig = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  orderId: string;
  prefill: { name: string; email: string; contact: string };
};

type RazorpayHandlerResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayInstance = { open: () => void };

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

/** Loads the widget once and resolves on every later call. Two presses of the
 *  button must not inject two copies of the script. */
function loadRazorpay(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);

  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(Boolean(window.Razorpay)));
      existing.addEventListener("error", () => resolve(false));
      return;
    }

    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function PayNowButton({
  orderId,
  amountLabel,
}: {
  orderId: string;
  amountLabel: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pay = useCallback(async () => {
    setBusy(true);
    setError(null);

    try {
      const ready = await loadRazorpay();
      if (!ready) {
        setError(
          "Could not load the payment window. Check your connection and try again.",
        );
        setBusy(false);
        return;
      }

      const response = await fetch("/api/payment/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not start the payment. Please try again.");
        setBusy(false);
        return;
      }

      const config = (await response.json()) as CheckoutConfig;

      const razorpay = new window.Razorpay!({
        key: config.key,
        amount: config.amount,
        currency: config.currency,
        name: config.name,
        description: config.description,
        order_id: config.orderId,
        prefill: config.prefill,
        theme: { color: "#23703d" },
        handler: async (result: RazorpayHandlerResponse) => {
          try {
            const verify = await fetch("/api/payment/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                orderId,
                razorpayOrderId: result.razorpay_order_id,
                razorpayPaymentId: result.razorpay_payment_id,
                signature: result.razorpay_signature,
              }),
            });

            if (!verify.ok) {
              /* The money may well have been taken — Razorpay's widget said
                 so. What failed is our confirmation of it. Never tell someone
                 in that position that their payment failed; the webhook will
                 settle the order regardless, and the honest message is that
                 we are catching up. */
              setError(
                "Your payment went through, but we could not confirm it here. " +
                  "It will update shortly — if it does not, please call us.",
              );
              setBusy(false);
              return;
            }

            router.refresh();
          } catch {
            setError(
              "Your payment went through, but we could not confirm it here. " +
                "It will update shortly — if it does not, please call us.",
            );
            setBusy(false);
          }
        },
        modal: {
          /* Closing the widget is an ordinary thing to do, not an error. */
          ondismiss: () => setBusy(false),
        },
      });

      razorpay.open();
    } catch (err) {
      console.error("[pay] failed:", err);
      setError("Could not start the payment. Please try again.");
      setBusy(false);
    }
  }, [orderId, router]);

  return (
    <div>
      <Button
        type="button"
        onClick={pay}
        disabled={busy}
        size="lg"
        variant="accent"
        className="w-full"
      >
        {busy && <SpinnerIcon className="h-4 w-4" />}
        {busy ? "Opening payment…" : `Pay ${amountLabel} now`}
      </Button>

      {error && (
        <p
          role="alert"
          className="mt-3 flex items-start gap-2 border-l-2 border-red-600 bg-surface-subtle px-4 py-3 text-sm text-red-700"
        >
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
