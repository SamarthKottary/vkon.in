"use client";

import { useOptimistic, useState, useTransition } from "react";
import { AddressForm } from "@/components/account/AddressForm";
import { AddressDialog, AddressPicker } from "@/components/account/AddressPicker";
import { setDefaultAddressAction } from "@/app/(site)/account/private-actions";
import type { Address } from "@/lib/types";

/**
 * The saved addresses, in the same collapsed picker checkout uses.
 *
 * One list, used for both jobs: checkout picks a billing address and a shipping
 * address out of it rather than keeping two books. An address book with a
 * "billing" section and a "delivery" section makes the customer file the same
 * street twice and keep both up to date, and the distinction only exists at the
 * moment of ordering anyway — which is where it is asked.
 *
 * **What the radio chooses here is the default** (client, 2026-09-17: "apply
 * the same address design to my account page"). Checkout's picker selects the
 * address for an order; on this page there is no order, and the one choice an
 * address book has is which address checkout starts from. So the closed row
 * shows the default, and choosing another row in the list makes that one the
 * default — what the separate "Make default" button used to do. The cards had
 * a radio before this too, but it chose nothing: it only highlighted a card.
 *
 * The rows come from the page as a prop, and every mutation goes back through
 * an action that re-reads them, so what is on screen after a save is the
 * database's answer. The one exception is the radio while "make default" is in
 * flight: `useOptimistic` moves it at once and falls back to the prop when the
 * action settles, so a failed save puts it back rather than leaving a guess on
 * screen. The default-address rule itself stays transactional, in
 * `lib/db/addresses.ts`.
 */
export function AddressBook({ addresses }: { addresses: Address[] }) {
  const defaultId = addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? "";
  const [shownDefault, showDefault] = useOptimistic(defaultId);
  const [, startTransition] = useTransition();

  /** Which address the dialog is open on: an id, "new", or closed. */
  const [editing, setEditing] = useState<string | null>(null);
  const editingAddress = addresses.find((a) => a.id === editing);

  const makeDefault = (id: string) => {
    if (id === defaultId) return;
    startTransition(async () => {
      showDefault(id);
      const form = new FormData();
      form.set("id", id);
      await setDefaultAddressAction(form);
    });
  };

  if (addresses.length === 0) {
    /* Nothing to pick from, so the form is the section — as at checkout. No
       Cancel: there is nowhere to go back to. */
    return (
      <div className="max-w-2xl border border-line-strong bg-surface-raised p-5 shadow-card sm:p-6">
        <AddressForm />
      </div>
    );
  }

  return (
    /* `max-w-2xl`, the width checkout's address column is capped at, so the
       same list reads the same on both pages. */
    <div className="max-w-2xl">
      <AddressPicker
        addresses={addresses}
        selectedId={shownDefault}
        group="account-default-address"
        onSelect={makeDefault}
        onEdit={(address) => setEditing(address.id)}
        onAdd={() => setEditing("new")}
        addLabel="Add a new address"
        showGstin
      />

      {editing !== null && (
        <AddressDialog
          key={editing}
          address={editingAddress}
          onDone={() => setEditing(null)}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}
