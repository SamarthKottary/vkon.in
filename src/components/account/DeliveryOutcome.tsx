"use client";

import { useCallback, useRef, useState } from "react";
import { AlertIcon } from "@/components/icons/ui";
import { DeliveryPicker } from "@/components/checkout/DeliveryPicker";
import {
  quoteOrderAddressAction,
  type OrderAddressQuote,
} from "@/app/(site)/account/private-actions";
import { serviceName } from "@/lib/order-delivery";
import { formatPaise, totals } from "@/lib/pricing";
import type { ShipTo } from "@/lib/types";

/** Indian PIN codes: six digits, never a leading zero. The server re-checks. */
export const PIN = /^[1-9][0-9]{5}$/;

/** What the order's delivery is now — what a new address is compared against. */
export type OrderDelivery = {
  orderId: string;
  shipTo: ShipTo;
  cod: boolean;
  service: string | null;
  courierName: string | null;
  shipping: number;
  total: number;
  /** The order's own line totals, so a new total goes through `totals()`. */
  lineTotals: number[];
};

/**
 * Delivery quotes for an order moving to another PIN code (2026-09-18).
 *
 * `ask(pin)` fetches one; `answerFor(pin)` returns it only if it is for that
 * PIN, so an answer for a PIN already typed over — or an address already
 * un-chosen — reads as "still checking" rather than as the wrong figure. A
 * sequence number drops answers that arrive out of order, as in
 * `CheckoutForm`. State is written in the promise, never in an effect (§9).
 *
 * Display only: `changeOrderAddressAction` quotes again and stores its own.
 */
export function useDeliveryQuote(order: OrderDelivery) {
  const [quote, setQuote] = useState<{ pin: string; value: OrderAddressQuote } | null>(null);
  const [chosenId, setChosenId] = useState<number | null>(null);
  const seq = useRef(0);
  const { orderId } = order;
  const orderPin = order.shipTo.postalCode;

  const ask = useCallback(
    (pin: string) => {
      const ticket = ++seq.current;
      if (!PIN.test(pin) || pin === orderPin) return;
      quoteOrderAddressAction({ orderId, postalCode: pin })
        .then((result) => {
          if (ticket !== seq.current) return;
          setQuote({ pin, value: result });
          setChosenId(result.status === "quoted" ? result.chosenId : null);
        })
        .catch(() => {
          if (ticket === seq.current) setQuote({ pin, value: { status: "unavailable" } });
        });
    },
    [orderId, orderPin],
  );

  const answerFor = (pin: string) => (quote && quote.pin === pin ? quote.value : null);

  /** Whether an address in `pin` can be put on the order yet: the same PIN
   *  needs nothing, a new one needs an answer that is not "no courier". */
  const ready = (pin: string) => {
    if (pin === orderPin) return true;
    const answer = answerFor(pin);
    return Boolean(answer && answer.status !== "no_courier");
  };

  return { ask, answerFor, ready, chosenId, setChosenId };
}

/**
 * What putting an address in `pin` does to the order's delivery:
 *
 *  - **same PIN** — nothing; a typo fix costs the same to reach;
 *  - **unpaid, online or COD** — the services on offer at their prices, as at
 *    checkout, and the total the order will have;
 *  - **paid** — the same service it paid for, with no choice and no figure:
 *    "keep what they paid" (client, 2026-09-18). Today's rate to the new PIN
 *    is not shown, because it is not what they paid and would read as a new
 *    charge.
 *
 * `inForm` adds the hidden `courierId` input, for when this sits inside the
 * address form that posts it.
 */
export function DeliveryOutcome({
  order,
  pin,
  answer,
  chosenId,
  onChoose,
  inForm = false,
}: {
  order: OrderDelivery;
  pin: string;
  answer: OrderAddressQuote | null;
  chosenId: number | null;
  onChoose: (courierId: number) => void;
  inForm?: boolean;
}) {
  if (pin === order.shipTo.postalCode) {
    const current = [order.service, order.courierName].filter(Boolean).join(" · ");
    return (
      <p className="text-sm text-body">
        Same PIN code, so delivery stays as it is
        {current ? (
          <>
            : <span className="font-semibold text-ink">{current}</span>
          </>
        ) : null}
        .
      </p>
    );
  }
  if (!PIN.test(pin)) {
    return <p className="text-sm text-muted">Enter a six-digit PIN code to see delivery.</p>;
  }
  if (!answer) return <p className="text-sm text-muted">Checking delivery to {pin}…</p>;
  if (answer.status === "no_courier") {
    return (
      <p role="alert" className="flex items-start gap-2 text-sm text-red-700">
        <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
        We could not find a courier to deliver to {pin}. Please check the PIN code.
      </p>
    );
  }
  if (answer.status === "unavailable") {
    return <p className="text-sm text-muted">We will confirm delivery to {pin} on our call.</p>;
  }

  if (answer.paid) {
    const index = answer.options.findIndex((o) => o.courierId === answer.chosenId);
    const kept = answer.options[index];
    const name = serviceName(index, answer.options.length);
    return (
      <div className="space-y-2">
        <div className="flex w-full items-center gap-3 border border-line px-4 py-3 text-sm">
          <span className="w-16 shrink-0 text-muted">Delivery</span>
          <span className="min-w-0 flex-1 truncate font-semibold text-ink">
            {kept?.estimatedDays ? `${name}, ~${kept.estimatedDays} days` : name}
          </span>
          <span className="shrink-0 text-muted">Paid</span>
        </div>
        <p className="text-sm leading-relaxed text-body">
          You have already paid for delivery, so the new address does not change what you
          paid — it goes by the same service, {name}.
        </p>
      </div>
    );
  }

  const chosen = answer.options.find((o) => o.courierId === chosenId) ?? null;
  const next = chosen
    ? totals(order.lineTotals.map((lineTotal) => ({ lineTotal })), chosen.ratePaise)
    : null;
  return (
    <div className="space-y-3">
      <DeliveryPicker
        options={answer.options}
        chosenId={chosenId}
        onChoose={onChoose}
        group={`${order.orderId}-delivery`}
      />
      {inForm && chosenId !== null && <input type="hidden" name="courierId" value={chosenId} />}
      {next && next.total !== order.total && (
        <dl className="text-sm">
          <div className="flex items-baseline gap-4 border-b border-line py-2">
            <dt className="min-w-0 flex-1 text-body">Delivery</dt>
            <dd className="tabular-nums text-muted">
              <span className="line-through">{formatPaise(order.shipping)}</span>{" "}
              <span className="font-semibold text-ink">{formatPaise(next.shipping)}</span>
            </dd>
          </div>
          <div className="flex items-baseline gap-4 py-2">
            <dt className="min-w-0 flex-1 font-semibold text-ink">
              {order.cod ? "To pay on delivery" : "New total"}
            </dt>
            <dd className="tabular-nums text-muted">
              <span className="line-through">{formatPaise(order.total)}</span>{" "}
              <span className="text-base font-bold text-ink">{formatPaise(next.total)}</span>
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}
