"use client";

import { AddressForm } from "@/components/account/AddressForm";
import { Modal } from "@/components/ui/Modal";
import { changeOrderBillingAction } from "@/app/(site)/account/private-actions";
import type { ShipTo } from "@/lib/types";

/**
 * Putting an address on an order as its billing address — opened by
 * `OrderAddressPicker` to edit the one the order has or to add a new one
 * (client, 2026-09-18: billing "always" editable, "we will always generate
 * invoice using the current details"). Choosing a saved address needs no
 * dialog: it has no window and no money, so the picker applies it directly.
 *
 * The lighter sibling of `OrderDeliveryDialog`: no quote, no amount. Same
 * form and validation as the address book — the GSTIN checksum matters most
 * here, since this is who the tax invoice is made out to.
 */
export function OrderBillingDialog({
  orderId,
  initial,
  title,
  saveLabel,
  bookAddressId,
  saveToBook,
  onClose,
}: {
  orderId: string;
  /** Prefill; empty for a new address. */
  initial?: ShipTo;
  title: string;
  saveLabel: string;
  bookAddressId?: string;
  saveToBook: boolean;
  onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose} size="lg">
      <p className="-mt-1 mb-5 text-sm leading-relaxed text-muted">
        The invoice for this order is made out to this address. Delivery and the amount do
        not change.
        {saveToBook
          ? bookAddressId
            ? " Changes are saved to this address in your address book too."
            : " It is also added to your saved addresses."
          : " Your saved addresses stay as they are."}
      </p>
      <AddressForm
        compact
        initial={initial}
        action={changeOrderBillingAction}
        hiddenFields={{
          orderId,
          saveToBook: saveToBook ? "1" : "",
          bookAddressId: bookAddressId ?? "",
        }}
        showDefault={false}
        nameLabel="Bill to"
        saveLabel={saveLabel}
        onDone={onClose}
        onCancel={onClose}
      />
    </Modal>
  );
}
