"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertIcon, ArrowRightIcon, PencilIcon, PlusIcon, SpinnerIcon, TrashIcon } from "@/components/icons/ui";
import { AddressForm } from "@/components/account/AddressForm";
import { AddressLines } from "@/components/account/AddressPicker";
import { EditCountdown, useTimeLeft } from "@/components/account/EditCountdown";
import { sameOrderAddress } from "@/components/account/OrderAddress";
import {
  DeliveryOutcome,
  useDeliveryQuote,
  type OrderDelivery,
} from "@/components/account/DeliveryOutcome";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import {
  applySavedBillingAction,
  changeOrderAddressAction,
  changeOrderBillingAction,
  deleteAddressAction,
} from "@/app/(site)/account/private-actions";
import type { Address, ShipTo } from "@/lib/types";

/** The order's own address, when it is not one of the saved ones. */
const ON_ORDER = "__on-order";

type View =
  | { kind: "list" }
  /** `address` is a saved one; `onOrder` the order's own; neither is new. */
  | { kind: "form"; address?: Address; onOrder?: boolean };

/**
 * "Edit" on an order's billing or delivery address, and the pop-up it opens
 * (client, 2026-09-18: "show an edit button … it pops up like the edit, but we
 * see the multiple addresses and add an address button like in the checkout
 * … we should be able to scroll among the multiple addresses, then when we
 * click edit again we can change").
 *
 * **Two views in one pop-up.** The list: every saved address with a radio,
 * the one on the order marked "On this order" (and pinned first when it is
 * not saved at all), Edit and Delete under each, "Add an address" beneath,
 * scrolling inside the pop-up so the buttons stay in view. Edit or Add swaps
 * the list for the address form; Cancel on the form goes back to the list.
 *
 * **What each action does:**
 *
 *  - **Choose + "Use this address"** puts that saved address on the order.
 *    For delivery, the list shows what it does to delivery first — the
 *    services and new total if unpaid, the kept service if paid — and the
 *    button waits for that answer (`useDeliveryQuote`).
 *  - **Edit, then "Save and use"** saves the edited address and puts it on the
 *    order: a saved address is updated in the book too; the order's own
 *    address, when it is not saved, is changed on the order only.
 *  - **Add an address** saves a new one to the book and uses it.
 *
 * **Both addresses share one window** (client, 2026-09-18): open while the
 * order is unpaid, then until 12 pm the day after it was confirmed — the page
 * hides the button after that, and the pop-up counts down to it
 * (`EditCountdown`).
 *
 * The server re-checks all of it: the window, the payment state and the quote
 * in `changeOrderAddressAction` / `changeOrderBilling`; ownership everywhere.
 */
