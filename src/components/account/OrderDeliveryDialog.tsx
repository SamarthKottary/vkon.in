"use client";

import { useEffect, useRef, useState } from "react";
import { AlertIcon } from "@/components/icons/ui";
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
 * Putting an address on an order as its delivery address — opened by
 * `OrderAddressPicker` for each way of doing it (client, 2026-09-18): choosing
 * a saved address, editing the one the order has, or adding a new one. The
 * form is prefilled with `initial` and stays editable in every case.
 *
 * **Delivery is quoted whenever the PIN code differs from the order's** — on
 * opening, for a chosen address somewhere else, and as the PIN is typed. A new
 * house number on the same street costs the same to reach, so a typo fix
 * leaves the courier and the charge alone and makes no Shiprocket call. What a
 * new PIN means depends on the money:
 *
 *  - **unpaid, online or COD** — the services on offer at their prices, as at
 *    checkout, and the total the order will have;
 *  - **paid** — the same service it paid for, with no choice and no figure:
 *    "keep what they paid" (client, same day). It is still quoted, because
 *    the admin needs a courier that serves the new PIN.
 *
 * The quote is display only. `changeOrderAddressAction` quotes again and
 * stores its own answer, and a stale answer for a PIN already typed over is
 * dropped by the sequence number, as in `CheckoutForm`.
 *
 * `bookAddressId` / `saveToBook` say what happens to the address book once the
 * order has taken the address: update that saved address, save a new one, or
 * (neither) leave the book alone.
 */
export function OrderDeliveryDialog({
  order,
  initial,
  title,
  saveLabel,
  bookAddressId,
  saveToBook,
  onClose,
}: {
  order: OrderDelivery;
  /** Prefill; empty for a new address. */
  initial?: ShipTo;
  title: string;
  saveLabel: string;
  bookAddressId?: string;
  saveToBook: boolean;
  onClose: () => void;
}) {
  const orderPin = order.shipTo.postalCode;
  const [pin, setPin] = useState(initial?.postalCode ?? "");
  const [quote, setQuote] = useState<{ pin: string; value: OrderAddressQuote } | null>(null);
  const [chosenId, setChosenId] = useState<number | null>(null);
  const seq = useRef(0);

  /** Asks for delivery to `value`; the answer is kept only if nothing newer
   *  was asked in the meantime. State is written in the promise, never in the
   *  body of an effect (§9). */
  const ask = (value: string) => {
    const ticket = ++seq.current;
    if (!PIN.test(value) || value === orderPin) return;
    quoteOrderAddressAction({ orderId: order.orderId, postalCode: value })
      .then((result) => {
        if (ticket !== seq.current) return;
        setQuote({ pin: value, value: result });
        setChosenId(result.status === "quoted" ? result.chosenId : null);
      })
      .catch(() => {
        if (ticket === seq.current) setQuote({ pin: value, value: { status: "unavailable" } });
      });
  };

  /* A saved address chosen from the list may be in another PIN code: quote it
     straight away, so the dialog opens on what the change would mean. Once,
     on opening; after that the typing asks. */
  const initialPin = useRef(initial?.postalCode ?? "");
  const askRef = useRef(ask);
  useEffect(() => {
    askRef.current(initialPin.current);
  }, []);

  const onPostalCodeChange = (value: string) => {
    setPin(value);
    ask(value);
  };

  const current = [order.service, order.courierName].filter(Boolean).join(" · ");
  const pinChanged = pin !== orderPin;
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
    const next = chosen
      ? totals(order.lineTotals.map((lineTotal) => ({ lineTotal })), chosen.ratePaise)
      : null;
    delivery = (
      <div className="space-y-3">
        <DeliveryPicker
          options={answer.options}
          chosenId={chosenId}
          onChoose={setChosenId}
          group={`${order.orderId}-delivery`}
        />
        {chosenId !== null && <input type="hidden" name="courierId" value={chosenId} />}
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

  return (
    <Modal title={title} onClose={onClose} size="lg">
      <p className="-mt-1 mb-5 text-sm leading-relaxed text-muted">
        This order will be delivered here.
        {saveToBook
          ? bookAddressId
            ? " Changes are saved to this address in your address book too."
            : " It is also added to your saved addresses."
          : " Your saved addresses stay as they are."}
      </p>
      <AddressForm
        compact
        initial={initial}
        action={changeOrderAddressAction}
        hiddenFields={{
          orderId: order.orderId,
          saveToBook: saveToBook ? "1" : "",
          bookAddressId: bookAddressId ?? "",
        }}
        showDefault={false}
        onPostalCodeChange={onPostalCodeChange}
        saveLabel={saveLabel}
        onDone={onClose}
        onCancel={onClose}
      >
        <div className="border-t border-line pt-4">{delivery}</div>
      </AddressForm>
    </Modal>
  );
}
