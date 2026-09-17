"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertIcon, ArrowRightIcon, SpinnerIcon } from "@/components/icons/ui";
import { Button } from "@/components/ui/Button";
import { PaymentSuccessDialog } from "@/components/checkout/PaymentSuccessDialog";
import { formatPaise } from "@/lib/pricing";

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
 *
 * `compact` is the same button sized for a row in the order history (client,
 * 2026-09-17: "the pay now directs to payment in razor pay"), where it opens
 * the widget in place rather than sending anybody to the order page first.
 *
 * **Prices are rechecked before the widget opens.** An order holds the prices
 * it was placed at; if the catalogue has moved since, `/api/payment/create`
 * answers 409 `price_changed` instead of creating anything, and the dialog
 * below shows what changed. Continuing sends the total *the customer was just
 * shown* back as `acceptTotal`, and the server proceeds only if that still
 * equals what it computes — so nobody is ever charged a figure they did not
 * see. Cancelling writes nothing: the order keeps its old prices and stays
 * payable.
 */

type Money = { subtotal: number; cgst: number; sgst: number; shipping: number; total: number };

type PriceChange = {
  message: string;
  orderNumber?: string;
  previousTotal: number;
  newTotal: number;
  previous?: Money;
  next?: Money;
  lines?: {
    name: string;
    qty: number;
    wasUnitPrice: number;
    unitPrice: number;
    wasLineTotal: number;
    lineTotal: number;
    unavailable: boolean;
  }[];
};

