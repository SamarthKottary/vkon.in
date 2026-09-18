"use client";

import { useRef, useState } from "react";
import { AlertIcon, PencilIcon } from "@/components/icons/ui";
import { AddressForm } from "@/components/account/AddressForm";
import { DeliveryPicker } from "@/components/checkout/DeliveryPicker";
import { Modal } from "@/components/ui/Modal";
import {
  changeOrderAddressAction,
  quoteOrderAddressAction,
  type OrderAddressQuote,
} from "@/app/(site)/account/private-actions";
import { serviceName } from "@/lib/order-delivery";
import { formatPaise, totals } from "@/lib/pricing";
import type { ShipTo } from "@/lib/types";

/** Indian PIN codes: six digits, never a leading zero. The server re-checks. */
const PIN = /^[1-9][0-9]{5}$/;

/**
 * "Edit" on an order's delivery address, and the pop-up it opens (client,
 * 2026-09-18).
 *
 * The page decides *whether* this renders (`addressEditWindow`); the server
 * decides again when it saves. This only draws the form and the delivery the
 * new address would get.
 *
 * **Delivery is re-quoted when the PIN code changes, not otherwise.** A new
 * house number on the same street costs the same to reach, so a typo fix
 * leaves the courier and the charge alone and makes no Shiprocket call. A new
 * PIN code is a new quote, and what it means depends on the money:
 *
 *  - **unpaid, online or COD** — the services on offer at their prices, as at
 *    checkout, and the total the order will have;
 *  - **paid** — the same service it paid for, with no choice and no new
 *    figure: "keep what they paid" (client, same day). The admin still needs
 *    a courier that serves the new PIN, which is why it is quoted at all.
 *
 * The quote is display only. The save quotes again and stores its own answer
 * — see `changeOrderAddressAction` — and a stale answer for a PIN code already
 * typed over is dropped by the sequence number, as in `CheckoutForm`.
 */
export function OrderAddressEditor({
  orderId,
  shipTo,
  cod,
  service,
  courierName,
  shipping,
  total,
  lineTotals,
}: {
  orderId: string;
  shipTo: ShipTo;
  cod: boolean;
  service: string | null;
  courierName: string | null;
  shipping: number;
  total: number;
  /** The order's own line totals, so a new total goes through `totals()`. */
  lineTotals: number[];
}) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState(shipTo.postalCode);
  const [quote, setQuote] = useState<{ pin: string; value: OrderAddressQuote } | null>(null);
  const [chosenId, setChosenId] = useState<number | null>(null);
  const seq = useRef(0);

  const close = () => {
    setOpen(false);
    setPin(shipTo.postalCode);
    setQuote(null);
    setChosenId(null);
    seq.current++;
  };

  /* Quoting from the change handler rather than an effect: it is the typing
     that asks the question, and §9 keeps state writes out of effects. */
  const onPostalCodeChange = (value: string) => {
    setPin(value);
    const ticket = ++seq.current;
    if (!PIN.test(value) || value === shipTo.postalCode) return;
    quoteOrderAddressAction({ orderId, postalCode: value })
      .then((result) => {
        if (ticket !== seq.current) return;
        setQuote({ pin: value, value: result });
        setChosenId(result.status === "quoted" ? result.chosenId : null);
      })
      .catch(() => {
        if (ticket === seq.current) setQuote({ pin: value, value: { status: "unavailable" } });
      });
  };

  const current = [service, courierName].filter(Boolean).join(" · ");
  const pinChanged = pin !== shipTo.postalCode;
  const answer = quote && quote.pin === pin ? quote.value : null;

  let delivery: React.ReactNode;
  if (!pinChanged) {
    delivery = (
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
  } else if (!PIN.test(pin)) {
    delivery = <p className="text-sm text-muted">Enter a six-digit PIN code to see delivery.</p>;
  } else if (!answer) {
    delivery = <p className="text-sm text-muted">Checking delivery to {pin}…</p>;
  } else if (answer.status === "no_courier") {
    delivery = (
      <p role="alert" className="flex items-start gap-2 text-sm text-red-700">
        <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
        We could not find a courier to deliver to {pin}. Please check the PIN code.
      </p>
    );
  } else if (answer.status === "unavailable") {
    delivery = <p className="text-sm text-muted">We will confirm delivery to {pin} on our call.</p>;
  } else if (answer.paid) {
    /* No figure on this row: today's rate to the new PIN is not what they
       paid, and a price here would read as a new charge. */
    const index = answer.options.findIndex((o) => o.courierId === answer.chosenId);
    const kept = answer.options[index];
    const name = serviceName(index, answer.options.length);
    delivery = (
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
  } else {
    const chosen = answer.options.find((o) => o.courierId === chosenId) ?? null;
    const next = chosen ? totals(lineTotals.map((lineTotal) => ({ lineTotal })), chosen.ratePaise) : null;
    delivery = (
      <div className="space-y-3">
        <DeliveryPicker
          options={answer.options}
          chosenId={chosenId}
          onChoose={setChosenId}
          group={`${orderId}-delivery`}
        />
        {chosenId !== null && <input type="hidden" name="courierId" value={chosenId} />}
        {next && next.total !== total && (
          <dl className="text-sm">
            <div className="flex items-baseline gap-4 border-b border-line py-2">
              <dt className="min-w-0 flex-1 text-body">Delivery</dt>
              <dd className="tabular-nums text-muted">
                <span className="line-through">{formatPaise(shipping)}</span>{" "}
                <span className="font-semibold text-ink">{formatPaise(next.shipping)}</span>
              </dd>
            </div>
            <div className="flex items-baseline gap-4 py-2">
              <dt className="min-w-0 flex-1 font-semibold text-ink">
                {cod ? "To pay on delivery" : "New total"}
              </dt>
              <dd className="tabular-nums text-muted">
                <span className="line-through">{formatPaise(total)}</span>{" "}
                <span className="text-base font-bold text-ink">{formatPaise(next.total)}</span>
              </dd>
            </div>
          </dl>
        )}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
      >
        <PencilIcon className="h-3.5 w-3.5" />
        Edit
      </button>

      {open && (
        <Modal title="Change delivery address" onClose={close} size="lg">
          <p className="-mt-1 mb-5 text-sm leading-relaxed text-muted">
            This changes where this order goes. Your saved addresses stay as they are.
          </p>
          <AddressForm
            compact
            initial={shipTo}
            action={changeOrderAddressAction}
            hiddenFields={{ orderId }}
            showDefault={false}
            onPostalCodeChange={onPostalCodeChange}
            saveLabel="Save address"
            onDone={close}
            onCancel={close}
          >
            <div className="border-t border-line pt-4">{delivery}</div>
          </AddressForm>
        </Modal>
      )}
    </>
  );
}
