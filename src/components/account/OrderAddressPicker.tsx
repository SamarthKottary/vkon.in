"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertIcon } from "@/components/icons/ui";
import { AddressDialog, AddressPicker } from "@/components/account/AddressPicker";
import { sameOrderAddress } from "@/components/account/OrderAddress";
import { OrderBillingDialog } from "@/components/account/OrderBillingDialog";
import { OrderDeliveryDialog, type OrderDelivery } from "@/components/account/OrderDeliveryDialog";
import { applySavedBillingAction } from "@/app/(site)/account/private-actions";
import type { Address, ShipTo } from "@/lib/types";

type Dialog =
  /** Edit the address the order has — saved back to the book when it came
   *  from there (`address`), order-only when it did not. */
  | { kind: "current"; address?: Address }
  /** A different saved address chosen for delivery: confirm, with the quote. */
  | { kind: "choose"; address: Address }
  /** A saved address that is not the order's: edit it in the book only. */
  | { kind: "book"; address: Address }
  | { kind: "new" };

/**
 * An order's billing or delivery address, as checkout's dropdown (client,
 * 2026-09-18: "like the drop down in checkout where we can choose other
 * address or edit … for shipping and delivery address as well").
 *
 * Closed, it shows the address **on the order** — the snapshot, which is what
 * the invoice and the courier use whether or not it is still in the address
 * book. Open, it lists the saved addresses with the one matching the order
 * ticked; if none matches, the order's own address is pinned first, "On this
 * order", so it can still be corrected without retyping it.
 *
 * What each thing does, and why they differ:
 *
 *  - **Choose, billing** — applied at once. Billing has no window and no money,
 *    so there is nothing to confirm, as at checkout.
 *  - **Choose, delivery** — opens the delivery dialog on that address, which
 *    shows what it does to delivery and the total before anything changes. A
 *    delivery address moves money on an unpaid order; one click must not.
 *  - **Edit the ticked address** — edits it and puts the result on the order,
 *    and updates the saved copy too, as editing the selected address at
 *    checkout changes what the order will use.
 *  - **Edit any other saved address** — the address book only, as at checkout;
 *    it does not become the order's address by being edited.
 *  - **Use a different address** — a new one, saved to the book and put on the
 *    order.
 *
 * The server re-checks everything — the delivery window, the payment state,
 * the quote — in `changeOrderAddressAction` and `changeOrderBillingAction`.
 */
export function OrderAddressPicker({
  role,
  orderId,
  current,
  addresses,
  delivery,
}: {
  role: "billing" | "delivery";
  orderId: string;
  /** The address on the order now. */
  current: ShipTo;
  addresses: Address[];
  /** Required for `role="delivery"`. */
  delivery?: OrderDelivery;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedId = addresses.find((a) => sameOrderAddress(a, current))?.id ?? "";
  const close = () => setDialog(null);

  const choose = (id: string) => {
    if (id === selectedId) return;
    const address = addresses.find((a) => a.id === id);
    if (!address) return;
    setError(null);
    if (role === "delivery") {
      setDialog({ kind: "choose", address });
      return;
    }
    startTransition(async () => {
      const result = await applySavedBillingAction({ orderId, addressId: id });
      if (result.status === "error") setError(result.message);
      else router.refresh();
    });
  };

  const edit = (address: Address) =>
    setDialog(address.id === selectedId ? { kind: "current", address } : { kind: "book", address });

  const noun = role === "billing" ? "billing" : "delivery";
  const title =
    dialog?.kind === "new"
      ? `New ${noun} address`
      : dialog?.kind === "choose"
        ? "Deliver to this address"
        : `Edit ${noun} address`;
  const saveLabel =
    dialog?.kind === "new" ? "Save and use" : dialog?.kind === "choose" ? "Use this address" : "Save address";

  let open: React.ReactNode = null;
  if (dialog?.kind === "book") {
    open = <AddressDialog address={dialog.address} onDone={close} onCancel={close} />;
  } else if (dialog) {
    /* What the form starts from, and which saved address (if any) the save
       also updates. A new address has neither and is added to the book; the
       order's own address, when it is not in the book, is edited on the
       order alone. */
    const { initial, bookAddressId }: { initial?: ShipTo; bookAddressId?: string } =
      dialog.kind === "new"
        ? {}
        : dialog.address
          ? { initial: dialog.address, bookAddressId: dialog.address.id }
          : { initial: current };
    const saveToBook = dialog.kind === "new" || Boolean(bookAddressId);
    open =
      role === "delivery" && delivery ? (
        <OrderDeliveryDialog
          key={`${dialog.kind}:${bookAddressId ?? ""}`}
          order={delivery}
          initial={initial}
          title={title}
          saveLabel={saveLabel}
          bookAddressId={bookAddressId}
          saveToBook={saveToBook}
          onClose={close}
        />
      ) : (
        <OrderBillingDialog
          key={`${dialog.kind}:${bookAddressId ?? ""}`}
          orderId={orderId}
          initial={initial}
          title={title}
          saveLabel={saveLabel}
          bookAddressId={bookAddressId}
          saveToBook={saveToBook}
          onClose={close}
        />
      );
  }

  return (
    <div>
      <AddressPicker
        addresses={addresses}
        selectedId={selectedId}
        group={`${orderId}-${role}`}
        onSelect={choose}
        onEdit={edit}
        onAdd={() => setDialog({ kind: "new" })}
        display={current}
        showGstin={role === "billing"}
        busy={pending}
        pinned={
          selectedId === ""
            ? {
                address: current,
                label: "On this order",
                onEdit: () => setDialog({ kind: "current" }),
              }
            : null
        }
      />
      {error && (
        <p role="alert" className="mt-2 flex items-start gap-2 text-sm text-red-700">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
      {open}
    </div>
  );
}