type CheckoutConfig = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  /** Razorpay's id. */
  orderId: string;
  /** Ours, e.g. VK-0918-4F7A — named in the success dialog. */
  orderNumber: string;
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
export function loadRazorpay(): Promise<boolean> {
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
  compact = false,
}: {
  orderId: string;
  amountLabel: string;
  /** Row-sized, for the order history table and its cards. */
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priceChange, setPriceChange] = useState<PriceChange | null>(null);
  /** Set when a payment has just succeeded: `{ orderNumber, amountLabel }`. */
  const [paid, setPaid] = useState<{ orderNumber: string; amountLabel: string } | null>(null);

  const pay = useCallback(async (acceptTotal?: number) => {
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
        body: JSON.stringify(
          acceptTotal === undefined ? { orderId } : { orderId, acceptTotal },
        ),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as
          | ({ error?: string } & Partial<PriceChange>)
          | undefined;

        /* Prices moved since the order was placed. Ask, do not charge. */
        if (response.status === 409 && body?.error === "price_changed") {
          setPriceChange({
            message: body.message ?? "Prices have changed since this order was placed.",
            orderNumber: body.orderNumber,
            previousTotal: body.previousTotal ?? 0,
            newTotal: body.newTotal ?? 0,
            previous: body.previous,
            next: body.next,
            lines: body.lines ?? [],
          });
          setBusy(false);
          return;
        }

        setError(body?.error ?? "Could not start the payment. Please try again.");
        setBusy(false);
        return;
      }

      setPriceChange(null);

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

            /* Told before the page moves under them (client, 2026-09-18).
               The refresh waits until the dialog is dismissed, so the status
               badge and totals change once they have read it. */
            setPaid({
              orderNumber: config.orderNumber,
              amountLabel: formatPaise(config.amount),
            });
            setBusy(false);
          } catch {
            setError(
              "Your payment went through, but we could not confirm it here. " +
                "It will update shortly — if it does not, please call us.",
            );
            setBusy(false);
          }
        },
        modal: {
          /* Closing the widget is an ordinary thing to do, not an error. The
             refresh is for the case where accepting new prices rewrote the
             order a moment ago: the page should show what it now says. */
          ondismiss: () => {
            setBusy(false);
            router.refresh();
          },
        },
      });

      razorpay.open();
    } catch (err) {
      console.error("[pay] failed:", err);
      setError("Could not start the payment. Please try again.");
      setBusy(false);
    }
  }, [orderId, router]);

  const success = paid && (
    <PaymentSuccessDialog
      orderNumber={paid.orderNumber}
      amountLabel={paid.amountLabel}
      onClose={() => {
        setPaid(null);
        router.refresh();
      }}
    />
  );

  const dialog = priceChange && (
    <PriceChangeDialog
      change={priceChange}
      busy={busy}
      onCancel={() => setPriceChange(null)}
      onAccept={() => pay(priceChange.newTotal)}
    />
  );

  if (compact) {
    return (
      <span className="inline-flex flex-col items-end gap-1">
        {success}
        {dialog}
        <button
          type="button"
          onClick={() => pay()}
          disabled={busy}
          /* `w-36` matches the other row buttons, so the column has one edge. */
          className="inline-flex h-9 w-36 items-center justify-center gap-1.5 whitespace-nowrap border border-accent bg-accent text-xs font-semibold text-surface transition-colors hover:bg-accent-strong disabled:opacity-70"
        >
          {busy && <SpinnerIcon className="h-3.5 w-3.5" />}
          {busy ? "Opening…" : "Pay now"}
          {!busy && <ArrowRightIcon className="h-3.5 w-3.5" />}
        </button>
        {error && (
          <span role="alert" className="max-w-[15rem] text-right text-xs leading-snug text-red-700">
            {error}
          </span>
        )}
      </span>
    );
  }

  return (
    <div>
      {success}
      {dialog}
      <Button
        type="button"
        onClick={() => pay()}
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

/**
 * What this order costs now, before anything is charged.
 *
 * **The whole bill, not just the total.** Every line with its old and new
 * price, then subtotal, both GST lines and delivery, then the total — the same
 * order and the same wording as the order's own totals panel, so the customer
 * can check the new figure rather than take it on trust. A row that has not
 * moved (delivery, always; a line whose price held) shows one figure in the
 * "now" column and nothing in "was", so what changed stands out.
 *
 * Cancel is the default — Escape, the backdrop and the X all cancel — because
 * saying nothing must never mean "charge me more".
 */
function PriceChangeDialog({
  change,
  busy,
  onCancel,
  onAccept,
}: {
  change: PriceChange;
  busy: boolean;
  onCancel: () => void;
  onAccept: () => void;
}) {
  /* No `mounted` state: this renders only after a click, so `document` is
     there — and setting state in an effect is what §9 forbids. */
  const cancelRef = useRef(onCancel);
  useEffect(() => {
    cancelRef.current = onCancel;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const rose = change.newTotal > change.previousTotal;
  const difference = Math.abs(change.newTotal - change.previousTotal);
  const previous = change.previous;
  const next = change.next;
  const lines = change.lines ?? [];

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-6">
      <div aria-hidden onClick={onCancel} className="absolute inset-0 backdrop-blur-md" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="price-change-title"
        className="relative max-h-[92svh] w-full max-w-xl overflow-y-auto border border-line-strong bg-surface-raised p-5 text-left shadow-2xl sm:p-6"
      >
        <h2 id="price-change-title" className="text-xl font-semibold text-ink">
          {rose ? "This order costs more than when you placed it" : "This order costs less than when you placed it"}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-body">
          {rose
            ? `Our prices have gone up since you placed ${change.orderNumber ?? "this order"}, by ${formatPaise(difference)} in total. Nothing has been charged yet — here is what you would pay now.`
            : `Our prices have come down since you placed ${change.orderNumber ?? "this order"}, by ${formatPaise(difference)} in total. Nothing has been charged yet — here is what you would pay now.`}
        </p>

        <div className="mt-5 text-sm">
          <div className="flex items-baseline gap-4 border-b border-line pb-2">
            <span className="label-tech min-w-0 flex-1 text-muted">Item</span>
            <span className="label-tech w-24 text-right text-muted sm:w-28">When ordered</span>
            <span className="label-tech w-24 text-right text-muted sm:w-28">Now</span>
          </div>

          {lines.map((line) => (
            <Row
              key={`${line.name}-${line.qty}`}
              label={
                <>
                  {line.name}
                  <span className="text-muted"> × {line.qty}</span>
                  {line.unavailable && (
                    <span className="mt-0.5 block text-xs text-muted">
                      No longer in the catalogue — price unchanged
                    </span>
                  )}
                </>
              }
              was={line.wasLineTotal}
              now={line.lineTotal}
            />
          ))}

          {previous && next && (
            <div className="mt-1 border-t border-line pt-1">
              <Row label="Subtotal" was={previous.subtotal} now={next.subtotal} />
              <Row label="CGST 9%" was={previous.cgst} now={next.cgst} muted />
              <Row label="SGST 9%" was={previous.sgst} now={next.sgst} muted />
              <Row label="Delivery" was={previous.shipping} now={next.shipping} muted />
            </div>
          )}

          <div className="mt-1 flex items-baseline gap-4 border-t border-line pt-3">
            <span className="min-w-0 flex-1 font-bold text-ink">Total</span>
            <span className="w-24 text-right text-muted line-through tabular-nums sm:w-28">
              {formatPaise(change.previousTotal)}
            </span>
            <span className="w-24 text-right text-base font-bold tabular-nums text-accent sm:w-28">
              {formatPaise(change.newTotal)}
            </span>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button type="button" variant="accent" size="lg" onClick={onAccept} disabled={busy}>
            {busy && <SpinnerIcon className="h-4 w-4" />}
            {busy ? "Opening payment…" : `Pay ${formatPaise(change.newTotal)}`}
          </Button>
          <Button type="button" variant="outline" size="lg" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-muted">
          Cancel and nothing changes: the order stays as it is, at{" "}
          {formatPaise(change.previousTotal)}, and you can pay for it later. It is only
          updated to the new prices if you pay now.
        </p>
      </div>
    </div>,
    document.body,
  );
}

/** One line of the comparison. A figure that has not moved is shown once, in
 *  the "now" column, so the eye goes to the ones that have. */
function Row({
  label,
  was,
  now,
  muted = false,
}: {
  label: React.ReactNode;
  was: number;
  now: number;
  muted?: boolean;
}) {
  const changed = was !== now;
  return (
    <div className="flex items-baseline gap-4 border-b border-line py-2.5 last:border-b-0">
      <span className={`min-w-0 flex-1 ${muted ? "text-muted" : "text-ink"}`}>{label}</span>
      <span className="w-24 text-right tabular-nums text-muted sm:w-28">
        {changed ? <span className="line-through">{formatPaise(was)}</span> : ""}
      </span>
      <span
        className={`w-24 text-right tabular-nums sm:w-28 ${
          changed ? "font-semibold text-ink" : muted ? "text-muted" : "text-ink"
        }`}
      >
        {formatPaise(now)}
      </span>
    </div>
  );
}