export function OrderAddressEdit({
  role,
  orderId,
  current,
  addresses,
  delivery,
  until,
  label = "Edit",
}: {
  role: "billing" | "delivery";
  orderId: string;
  /** The address on the order now. */
  current: ShipTo;
  addresses: Address[];
  /** Required for `role="delivery"`. */
  delivery?: OrderDelivery;
  /** When the window closes (ISO), or null while the order is unpaid — from
   *  `addressEditWindow`, shown as a countdown in the pop-up. */
  until: string | null;
  /** The button's words — "Edit billing" where two share a card. */
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>({ kind: "list" });
  const [selected, setSelected] = useState("");
  const [formPin, setFormPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  /* Ticks only while the pop-up is open: the hook's timer starts with it. */
  const msLeft = useTimeLeft(open ? until : null);
  const countdown = <EditCountdown until={until} msLeft={msLeft} />;
  const quote = useDeliveryQuote(
    delivery ?? {
      orderId,
      shipTo: current,
      cod: false,
      service: null,
      courierName: null,
      shipping: 0,
      total: 0,
      lineTotals: [],
    },
  );

  const isDelivery = role === "delivery" && Boolean(delivery);
  const matchedId = addresses.find((a) => sameOrderAddress(a, current))?.id ?? null;
  const onOrderId = matchedId ?? ON_ORDER;
  /* The address on the order first, so the pop-up opens on what is there
     now; then the default, then the rest as the book lists them — checkout's
     order after that. */
  const saved = [...addresses].sort(
    (a, b) =>
      Number(b.id === matchedId) - Number(a.id === matchedId) ||
      Number(b.isDefault) - Number(a.isDefault),
  );
  const rows: { id: string; address: ShipTo & { isDefault?: boolean }; saved: Address | null }[] = [
    ...(matchedId ? [] : [{ id: ON_ORDER, address: current, saved: null }]),
    ...saved.map((a) => ({ id: a.id, address: a, saved: a })),
  ];
  /* A deleted row falls back to the order's own address. */
  const chosen = rows.find((r) => r.id === selected) ?? rows.find((r) => r.id === onOrderId) ?? null;
  const chosenPin = chosen?.address.postalCode ?? current.postalCode;
  const changing = Boolean(chosen && chosen.id !== onOrderId);

  const finish = () => {
    setOpen(false);
    router.refresh();
  };

  const start = () => {
    setView({ kind: "list" });
    setSelected(onOrderId);
    setError(null);
    setOpen(true);
  };

  const choose = (id: string) => {
    setSelected(id);
    setError(null);
    const row = rows.find((r) => r.id === id);
    if (isDelivery && row) quote.ask(row.address.postalCode);
  };

  const edit = (row: (typeof rows)[number]) => {
    const pin = row.address.postalCode;
    setFormPin(pin);
    if (isDelivery) quote.ask(pin);
    setError(null);
    setView(row.saved ? { kind: "form", address: row.saved } : { kind: "form", onOrder: true });
  };

  const add = () => {
    setFormPin("");
    setError(null);
    setView({ kind: "form" });
  };

  /** "Use this address" on the list. */
  const use = () => {
    if (!chosen?.saved) return;
    const address = chosen.saved;
    setError(null);
    startTransition(async () => {
      if (!isDelivery) {
        const result = await applySavedBillingAction({ orderId, addressId: address.id });
        if (result.status === "error") setError(result.message);
        else finish();
        return;
      }
      /* The same action the form posts to, fed the saved address — one place
         decides what a delivery change does to the order. */
      const form = new FormData();
      for (const key of ["name", "phone", "line1", "line2", "city", "state", "postalCode", "gstin"] as const) {
        form.set(key, String(address[key] ?? ""));
      }
      form.set("orderId", orderId);
      if (quote.chosenId !== null && chosenPin !== current.postalCode) {
        form.set("courierId", String(quote.chosenId));
      }
      const result = await changeOrderAddressAction({ status: "idle" }, form);
      if (result.status === "ok") finish();
      else setError(result.message ?? "Could not change the address just now. Please try again.");
    });
  };

  const noun = role === "billing" ? "billing" : "delivery";
  const title =
    view.kind === "list"
      ? `Change ${noun} address`
      : view.address || view.onOrder
        ? `Edit ${noun} address`
        : `New ${noun} address`;

  let body: React.ReactNode;
  if (view.kind === "form") {
    const initial = view.address ?? (view.onOrder ? current : undefined);
    const saveToBook = !view.onOrder;
    body = (
      <>
        <div className="-mt-1 mb-4 flex items-start justify-between gap-4">
          <button
            type="button"
            onClick={() => setView({ kind: "list" })}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
          >
            <ArrowRightIcon className="h-3.5 w-3.5 rotate-180" />
            Back to addresses
          </button>
          {countdown}
        </div>
        <p className="mb-5 text-sm leading-relaxed text-muted">
          {view.onOrder
            ? "This changes the address on this order only."
            : view.address
              ? "Saving updates this address in your address book and uses it for this order."
              : "It is saved to your address book and used for this order."}
        </p>
        <AddressForm
          key={view.address?.id ?? (view.onOrder ? ON_ORDER : "new")}
          compact
          initial={initial}
          action={isDelivery ? changeOrderAddressAction : changeOrderBillingAction}
          hiddenFields={{
            orderId,
            saveToBook: saveToBook ? "1" : "",
            bookAddressId: view.address?.id ?? "",
          }}
          showDefault={false}
          nameLabel={role === "billing" ? "Bill to" : undefined}
          onPostalCodeChange={
            isDelivery
              ? (value) => {
                  setFormPin(value);
                  quote.ask(value);
                }
              : undefined
          }
          saveLabel="Save and use"
          onDone={finish}
          onCancel={() => setView({ kind: "list" })}
        >
          {isDelivery && delivery && (
            <div className="border-t border-line pt-4">
              <DeliveryOutcome
                order={delivery}
                pin={formPin}
                answer={quote.answerFor(formPin)}
                chosenId={quote.chosenId}
                onChoose={quote.setChosenId}
                inForm
              />
            </div>
          )}
        </AddressForm>
      </>
    );
  } else {
    const canUse =
      changing &&
      Boolean(chosen?.saved) &&
      (!isDelivery || quote.ready(chosenPin)) &&
      !pending &&
      msLeft !== 0;
    body = (
      <>
        <p className="-mt-1 mb-4 text-sm leading-relaxed text-muted">
          {role === "billing"
            ? "Choose who this order is billed to, or edit an address. The invoice uses the address on the order."
            : "Choose where this order goes, or edit an address."}
        </p>

        {/* Scrolls inside the pop-up, so "Add an address" and the buttons stay
            in view however many addresses there are. */}
        <ul className="max-h-[45vh] divide-y divide-line overflow-y-auto overscroll-contain border border-line">
          {rows.map((row) => {
            const isChosen = chosen?.id === row.id;
            return (
              <li
                key={row.id}
                className={`px-4 py-4 transition-colors ${isChosen ? "bg-accent-soft/50" : "hover:bg-surface-subtle"}`}
              >
                <label className="flex min-w-0 cursor-pointer items-start gap-3">
                  <input
                    type="radio"
                    name={`${orderId}-${role}-address`}
                    checked={isChosen}
                    onChange={() => choose(row.id)}
                    className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                  />
                  <span className="min-w-0 flex-1">
                    <AddressLines
                      address={row.address}
                      showGstin={role === "billing"}
                      withPhone
                      tag={row.id === onOrderId ? "On this order" : undefined}
                    />
                  </span>
                </label>
                {/* `pl-7`: the radio's 16px and the 12px gap, so the buttons
                    start where the name does. Outside the label, which would
                    otherwise forward the click to the radio. */}
                <div className="mt-2.5 flex items-center gap-5 pl-7 text-sm">
                  <button
                    type="button"
                    onClick={() => edit(row)}
                    className="flex items-center gap-1.5 text-accent hover:underline"
                  >
                    <PencilIcon className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  {row.saved && (
                    <form
                      action={deleteAddressAction}
                      onSubmit={(event) => {
                        if (!window.confirm(`Delete the address for ${row.address.name}?`)) {
                          event.preventDefault();
                        }
                      }}
                    >
                      <input type="hidden" name="id" value={row.saved.id} />
                      <button
                        type="submit"
                        className="flex items-center gap-1.5 text-muted hover:text-red-700"
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          onClick={add}
          className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-accent hover:underline"
        >
          <PlusIcon className="h-4 w-4" />
          Add an address
        </button>

        {isDelivery && delivery && changing && (
          <div className="mt-4 border-t border-line pt-4">
            <DeliveryOutcome
              order={delivery}
              pin={chosenPin}
              answer={quote.answerFor(chosenPin)}
              chosenId={quote.chosenId}
              onChoose={quote.setChosenId}
            />
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="mt-4 flex items-start gap-2 border-l-2 border-red-600 bg-surface-subtle px-4 py-3 text-sm text-red-700"
          >
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        {/* The countdown sits at the right of the buttons (client's mark-up,
            2026-09-18), and drops under them on a phone. */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button type="button" variant="accent" size="lg" onClick={use} disabled={!canUse} className="min-w-36">
            {pending && <SpinnerIcon className="h-4 w-4" />}
            {pending ? "Saving…" : "Use this address"}
          </Button>
          <Button type="button" variant="outline" size="lg" onClick={() => setOpen(false)} className="min-w-36">
            Cancel
          </Button>
          <div className="ml-auto">{countdown}</div>
        </div>
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={start}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
      >
        <PencilIcon className="h-3.5 w-3.5" />
        {label}
      </button>

      {open && (
        /* The X, Escape and the backdrop step back one level, like the form's
           Cancel: out of the edit form to the list, and only from the list
           out of the pop-up (client, 2026-09-18 — the X used to throw away
           the list as well). */
        <Modal
          title={title}
          onClose={() => (view.kind === "form" ? setView({ kind: "list" }) : setOpen(false))}
          size="lg"
        >
          {body}
        </Modal>
      )}
    </>
  );
}
